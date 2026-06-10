-- ============================================================
-- 000031: BILLING & PAYMENT — record → reconcile (Cycle 5 / Phase 1 / D1)
-- PRO LINE Gym Platform — closes Phase 1
--
-- Two canonical services replace the cosmetic as-is (a payments row that never
-- reconciled the invoice; the bogus payments.status insert; the DOA /invoices):
--   * issue_invoice(...)  — the SINGLE issuance path (TVA/number via triggers),
--     links the entity, sets due_date, emits invoice_issued (member+guardian,
--     best-effort). convert_lead_to_member (23-R) is retrofitted to issue through
--     it; approvePtRequest (22-R) routes through it from TS.
--   * record_payment(...) — the SINGLE settlement path: lock the invoice, reject
--     cancelled/refunded, BLOCK overpayment, insert the payment, recompute status
--     atomically from Σ payments (never hand-set), audit, emit payment_received
--     with the remaining balance.
-- Plus refund_invoice / void_invoice (reference-only, audited).
--
-- Lebanese cash model: reconcile on amount_usd (LBP at pay-day rate, epsilon
-- rounding; split-currency = multiple rows). Notifications best-effort + login-
-- aware (notifications.user_id FKs auth.users → login-less members can't receive;
-- portal/billing + receipt is the durable truth). Coaches are never billing
-- recipients (invoices/payments stay staff-only by RLS).
-- ============================================================

