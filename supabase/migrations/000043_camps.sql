-- ============================================================
-- 000043: SUMMER CAMPS — publish gate, sale RPC, request loop (V1 / E1)
-- PRO LINE Gym Platform
--
-- REAL-COLUMNS AUDIT (the bug-class mandate — all three tables verified in
-- 000003 + generated types before writing a line):
--   · camps: gym_id, name/description ×3, start/end_date, min/max_age,
--     max_capacity, price_usd NOT NULL, price_lbp, early_bird_price_usd(+
--     deadline), sibling_discount_percent, status camp_status_enum
--     (draft|open|full|in_progress|completed|cancelled), deleted_at.
--     MISSING for the design: show_on_landing ONLY.
--   · camp_registrations: camp_id, student_id, guardian_id→guardians,
--     invoice_id, registration_date, status VARCHAR CHECK
--     (pending|confirmed|cancelled|waitlisted), UNIQUE(camp_id, student_id),
--     dietary/medical/pickup fields. MISSING: the PT-1 price SNAPSHOT.
--   · camp_attendance: camp_id, student_id, attendance_date, status
--     attendance_status_enum, check_in/out, picked_up_by, notes ×3,
--     UNIQUE(camp_id, student_id, attendance_date). Nothing missing.
--
-- Additions (each named):
--   1. camps.show_on_landing (default false — ADM-1 staged-publish).
--   2. camp_registrations.price_usd / price_lbp (snapshot at registration).
--   3. RLS TIGHTENED (found cross-gym): camp_registrations_staff and
--      camp_attendance_staff were bare `is_staff()` — any gym's staff could
--      read/write every gym's rows. Re-scoped through the camp's gym.
--      ADDITIVE: guardians read linked kids' camp registrations (B3 pattern).
--   4. Anon landing read: open/full/in_progress + published camps of active
--      gyms (catalog only — the 000035/41 pattern) + a definer spots counter
--      (anon-callable) for the "spots left" tease.
--   5. request_camp — portal/guardian/member request (pending, NO invoice).
--   6. register_camp — THE single confirm/sale writer (desk + approval via
--      p_request_id): capacity under FOR UPDATE (race-safe), price snapshot,
--      invoice via _system_issue_invoice (payer auto = guardian per B3),
--      auto status flip open→full at capacity, best-effort notifications.
--      Age range is deliberately NOT guarded here (client-side warning only —
--      the desk can override).
--   7. seed_e2e_gym wrapper: one PUBLISHED camp spanning today, capacity 3.
-- ============================================================

-- 1. Publish gate
ALTER TABLE camps
  ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT false;

-- 2. Price snapshot (nullable — legacy rows keep NULL; the RPC always fills)
ALTER TABLE camp_registrations
  ADD COLUMN IF NOT EXISTS price_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_lbp NUMERIC(14,2);

-- 3. RLS: gym-scope the staff policies (tighten, never widen) + guardian read
DROP POLICY IF EXISTS camp_registrations_staff ON camp_registrations;
DROP POLICY IF EXISTS camp_registrations_staff_gym ON camp_registrations;
CREATE POLICY camp_registrations_staff_gym ON camp_registrations FOR ALL
  USING (
    is_staff() AND
    EXISTS (SELECT 1 FROM camps c WHERE c.id = camp_id AND c.gym_id = get_user_gym_id())
  );
DROP POLICY IF EXISTS camp_attendance_staff ON camp_attendance;
DROP POLICY IF EXISTS camp_attendance_staff_gym ON camp_attendance;
CREATE POLICY camp_attendance_staff_gym ON camp_attendance FOR ALL
  USING (
    is_staff() AND
    EXISTS (SELECT 1 FROM camps c WHERE c.id = camp_id AND c.gym_id = get_user_gym_id())
  );
DROP POLICY IF EXISTS camp_registrations_guardian ON camp_registrations;
CREATE POLICY camp_registrations_guardian ON camp_registrations FOR SELECT
  USING (is_guardian_of(student_id));

-- 4. Anon landing read (catalog only) + spots counter
DROP POLICY IF EXISTS camps_public_read ON camps;
CREATE POLICY camps_public_read ON camps FOR SELECT TO anon
  USING (
    show_on_landing AND deleted_at IS NULL
    AND status IN ('open', 'full', 'in_progress')
    AND is_active_gym(gym_id)
  );

