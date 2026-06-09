-- ============================================================
-- 000024: FIX convert_lead_to_member RETURN TYPE MISMATCH (Cycle 5 / 23-R)
-- PRO LINE Gym Platform
--
-- 000023's convert_lead_to_member RETURNS TABLE(... invoice_number TEXT,
-- total_usd NUMERIC), but the final RETURN QUERY selects invoices.invoice_number
-- (VARCHAR(50)) and invoices.total_usd (NUMERIC(12,2)). plpgsql validates the
-- RETURN QUERY column types against the declared OUT types at RUNTIME, so the
-- function CREATED fine but raised "structure of query does not match function
-- result type" on the first convert. Forward-only fix: cast the two columns to
-- the declared types. Body otherwise identical to 000023.
-- ============================================================

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
  v_invoice_id   UUID;
  v_rate         NUMERIC;
  v_rate_date    DATE;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may convert leads';
  END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'No gym context for caller';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND gym_id = v_gym;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead % not found in this gym', p_lead_id;
  END IF;
  IF v_lead.status = 'converted' OR v_lead.converted_student_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead % is already converted', p_lead_id;
  END IF;

  SELECT * INTO v_plan FROM membership_plans
  WHERE id = p_plan_id AND gym_id = v_gym AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Membership plan % not found or inactive in this gym', p_plan_id;
  END IF;

  -- 1) profile (login-less; the auth.users FK was dropped in 000018). Lead names
  --    are un-localized → seed all three locale columns from the same value.
  INSERT INTO profiles (
    gym_id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, phone
  )
  VALUES (
    v_gym, v_lead.first_name, v_lead.first_name, v_lead.first_name,
    v_lead.last_name, v_lead.last_name, v_lead.last_name, v_lead.phone
  )
  RETURNING id INTO v_profile_id;

  -- 2) student
  INSERT INTO students (profile_id, gym_id, join_date, is_active, current_belt_rank)
  VALUES (v_profile_id, v_gym, CURRENT_DATE, true, 'white')
  RETURNING id INTO v_student_id;

  -- 3) membership (active; end_date = today + plan duration)
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
  VALUES (v_student_id, v_plan.id, CURRENT_DATE, CURRENT_DATE + v_plan.duration_days, 'active')
  RETURNING id INTO v_membership_id;

  -- 4) membership invoice. total_usd / tax_amount_usd / invoice_number are filled
  --    by the existing BEFORE-INSERT triggers (000005).
  SELECT rate, rate_date INTO v_rate, v_rate_date
  FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;

  INSERT INTO invoices (
    gym_id, student_id, membership_id, invoice_type, invoice_number,
    amount_usd, amount_lbp, exchange_rate, rate_date, total_usd,
    status, due_date, notes_en, notes_ar, notes_fr
  )
  VALUES (
    v_gym, v_student_id, v_membership_id, 'membership', '',
    v_plan.price_usd, COALESCE(v_plan.price_lbp, 0), v_rate, v_rate_date, v_plan.price_usd,
    'pending', CURRENT_DATE + 14,
    'Membership: ' || v_plan.name_en,
    'اشتراك: ' || v_plan.name_ar,
    'Adhésion: ' || v_plan.name_fr
  )
  RETURNING id INTO v_invoice_id;

  -- 5) link the lead
  UPDATE leads
  SET converted_student_id = v_student_id, status = 'converted', converted_at = now(), updated_at = now()
  WHERE id = p_lead_id;

  -- Cast invoice_number (VARCHAR) → TEXT and total_usd (NUMERIC(12,2)) → NUMERIC
  -- to match the declared RETURNS TABLE column types (the 000023 bug).
  RETURN QUERY
  SELECT v_student_id, v_profile_id, v_membership_id, v_invoice_id,
         inv.invoice_number::TEXT, inv.total_usd::NUMERIC
  FROM invoices inv WHERE inv.id = v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION convert_lead_to_member(UUID, UUID) TO authenticated;