-- -----------------------------------------------------------
-- _notify_student_billing — per-recipient best-effort emit (member + guardians).
-- Each insert is its own sub-transaction so a login-less member's FK failure
-- never blocks the others (or the financial write).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _notify_student_billing(
  p_student_id UUID,
  p_gym_id     UUID,
  p_type       TEXT,
  p_params     JSONB,
  p_entity_id  UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec UUID;
BEGIN
  FOR v_rec IN
    SELECT s.profile_id FROM students s WHERE s.id = p_student_id AND s.profile_id IS NOT NULL
    UNION
    SELECT g.profile_id FROM guardian_students gs JOIN guardians g ON g.id = gs.guardian_id
    WHERE gs.student_id = p_student_id AND g.profile_id IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
      VALUES (v_rec, p_gym_id, p_type, 'messages.' || p_type || '.title', 'messages.' || p_type || '.body',
              p_params, 'invoice', p_entity_id, '/portal/billing');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- best-effort: a login-less recipient (FK) never blocks the write
    END;
  END LOOP;
END;
$$;
-- NOT granted to authenticated: this SECURITY DEFINER helper has no is_staff()
-- gate (a direct grant would let any authed user spam notifications to any
-- student). Only the gated definer callers below (issue_invoice / record_payment)
-- PERFORM it, and they run as the owner, so no direct grant is needed.
REVOKE ALL ON FUNCTION _notify_student_billing(UUID, UUID, TEXT, JSONB, UUID) FROM PUBLIC;

-- -----------------------------------------------------------
-- issue_invoice — the single issuance path (staff-only, gym-scoped)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_invoice(
  p_gym_id        UUID,
  p_student_id    UUID,
  p_invoice_type  invoice_type_enum,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_rate_date     DATE DEFAULT NULL,
  p_membership_id UUID DEFAULT NULL,
  p_due_date      DATE DEFAULT NULL,
  p_notes_en      TEXT DEFAULT NULL,
  p_notes_ar      TEXT DEFAULT NULL,
  p_notes_fr      TEXT DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invoices;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may issue invoices'; END IF;
  IF p_gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Cross-gym invoice not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND gym_id = p_gym_id) THEN
    RAISE EXCEPTION 'Student % not found in this gym', p_student_id;
  END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;

  -- Triggers compute total_usd / tax_amount_usd / invoice_number on INSERT.
  INSERT INTO invoices (
    gym_id, student_id, membership_id, invoice_type, invoice_number,
    amount_usd, amount_lbp, exchange_rate, rate_date, total_usd,
    status, due_date, notes_en, notes_ar, notes_fr
  )
  VALUES (
    p_gym_id, p_student_id, p_membership_id, p_invoice_type, '',
    p_amount_usd, COALESCE(p_amount_lbp, 0), p_exchange_rate, p_rate_date, p_amount_usd,
    'pending', COALESCE(p_due_date, CURRENT_DATE + 14), p_notes_en, p_notes_ar, p_notes_fr
  )
  RETURNING * INTO v_inv;

  PERFORM _notify_student_billing(
    p_student_id, p_gym_id, 'invoice_issued',
    jsonb_build_object('invoice', v_inv.invoice_number, 'amount', v_inv.total_usd), v_inv.id);

  RETURN v_inv;
END;
$$;
GRANT EXECUTE ON FUNCTION issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- record_payment — the single settlement path (atomic, sum-based, overpayment-safe)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id    UUID,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_method        payment_method_enum DEFAULT 'cash_usd',
  p_reference     TEXT DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_payment_date  TIMESTAMPTZ DEFAULT NULL
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
  -- Lock the invoice row (E6 concurrent payments serialize here).
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  v_gym := v_inv.gym_id;
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized to record payments for this invoice';
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

  -- Insert the settlement.
  INSERT INTO payments (invoice_id, student_id, received_by, amount_usd, amount_lbp,
    exchange_rate, rate_date, payment_method, payment_date, reference_number)
  VALUES (p_invoice_id, v_inv.student_id, auth.uid(), p_amount_usd, COALESCE(p_amount_lbp, 0),
    p_exchange_rate, COALESCE(p_payment_date::date, CURRENT_DATE), p_method,
    COALESCE(p_payment_date, now()), NULLIF(p_reference, ''));

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
GRANT EXECUTE ON FUNCTION record_payment(UUID, NUMERIC, NUMERIC, payment_method_enum, TEXT, NUMERIC, TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------
-- refund_invoice / void_invoice — reference-only, audited (staff-only)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices; BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF NOT (is_staff() AND v_inv.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_inv.status = 'refunded' THEN RETURN v_inv; END IF;
  UPDATE invoices SET status = 'refunded', updated_at = now() WHERE id = p_invoice_id RETURNING * INTO v_inv;
  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('invoices', p_invoice_id, 'refund', jsonb_build_object('action','refund_invoice','reason',p_reason), auth.uid());
  RETURN v_inv;
END; $$;
GRANT EXECUTE ON FUNCTION refund_invoice(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices; BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF NOT (is_staff() AND v_inv.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_inv.status = 'paid' THEN RAISE EXCEPTION 'Cannot void a paid invoice; use refund'; END IF;
  IF v_inv.status = 'cancelled' THEN RETURN v_inv; END IF;
  UPDATE invoices SET status = 'cancelled', updated_at = now() WHERE id = p_invoice_id RETURNING * INTO v_inv;
  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('invoices', p_invoice_id, 'update', jsonb_build_object('action','void_invoice','reason',p_reason), auth.uid());
  RETURN v_inv;
END; $$;
GRANT EXECUTE ON FUNCTION void_invoice(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- RETROFIT: convert_lead_to_member (23-R) issues its membership invoice through
-- issue_invoice (so it fires invoice_issued uniformly). Behavior otherwise
-- identical to 000024.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION convert_lead_to_member(
  p_lead_id UUID,
  p_plan_id UUID
) RETURNS TABLE (
  student_id     UUID,
  profile_id     UUID,
  membership_id  UUID,
  invoice_id     UUID,
  invoice_number TEXT,
  total_usd      NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym          UUID;
  v_lead         leads;
  v_plan         membership_plans;
  v_profile_id   UUID;
  v_student_id   UUID;
  v_membership_id UUID;
  v_inv          invoices;
  v_rate         NUMERIC;
  v_rate_date    DATE;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may convert leads'; END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN RAISE EXCEPTION 'No gym context for caller'; END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND gym_id = v_gym;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead % not found in this gym', p_lead_id; END IF;
  IF v_lead.status = 'converted' OR v_lead.converted_student_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead % is already converted', p_lead_id;
  END IF;

  SELECT * INTO v_plan FROM membership_plans
  WHERE id = p_plan_id AND gym_id = v_gym AND is_active = true;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Membership plan % not found or inactive in this gym', p_plan_id; END IF;

  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone)
  VALUES (v_gym, v_lead.first_name, v_lead.first_name, v_lead.first_name,
          v_lead.last_name, v_lead.last_name, v_lead.last_name, v_lead.phone)
  RETURNING id INTO v_profile_id;

  INSERT INTO students (profile_id, gym_id, join_date, is_active, current_belt_rank)
  VALUES (v_profile_id, v_gym, CURRENT_DATE, true, 'white')
  RETURNING id INTO v_student_id;

  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
  VALUES (v_student_id, v_plan.id, CURRENT_DATE, CURRENT_DATE + v_plan.duration_days, 'active')
  RETURNING id INTO v_membership_id;

  SELECT rate, rate_date INTO v_rate, v_rate_date FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;

  -- D1 retrofit: issue through the canonical service (fires invoice_issued).
  v_inv := issue_invoice(
    v_gym, v_student_id, 'membership', v_plan.price_usd, COALESCE(v_plan.price_lbp, 0),
    v_rate, v_rate_date, v_membership_id, CURRENT_DATE + 14,
    'Membership: ' || v_plan.name_en, 'اشتراك: ' || v_plan.name_ar, 'Adhésion: ' || v_plan.name_fr);

  UPDATE leads
  SET converted_student_id = v_student_id, status = 'converted', converted_at = now(), updated_at = now()
  WHERE id = p_lead_id;

  RETURN QUERY
  SELECT v_student_id, v_profile_id, v_membership_id, v_inv.id, v_inv.invoice_number::TEXT, v_inv.total_usd::NUMERIC;
END;
$$;
GRANT EXECUTE ON FUNCTION convert_lead_to_member(UUID, UUID) TO authenticated;