CREATE OR REPLACE FUNCTION get_camp_spots_left(p_camp_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, c.max_capacity - (
    SELECT count(*)::int FROM camp_registrations r
    WHERE r.camp_id = c.id AND r.status = 'confirmed'
  ))
  FROM camps c
  WHERE c.id = p_camp_id AND c.deleted_at IS NULL
    AND (c.show_on_landing OR auth.role() = 'authenticated');
$$;
REVOKE ALL ON FUNCTION get_camp_spots_left(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_camp_spots_left(UUID) TO anon, authenticated;

-- 5. request_camp — pending row, NO invoice (B2 request shape: member-self,
--    guardian-of, or staff). Approval goes through register_camp.
CREATE OR REPLACE FUNCTION request_camp(p_camp_id UUID, p_student_id UUID)
RETURNS camp_registrations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp    camps;
  v_student students;
  v_reg     camp_registrations;
  v_name    TEXT;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;

  IF NOT (
    (is_staff() AND v_student.gym_id = get_user_gym_id())
    OR v_student.profile_id = auth.uid()
    OR is_guardian_of(p_student_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to request for this member';
  END IF;

  SELECT * INTO v_camp FROM camps WHERE id = p_camp_id;
  IF v_camp.id IS NULL OR v_camp.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Camp not found'; END IF;
  IF v_camp.gym_id <> v_student.gym_id THEN RAISE EXCEPTION 'Camp and member are in different gyms'; END IF;
  IF v_camp.status = 'full' THEN RAISE EXCEPTION 'Camp is full'; END IF;
  IF v_camp.status NOT IN ('open', 'in_progress') THEN RAISE EXCEPTION 'Camp is not open for registration'; END IF;

  IF EXISTS (
    SELECT 1 FROM camp_registrations
    WHERE camp_id = p_camp_id AND student_id = p_student_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Already registered for this camp';
  END IF;

  -- Revive a cancelled row (UNIQUE camp+student) or insert fresh.
  INSERT INTO camp_registrations (camp_id, student_id, status, registration_date)
  VALUES (p_camp_id, p_student_id, 'pending', now())
  ON CONFLICT (camp_id, student_id)
  DO UPDATE SET status = 'pending', registration_date = now(), updated_at = now()
  RETURNING * INTO v_reg;

  -- Notify staff (best-effort).
  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_camp.gym_id, 'camp_requested',
           'messages.camp_requested.title', 'messages.camp_requested.body',
           jsonb_build_object('studentName', v_name, 'camp', COALESCE(v_camp.name_en, v_camp.name_ar)),
           'camp_registration', v_reg.id, '/inbox'
    FROM user_roles ur
    WHERE ur.gym_id = v_camp.gym_id AND ur.role IN ('owner', 'receptionist');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION request_camp(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_camp(UUID, UUID) TO authenticated;

-- 6. register_camp — the single confirm/sale writer (desk + request approval)
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
    'Camp: ' || COALESCE(v_camp.name_en, ''),
    'مخيم: ' || COALESCE(v_camp.name_ar, ''),
    'Camp : ' || COALESCE(v_camp.name_fr, ''),
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
REVOKE ALL ON FUNCTION register_camp(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_camp(UUID, UUID, UUID) TO authenticated;

-- 7. Seed: one PUBLISHED camp spanning today, capacity 3 (deterministic e2e)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_pt1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_pt1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym UUID;
BEGIN
  v_gym := seed_e2e_gym_pt1(p_slug, p_password);

  IF NOT EXISTS (SELECT 1 FROM camps WHERE gym_id = v_gym AND name_en = 'Summer Camp') THEN
    INSERT INTO camps (gym_id, name_ar, name_en, name_fr, description_ar, description_en, description_fr,
                       start_date, end_date, min_age, max_age, max_capacity, price_usd, price_lbp,
                       status, show_on_landing)
    VALUES (v_gym, 'مخيم الصيف', 'Summer Camp', 'Camp d''été',
            'مخيم صيفي للأطفال', 'Summer camp for kids', 'Camp d''été pour enfants',
            CURRENT_DATE - 1, CURRENT_DATE + 5, 6, 14, 3, 120.00, 0,
            'open', true);
  END IF;

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
