-- ============================================================
-- 000048: ML-1 SEED TWEAK — lifecycle time-travel fixtures (V1 / ML-1, part 3)
-- PRO LINE Gym Platform
--
-- SEED-ONLY (no schema). The dunning/lapse legs need PAST dates that a spec
-- cannot fabricate at runtime; every run gym gets:
--   · OMAR: membership on the cheapest plan ENDED 15 DAYS AGO, status still
--     'active' → one tick must issue the (overdue) renewal, remind, and LAPSE
--     it in the same pass.
--   · 'Lifecycle Class' (capacity 1, weekday-less — pure roster fixture):
--     OMAR active registration with paid_until 15 DAYS AGO (→ tick issues +
--     SUSPENDS, seat frees) and LINA WAITLISTED at position 1 (→ the B2
--     auto-promote must seat her).
-- Karim's ending-today membership (FD-1 seed) remains the clean renewal+
-- idempotency fixture. Teardown unchanged.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_e1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_e1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym   UUID;
  v_omar  UUID;
  v_lina  UUID;
  v_plan  UUID;
  v_cls   UUID;
  v_disc  UUID;
BEGIN
  v_gym := seed_e2e_gym_e1(p_slug, p_password);

  SELECT s.id INTO v_omar FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.gym_id = v_gym AND p.first_name_en = 'Omar' LIMIT 1;
  SELECT s.id INTO v_lina FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.gym_id = v_gym AND p.first_name_en = 'Lina' LIMIT 1;
  SELECT id INTO v_plan FROM membership_plans
  WHERE gym_id = v_gym AND is_active = true ORDER BY price_usd ASC LIMIT 1;

  IF v_omar IS NULL OR v_lina IS NULL OR v_plan IS NULL THEN RETURN v_gym; END IF;

  -- Idempotent: one lapse-track membership per run gym.
  IF EXISTS (
    SELECT 1 FROM student_memberships sm
    JOIN students s ON s.id = sm.student_id
    WHERE s.gym_id = v_gym AND sm.end_date = CURRENT_DATE - 15
  ) THEN
    RETURN v_gym;
  END IF;

  -- Omar: ended -15d, still marked active → the tick's lapse fixture.
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
  VALUES (v_omar, v_plan, CURRENT_DATE - 45, CURRENT_DATE - 15, 'active');

  -- Lifecycle Class: capacity 1; Omar holds the seat unpaid; Lina waits.
  -- (classes.discipline_id is NOT NULL — the real-columns rule bites both ways.)
  SELECT id INTO v_disc FROM disciplines WHERE gym_id = v_gym AND is_active LIMIT 1;
  INSERT INTO classes (gym_id, discipline_id, name_ar, name_en, name_fr, max_capacity, monthly_fee_usd, is_active, status, show_on_landing)
  VALUES (v_gym, v_disc, 'حصة دورة الحياة', 'Lifecycle Class', 'Cours cycle de vie', 1, 40.00, true, 'scheduled', false)
  RETURNING id INTO v_cls;

  INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, start_date, paid_until, requested_at, approved_at)
  VALUES (v_cls, v_omar, v_gym, 'active', 40.00, CURRENT_DATE - 45, CURRENT_DATE - 15, now() - INTERVAL '45 days', now() - INTERVAL '45 days');
  INSERT INTO class_enrollments (class_id, student_id, is_active)
  VALUES (v_cls, v_omar, true)
  ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;

  INSERT INTO class_registrations (class_id, student_id, gym_id, status, waitlist_position, monthly_fee_usd, requested_at)
  VALUES (v_cls, v_lina, v_gym, 'waitlisted', 1, 40.00, now() - INTERVAL '40 days');

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
