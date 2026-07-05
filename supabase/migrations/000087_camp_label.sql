-- ============================================================
-- 000087: CAMP-LABEL — finish the smart-invoice-label epic (INVOICE-POLISH)
-- PRO LINE Gym Platform
--
-- 000086 enriched the invoice notes_* labels on 5 billing RPCs with the billing
-- PERIOD via _invoice_month_label(), but EXPLICITLY deferred register_camp (its
-- header: "register_camp keeps its plain 'Camp: name' label ... deferred to keep
-- this migration bounded"). This finishes it.
--
-- register_camp is CREATE OR REPLACE'd from its CURRENT/ONLY definer (000043_camps.sql
-- — verified: `git grep -l "FUNCTION register_camp" origin/main -- supabase/migrations/*.sql`
-- returns 000043 alone). The body is copied BYTE-FOR-BYTE from 000043; the ONLY change
-- is the three invoice-label arguments to _system_issue_invoice (notes_en/ar/fr):
--
--     'Camp: '||name_en   →  name_en || ' — ' || _invoice_month_label(v_camp.start_date,'en')
--     'مخيم: '||name_ar   →  name_ar || ' — ' || _invoice_month_label(v_camp.start_date,'ar')
--     'Camp : '||name_fr  →  name_fr || ' — ' || _invoice_month_label(v_camp.start_date,'fr')
--
-- e.g. "Summer Camp — July 2026". v_camp.start_date is already populated (SELECT *
-- INTO v_camp FROM camps). EVERYTHING else — the B3 guardian/payer resolution
-- (_primary_guardian_profile → guardian_id; _system_issue_invoice payer auto = guardian),
-- the spots/age/capacity validation, the capacity-flip, the notification — is preserved
-- unchanged (function-rewrite-reverts landmine; 000065 once silently reverted the B3 path
-- exactly this way). invoices use notes_ar/en/fr (NO description_* column).
-- ============================================================

CREATE OR REPLACE FUNCTION register_camp(
  p_student_id UUID,
  p_camp_id    UUID,
  p_request_id UUID DEFAULT NULL
) RETURNS camp_registrations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp      camps;
  v_student   students;
  v_req       camp_registrations;
  v_reg       camp_registrations;
  v_confirmed INTEGER;
  v_rate      NUMERIC;
  v_rdate     DATE;
  v_lbp       NUMERIC;
  v_inv       invoices;
  v_guardian  UUID;
  v_payerprof UUID;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may register for a camp'; END IF;

  -- LOCK the camp row: the capacity count below is race-safe — two concurrent
  -- registrations serialize here and the N+1th gets the clear error.
  SELECT * INTO v_camp FROM camps WHERE id = p_camp_id FOR UPDATE;
  IF v_camp.id IS NULL OR v_camp.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Camp not found'; END IF;
  IF v_camp.gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Camp is not in your gym'; END IF;
  IF v_camp.status NOT IN ('open', 'in_progress', 'full') THEN
    RAISE EXCEPTION 'Camp is not open for registration';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF v_student.gym_id <> v_camp.gym_id THEN RAISE EXCEPTION 'Member and camp are in different gyms'; END IF;

  SELECT count(*) INTO v_confirmed FROM camp_registrations
  WHERE camp_id = p_camp_id AND status = 'confirmed';
  IF v_confirmed >= v_camp.max_capacity THEN
    RAISE EXCEPTION 'Camp is full (% of % places taken)', v_confirmed, v_camp.max_capacity;
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_req FROM camp_registrations WHERE id = p_request_id FOR UPDATE;
    IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending (status %)', v_req.status; END IF;
    IF v_req.student_id <> p_student_id OR v_req.camp_id <> p_camp_id THEN
      RAISE EXCEPTION 'Request does not match the member/camp';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM camp_registrations
      WHERE camp_id = p_camp_id AND student_id = p_student_id AND status NOT IN ('cancelled')
    ) THEN
      RAISE EXCEPTION 'Already registered for this camp';
    END IF;
  END IF;

  -- B3: the registration remembers the primary guardian (guardians row), and
  -- _system_issue_invoice auto-resolves the same guardian as the invoice payer.
  v_payerprof := _primary_guardian_profile(p_student_id);
  IF v_payerprof IS NOT NULL THEN
    SELECT g.id INTO v_guardian FROM guardians g WHERE g.profile_id = v_payerprof LIMIT 1;
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE camp_registrations
    SET status = 'confirmed', price_usd = v_camp.price_usd, price_lbp = v_camp.price_lbp,
        guardian_id = COALESCE(guardian_id, v_guardian), updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_reg;
  ELSE
    INSERT INTO camp_registrations (camp_id, student_id, guardian_id, status, registration_date, price_usd, price_lbp)
    VALUES (p_camp_id, p_student_id, v_guardian, 'confirmed', now(), v_camp.price_usd, v_camp.price_lbp)
    ON CONFLICT (camp_id, student_id)
    DO UPDATE SET status = 'confirmed', guardian_id = COALESCE(EXCLUDED.guardian_id, camp_registrations.guardian_id),
                  price_usd = EXCLUDED.price_usd, price_lbp = EXCLUDED.price_lbp,
                  registration_date = now(), updated_at = now()
    RETURNING * INTO v_reg;
  END IF;

  -- Invoice via the canonical path (TVA/number triggers; payer auto = guardian).
  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;
  v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_camp.price_usd * v_rate) ELSE COALESCE(v_camp.price_lbp, 0) END;
  v_inv := _system_issue_invoice(
    v_camp.gym_id, p_student_id, 'camp', v_camp.price_usd, v_lbp, v_rate, v_rdate, NULL, NULL,
    COALESCE(v_camp.name_en, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'en'),
    COALESCE(v_camp.name_ar, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'ar'),
    COALESCE(v_camp.name_fr, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'fr'),
    NULL);
  UPDATE camp_registrations SET invoice_id = v_inv.id, updated_at = now() WHERE id = v_reg.id
  RETURNING * INTO v_reg;

  -- Capacity edge: this registration filled the camp → flip status (the
  -- landing/portal "Full" badge is a catalog field, visible to anon).
  IF v_confirmed + 1 >= v_camp.max_capacity AND v_camp.status IN ('open', 'in_progress') THEN
    UPDATE camps SET status = 'full', updated_at = now() WHERE id = p_camp_id;
  END IF;

  -- Best-effort member notification (login-less kids have no auth row).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_camp.gym_id, 'camp_confirmed',
            'messages.camp_confirmed.title', 'messages.camp_confirmed.body',
            jsonb_build_object('camp', COALESCE(v_camp.name_en, v_camp.name_ar)),
            'camp_registration', v_reg.id, '/portal');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_reg;
END;
$$;
