-- ============================================================
-- 000037: FAMILY / HOUSEHOLD (V1 / B3) — payer-on-invoice + guardian read RLS
-- PRO LINE Gym Platform
--
-- Operator-locked design: guardians/guardian_students ONLY (a guardian with 2+
-- linked kids IS the household — no households table). The student stays the
-- service RECIPIENT; a guardian becomes the invoice PAYER for minors (NULL ⇒
-- payer = the recipient's own profile). Payments stay AT THE DESK (D1
-- record_payment) — no online payment. Guardians get ADDITIVE read access to
-- their linked kids' rows (link-based via SECURITY DEFINER is_guardian_of, so
-- the dual-hat guardian-who-is-also-a-member works regardless of user_roles).
-- Nothing existing is weakened: every change below is a new column, a new
-- helper, new SELECT policies, or a parameter with a NULL default.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Payer on invoice (NULL ⇒ payer = recipient)
-- -----------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payer_profile_id UUID NULL REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_invoices_payer ON invoices(payer_profile_id)
  WHERE payer_profile_id IS NOT NULL;

-- -----------------------------------------------------------
-- 2. is_guardian_of — the single link-based authorization check.
--    SECURITY DEFINER so policies don't recursively evaluate RLS on
--    guardians/guardian_students.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION is_guardian_of(p_student_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM guardian_students gs
    JOIN guardians g ON g.id = gs.guardian_id
    WHERE gs.student_id = p_student_id
      AND g.profile_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION is_guardian_of(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_guardian_of(UUID) TO authenticated;

-- Primary-guardian resolver for payer auto-default (primary contact first,
-- earliest link as tiebreak). Internal: callers are the gated invoice fns.
CREATE OR REPLACE FUNCTION _primary_guardian_profile(p_student_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.profile_id
  FROM guardian_students gs
  JOIN guardians g ON g.id = gs.guardian_id
  WHERE gs.student_id = p_student_id
  ORDER BY g.is_primary_contact DESC, gs.created_at ASC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION _primary_guardian_profile(UUID) FROM PUBLIC;

-- -----------------------------------------------------------
-- 3. ADDITIVE guardian read policies (SELECT only, link-based).
--    students/attendance/invoices already had role-='parent' policies; these
--    are kept untouched — the new link-based ones also cover the dual-hat case
--    (a guardian whose primary role is 'student').
-- -----------------------------------------------------------
DROP POLICY IF EXISTS students_guardian ON students;
CREATE POLICY students_guardian ON students FOR SELECT
  USING (is_guardian_of(id));

DROP POLICY IF EXISTS class_registrations_guardian ON class_registrations;
CREATE POLICY class_registrations_guardian ON class_registrations FOR SELECT
  USING (is_guardian_of(student_id));

DROP POLICY IF EXISTS class_enrollments_guardian ON class_enrollments;
CREATE POLICY class_enrollments_guardian ON class_enrollments FOR SELECT
  USING (is_guardian_of(student_id));

DROP POLICY IF EXISTS attendance_guardian ON attendance_records;
CREATE POLICY attendance_guardian ON attendance_records FOR SELECT
  USING (is_guardian_of(student_id));

DROP POLICY IF EXISTS invoices_guardian ON invoices;
CREATE POLICY invoices_guardian ON invoices FOR SELECT
  USING (is_guardian_of(student_id) OR payer_profile_id = auth.uid());

DROP POLICY IF EXISTS payments_guardian ON payments;
CREATE POLICY payments_guardian ON payments FOR SELECT
  USING (is_guardian_of(student_id));

DROP POLICY IF EXISTS belt_promotions_guardian ON belt_promotions;
CREATE POLICY belt_promotions_guardian ON belt_promotions FOR SELECT
  USING (is_guardian_of(student_id));

-- -----------------------------------------------------------
-- 4. issue_invoice / _system_issue_invoice — optional payer (guards unchanged).
--    Signature changes require dropping the old functions first (CREATE OR
--    REPLACE with a new parameter would create an overload). All existing
--    callers pass ≤12 positional args, so the new DEFAULT NULL param is
--    backward-compatible.
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS _system_issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION _system_issue_invoice(
  p_gym_id           UUID,
  p_student_id       UUID,
  p_invoice_type     invoice_type_enum,
  p_amount_usd       NUMERIC,
  p_amount_lbp       NUMERIC DEFAULT 0,
  p_exchange_rate    NUMERIC DEFAULT NULL,
  p_rate_date        DATE DEFAULT NULL,
  p_membership_id    UUID DEFAULT NULL,
  p_due_date         DATE DEFAULT NULL,
  p_notes_en         TEXT DEFAULT NULL,
  p_notes_ar         TEXT DEFAULT NULL,
  p_notes_fr         TEXT DEFAULT NULL,
  p_payer_profile_id UUID DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv   invoices;
  v_payer UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND gym_id = p_gym_id) THEN
    RAISE EXCEPTION 'Student % not found in this gym', p_student_id;
  END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;

  -- B3: explicit payer wins; else auto-resolve the primary guardian for linked
  -- minors; else NULL (payer = the recipient — the adult-member default).
  v_payer := COALESCE(p_payer_profile_id, _primary_guardian_profile(p_student_id));

  INSERT INTO invoices (
    gym_id, student_id, membership_id, invoice_type, invoice_number,
    amount_usd, amount_lbp, exchange_rate, rate_date, total_usd,
    status, due_date, notes_en, notes_ar, notes_fr, payer_profile_id
  )
  VALUES (
    p_gym_id, p_student_id, p_membership_id, p_invoice_type, '',
    p_amount_usd, COALESCE(p_amount_lbp, 0), p_exchange_rate, p_rate_date, p_amount_usd,
    'pending', COALESCE(p_due_date, CURRENT_DATE + 14), p_notes_en, p_notes_ar, p_notes_fr, v_payer
  )
  RETURNING * INTO v_inv;

  PERFORM _notify_student_billing(
    p_student_id, p_gym_id, 'invoice_issued',
    jsonb_build_object('invoice', v_inv.invoice_number, 'amount', v_inv.total_usd), v_inv.id);

  RETURN v_inv;
END;
$$;
REVOKE ALL ON FUNCTION _system_issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;

DROP FUNCTION IF EXISTS issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION issue_invoice(
  p_gym_id           UUID,
  p_student_id       UUID,
  p_invoice_type     invoice_type_enum,
  p_amount_usd       NUMERIC,
  p_amount_lbp       NUMERIC DEFAULT 0,
  p_exchange_rate    NUMERIC DEFAULT NULL,
  p_rate_date        DATE DEFAULT NULL,
  p_membership_id    UUID DEFAULT NULL,
  p_due_date         DATE DEFAULT NULL,
  p_notes_en         TEXT DEFAULT NULL,
  p_notes_ar         TEXT DEFAULT NULL,
  p_notes_fr         TEXT DEFAULT NULL,
  p_payer_profile_id UUID DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- D1 guards, unchanged: staff-only + same-gym.
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may issue invoices'; END IF;
  IF p_gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Cross-gym invoice not allowed'; END IF;
  RETURN _system_issue_invoice(
    p_gym_id, p_student_id, p_invoice_type, p_amount_usd, p_amount_lbp,
    p_exchange_rate, p_rate_date, p_membership_id, p_due_date,
    p_notes_en, p_notes_ar, p_notes_fr, p_payer_profile_id);
END;
$$;
GRANT EXECUTE ON FUNCTION issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 5. request_class_registration — guardians may request FOR a linked kid
--    (B3 portal request-for-kid; staff path unchanged).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION request_class_registration(
  p_class_id UUID, p_student_id UUID DEFAULT NULL
) RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student students;
  v_class   classes;
  v_reg     class_registrations;
  v_name    TEXT;
  v_dob     DATE;
  v_age     INT;
BEGIN
  IF p_student_id IS NULL THEN
    SELECT * INTO v_student FROM students WHERE profile_id = auth.uid() LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Only a member may request a class'; END IF;
  ELSE
    -- B3: staff OR a linked guardian may act for the named student.
    IF NOT (is_staff() OR is_guardian_of(p_student_id)) THEN
      RAISE EXCEPTION 'Only staff or a linked guardian may register another member';
    END IF;
    SELECT * INTO v_student FROM students WHERE id = p_student_id;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student % not found', p_student_id; END IF;
    IF is_staff() AND v_student.gym_id <> get_user_gym_id() THEN
      RAISE EXCEPTION 'Member is not in your gym';
    END IF;
  END IF;

  SELECT * INTO v_class FROM classes WHERE id = p_class_id;
  IF v_class.id IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF NOT v_class.is_active THEN RAISE EXCEPTION 'Class is not active'; END IF;
  IF v_class.gym_id <> v_student.gym_id THEN RAISE EXCEPTION 'Class and member are in different gyms'; END IF;

  IF v_class.belt_requirement IS NOT NULL AND v_student.current_belt_rank < v_class.belt_requirement THEN
    RAISE EXCEPTION 'Member does not meet the belt requirement for this class';
  END IF;
  SELECT date_of_birth INTO v_dob FROM profiles WHERE id = v_student.profile_id;
  IF v_dob IS NOT NULL THEN
    v_age := date_part('year', age(v_dob));
    IF v_class.min_age IS NOT NULL AND v_age < v_class.min_age THEN RAISE EXCEPTION 'Member is below the minimum age for this class'; END IF;
    IF v_class.max_age IS NOT NULL AND v_age > v_class.max_age THEN RAISE EXCEPTION 'Member is above the maximum age for this class'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM class_registrations
             WHERE class_id = p_class_id AND student_id = v_student.id
               AND status IN ('requested', 'active', 'waitlisted')) THEN
    RAISE EXCEPTION 'There is already an open registration for this class';
  END IF;

  INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, monthly_fee_lbp, requested_at)
  VALUES (p_class_id, v_student.id, v_class.gym_id, 'requested', v_class.monthly_fee_usd, v_class.monthly_fee_lbp, now())
  RETURNING * INTO v_reg;

  SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name FROM profiles p WHERE p.id = v_student.profile_id;
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
  SELECT ur.user_id, v_class.gym_id, 'class_requested', 'messages.class_requested.title', 'messages.class_requested.body',
         jsonb_build_object('studentName', v_name, 'class', COALESCE(v_class.name_en, v_class.name_ar)),
         'class_registration', v_reg.id, '/classes/' || p_class_id
  FROM user_roles ur WHERE ur.gym_id = v_class.gym_id AND ur.role IN ('owner', 'receptionist');

  RETURN v_reg;
END;
$$;
GRANT EXECUTE ON FUNCTION request_class_registration(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 6. e2e seed: guardian Rana (login-capable, role 'parent') linked to two kid
--    students (Omar, existing login-less + NEW Lina). Wraps the ADM-1 wrapper.
-- -----------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_adm1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_adm1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym       UUID;
  v_parent    UUID;
  v_guard_row UUID;
  v_omar      UUID;
  v_lina_prof UUID;
  v_lina_stu  UUID;
BEGIN
  v_gym := seed_e2e_gym_adm1(p_slug, p_password);

  -- Idempotent: skip if this run's guardian already exists.
  SELECT id INTO v_parent FROM auth.users WHERE email = 'parent+' || p_slug || '@e2e.local';
  IF v_parent IS NOT NULL THEN
    RETURN v_gym;
  END IF;

  -- Guardian auth user (phone-OTP stand-in: email+password like the other roles).
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'parent+' || p_slug || '@e2e.local',
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('gym_id', v_gym::text),
    now(), now(), '', '', '', '')
  RETURNING id INTO v_parent;

  INSERT INTO user_roles (user_id, gym_id, role, is_primary) VALUES (v_parent, v_gym, 'parent', true);
  UPDATE profiles SET first_name_ar='رنا', first_name_en='Rana', first_name_fr='Rana',
    last_name_ar='مراد', last_name_en='Mourad', last_name_fr='Mourad', phone='+96170000003', gender='female'
  WHERE id = v_parent;

  INSERT INTO guardians (profile_id, gym_id, relationship_ar, relationship_en, relationship_fr, is_primary_contact)
  VALUES (v_parent, v_gym, 'الأم', 'Mother', 'Mère', true)
  RETURNING id INTO v_guard_row;

  -- Kid A: Omar (seeded login-less student).
  SELECT s.id INTO v_omar
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.gym_id = v_gym AND p.first_name_en = 'Omar'
  LIMIT 1;
  IF v_omar IS NOT NULL THEN
    INSERT INTO guardian_students (guardian_id, student_id) VALUES (v_guard_row, v_omar)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Kid B: Lina (new login-less kid; DOB ⇒ a minor).
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, phone, gender, date_of_birth)
  VALUES (v_gym, 'لينا', 'Lina', 'Lina', 'مراد', 'Mourad', 'Mourad', '+96170000004', 'female', CURRENT_DATE - INTERVAL '9 years')
  RETURNING id INTO v_lina_prof;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_lina_prof, v_gym, 'white', CURRENT_DATE - 30, true)
  RETURNING id INTO v_lina_stu;
  INSERT INTO guardian_students (guardian_id, student_id) VALUES (v_guard_row, v_lina_stu)
  ON CONFLICT DO NOTHING;

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
