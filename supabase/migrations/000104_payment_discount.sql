-- ============================================================
-- DISCOUNT — payment-time discount (field finding 16)
--
-- Staff sometimes grant a discount when RECORDING a payment (a goodwill cut, a
-- rounding-down, a promised deal). Today discounts exist only at APPROVAL time
-- (BILL-GUARDS: _activate_class_registration / sell_pt_package take
-- p_discount_pct + p_discount_amount_usd and bake the net into amount_usd). This
-- extends that SAME model to the settlement path instead of inventing a parallel
-- one: record_payment gains an optional p_discount_usd that REDUCES the invoice
-- total (USD + LBP at the invoice's own recorded rate) inside the one locked
-- transaction, so:
--   · the balance and the status derivation use the discounted total,
--   · the receipt's derived discount line (amount + tax − total, PRINT-FIX) finally
--     carries the real number — full price − discount = net,
--   · the drawer tallies stay honest: they sum payments.amount_usd (the cash
--     actually received = the NET), never the invoice total, so they need no change.
--
-- Guards (mirror the approval-time "discount ≤ fee" RAISE, enforced at the DB so a
-- crafted RPC can't bypass the UI):
--   · owner/receptionist ONLY (is_staff() also admits coach/head_coach — a discount
--     is a money decision, so it is narrower than "record a payment"),
--   · never negative, never larger than the remaining due (→ never a negative total,
--     never below what is already paid).
-- P0001 RAISE messages surface verbatim via the error-copy passthrough.
--
-- Additive + forward-only: p_discount_usd defaults to 0, so every existing caller
-- (online form, OFF-3 offline re-push) is byte-unchanged. DROP+recreate because a
-- new parameter changes the signature (CREATE OR REPLACE cannot append one); the
-- body is 000062 verbatim plus the discount block. RETURNS invoices unchanged.
-- BILL-CYCLES: the cycle recurrence renews at the class fee (never a prior invoice's
-- total), so discounting a prorated first invoice cannot corrupt the anchor.
-- ============================================================

DROP FUNCTION IF EXISTS record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id    UUID,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_method        payment_method_enum DEFAULT 'cash_usd',
  p_reference     TEXT DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_payment_date  TIMESTAMPTZ DEFAULT NULL,
  p_client_uuid   UUID DEFAULT NULL,
  p_discount_usd  NUMERIC DEFAULT 0
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       invoices;
  v_gym       UUID;
  v_paid      NUMERIC;
  v_new       NUMERIC;
  v_status    payment_status_enum;
  v_disc      NUMERIC := GREATEST(COALESCE(p_discount_usd, 0), 0);
  v_total     NUMERIC;   -- effective total after any payment-time discount
  v_total_lbp NUMERIC;
  v_total0    NUMERIC;   -- the total BEFORE the discount (for the audit trail)
  v_role      TEXT;
  c_eps       CONSTANT NUMERIC := 0.01;
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

  v_paid  := COALESCE((SELECT SUM(amount_usd) FROM payments WHERE invoice_id = p_invoice_id), 0);
  v_total0 := v_inv.total_usd;
  v_total := v_inv.total_usd;
  v_total_lbp := COALESCE(v_inv.total_lbp, 0);

  -- ── DISCOUNT (payment-time). Owner/receptionist only; never negative; never more
  --    than the remaining due (→ the total can never go negative or below what is
  --    already paid). Reduces the invoice total in USD, and in LBP at the invoice's
  --    OWN recorded rate via the existing round(usd * rate) idiom. The derived
  --    receipt discount line (amount + tax − total) then reflects it. ──
  IF v_disc > 0 THEN
    v_role := get_user_role();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'receptionist') THEN
      RAISE EXCEPTION 'Only an owner or receptionist can grant a discount.';
    END IF;
    IF p_discount_usd < 0 THEN
      RAISE EXCEPTION 'The discount cannot be negative.';
    END IF;
    IF v_disc > (v_total - v_paid) + c_eps THEN
      RAISE EXCEPTION 'The discount is larger than the balance due.';
    END IF;
    v_total := v_total - v_disc;
    IF v_inv.exchange_rate IS NOT NULL THEN
      v_total_lbp := GREATEST(0, v_total_lbp - round(v_disc * v_inv.exchange_rate));
    END IF;
  END IF;

  -- E1: overpayment blocked vs the (possibly discounted) total (epsilon for LBP rounding).
  IF v_paid + p_amount_usd > v_total + c_eps THEN
    RAISE EXCEPTION 'Payment exceeds the invoice balance (overpayment is not allowed). Balance: %', round(v_total - v_paid, 2);
  END IF;

  -- Insert the settlement (carrying the idempotency key when offline-sourced).
  INSERT INTO payments (invoice_id, student_id, received_by, amount_usd, amount_lbp,
    exchange_rate, rate_date, payment_method, payment_date, reference_number, client_uuid)
  VALUES (p_invoice_id, v_inv.student_id, auth.uid(), p_amount_usd, COALESCE(p_amount_lbp, 0),
    p_exchange_rate, COALESCE(p_payment_date::date, CURRENT_DATE), p_method,
    COALESCE(p_payment_date, now()), NULLIF(p_reference, ''), p_client_uuid);

  -- E2/E11: status is ALWAYS derived from Σ payments vs the discounted total.
  v_new := v_paid + p_amount_usd;
  v_status := CASE
                WHEN v_new >= v_total - c_eps THEN 'paid'
                WHEN v_new > 0 THEN 'partial'
                ELSE 'pending'
              END;
  UPDATE invoices
  SET status = v_status,
      total_usd = v_total,
      total_lbp = CASE WHEN v_disc > 0 THEN v_total_lbp ELSE total_lbp END,
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

  -- Audit WHO granted WHAT discount (a total reduction), when one applied.
  IF v_disc > 0 THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES ('invoices', p_invoice_id, 'update',
            jsonb_build_object('total_usd', v_total0),
            jsonb_build_object('discount_usd', v_disc, 'total_usd', v_total, 'reason', 'payment_time_discount'),
            auth.uid());
  END IF;

  -- payment_received → member (+guardian), with remaining balance. Best-effort.
  PERFORM _notify_student_billing(
    v_inv.student_id, v_gym, 'payment_received',
    jsonb_build_object('amount', p_amount_usd, 'balance', round(v_total - v_new, 2), 'invoice', v_inv.invoice_number),
    v_inv.id);

  RETURN v_inv;
END;
$$;

-- DEFAULT-PRIV CONTRACT: a recreated function re-acquires Supabase's default execute
-- grant to anon — REVOKE it explicitly (REVOKE FROM PUBLIC alone does not remove the
-- role grant on prod). Staff RPC → authenticated + service_role, never anon.
REVOKE ALL ON FUNCTION record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ, UUID, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ, UUID, NUMERIC) TO authenticated, service_role;
