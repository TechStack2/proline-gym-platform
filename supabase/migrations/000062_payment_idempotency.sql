-- ============================================================
-- OFF-3 — payment idempotency key (offline-recorded payments)
--
-- The front desk can now record cash/OMT/Whish payments OFFLINE; they queue in
-- Dexie and push through record_payment on reconnect. A reconnect double-fire (or
-- a retry after a dropped ACK) must resolve to EXACTLY ONE canonical payment, not
-- a duplicate. So a client-generated `client_uuid` rides with the queued payment
-- and is reused on every re-push: the writer no-ops if it has already settled that
-- key.
--
-- Additive + forward-only. The online path keeps passing NULL → behaviour
-- unchanged. RLS untouched (record_payment stays SECURITY DEFINER, is_staff +
-- gym-scoped). No business logic changes — only the idempotency short-circuit and
-- the key column.
-- ============================================================

-- 1. Idempotency key column (nullable: online single-fire writes leave it NULL).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_uuid uuid;

-- 2. A client op maps to at most one canonical payment. Partial so the many
--    historical/online NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS payments_client_uuid_key
  ON payments (client_uuid) WHERE client_uuid IS NOT NULL;

-- 3. record_payment gains an optional p_client_uuid. Drop the old signature first
--    (CREATE OR REPLACE cannot append a parameter); plpgsql body refs are resolved
--    at runtime, so nothing hard-depends on the old signature.
DROP FUNCTION IF EXISTS record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id    UUID,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_method        payment_method_enum DEFAULT 'cash_usd',
  p_reference     TEXT DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_payment_date  TIMESTAMPTZ DEFAULT NULL,
  p_client_uuid   UUID DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    invoices;
  v_gym    UUID;
  v_paid   NUMERIC;
  v_new    NUMERIC;
  v_status payment_status_enum;
  c_eps    CONSTANT NUMERIC := 0.01;
BEGIN
  -- Lock the invoice row (E6 concurrent payments serialize here). This same lock
  -- serialises rival OFF-3 re-pushes for the invoice, so the idempotency EXISTS
  -- check below cannot race; the partial unique index is the defensive backstop.
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  v_gym := v_inv.gym_id;
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized to record payments for this invoice';
  END IF;

  -- OFF-3 idempotency: this client op already settled → return the invoice
  -- unchanged. No second row, no spurious overpayment error on the re-push.
  IF p_client_uuid IS NOT NULL
     AND EXISTS (SELECT 1 FROM payments WHERE client_uuid = p_client_uuid) THEN
    RETURN v_inv;
  END IF;

  -- E5: no settling a cancelled/refunded obligation.
  IF v_inv.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Cannot record a payment against a % invoice', v_inv.status;
  END IF;
  -- E8: zero/negative rejected.
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;

  v_paid := COALESCE((SELECT SUM(amount_usd) FROM payments WHERE invoice_id = p_invoice_id), 0);
  -- E1: overpayment blocked (epsilon tolerance for LBP rounding).
  IF v_paid + p_amount_usd > v_inv.total_usd + c_eps THEN
    RAISE EXCEPTION 'Payment exceeds the invoice balance (overpayment is not allowed). Balance: %', round(v_inv.total_usd - v_paid, 2);
  END IF;

  -- Insert the settlement (carrying the idempotency key when offline-sourced).
  INSERT INTO payments (invoice_id, student_id, received_by, amount_usd, amount_lbp,
    exchange_rate, rate_date, payment_method, payment_date, reference_number, client_uuid)
  VALUES (p_invoice_id, v_inv.student_id, auth.uid(), p_amount_usd, COALESCE(p_amount_lbp, 0),
    p_exchange_rate, COALESCE(p_payment_date::date, CURRENT_DATE), p_method,
    COALESCE(p_payment_date, now()), NULLIF(p_reference, ''), p_client_uuid);

  -- E2/E11: status is ALWAYS derived from Σ payments, in this one transaction.
  v_new := v_paid + p_amount_usd;
  v_status := CASE
                WHEN v_new >= v_inv.total_usd - c_eps THEN 'paid'
                WHEN v_new > 0 THEN 'partial'
                ELSE 'pending'
              END;
  UPDATE invoices
  SET status = v_status,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  -- Audit the settlement (audit_logs also auto-fires on the invoices UPDATE).
  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('payments', p_invoice_id, 'payment',
          jsonb_build_object('paid_before', v_paid, 'total_usd', v_inv.total_usd),
          jsonb_build_object('amount_usd', p_amount_usd, 'paid_after', v_new, 'status', v_status, 'method', p_method, 'reference', p_reference),
          auth.uid());

  -- payment_received → member (+guardian), with remaining balance. Best-effort.
  PERFORM _notify_student_billing(
    v_inv.student_id, v_gym, 'payment_received',
    jsonb_build_object('amount', p_amount_usd, 'balance', round(v_inv.total_usd - v_new, 2), 'invoice', v_inv.invoice_number),
    v_inv.id);

  RETURN v_inv;
END;
$$;
GRANT EXECUTE ON FUNCTION record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ, UUID) TO authenticated;
