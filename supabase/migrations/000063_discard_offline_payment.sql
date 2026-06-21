-- ============================================================
-- OFF-4 — discard an offline payment intent WITH an audit trail
--
-- OFF-3 surfaces a server-rejected offline payment as a `conflict` row that
-- accumulates forever. OFF-4 lets staff RESOLVE it: re-submit corrected (client-
-- side, reuses record_payment + the op_id idempotency key) OR discard. A discard
-- must never be a silent drop of a money record (the locked decision) — it writes
-- an audit row first, then the client deletes the queue intent.
--
-- Additive: a single SECURITY DEFINER function, no schema/enum change (reuses the
-- existing 'delete' audit_action with the detail in new_data). is_staff +
-- gym-scoped, REVOKE PUBLIC + GRANT authenticated. RLS untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION discard_offline_payment(
  p_op_id      TEXT,
  p_invoice_id UUID,
  p_amount_usd NUMERIC,
  p_reason     TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym UUID;
BEGIN
  -- The intent targets a real invoice — gym-scope through it (same guard shape as
  -- record_payment), so staff can only discard their own gym's records.
  SELECT gym_id INTO v_gym FROM invoices WHERE id = p_invoice_id;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized to discard payments for this invoice';
  END IF;
  -- Never a silent drop: a reason is mandatory.
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A discard reason is required';
  END IF;

  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('payments', p_invoice_id, 'delete',
          jsonb_build_object('op_id', p_op_id, 'amount_usd', p_amount_usd, 'source', 'offline_queue'),
          jsonb_build_object('action', 'offline_payment_discarded', 'reason', p_reason, 'discarded_at', now()),
          auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION discard_offline_payment(TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION discard_offline_payment(TEXT, UUID, NUMERIC, TEXT) TO authenticated;
