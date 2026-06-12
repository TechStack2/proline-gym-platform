-- ============================================================
-- 000042: PT-1 SEED TWEAK — deterministic EXPIRED-package fixture (V1 / PT-1)
-- PRO LINE Gym Platform
--
-- SEED-ONLY (no schema/policy change). Wraps the FD-1 seeder so every e2e run
-- gym carries one EXPIRED-but-active PT assignment for Karim on the (otherwise
-- unused) '5 Sessions Pack': 4 of 5 credits left, validity ended yesterday.
-- Proves the expiry freeze (schedule/complete blocked with a clear message)
-- and the staff Extend un-freeze, without run_sql gymnastics mid-spec.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_fd1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_fd1;
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
  v_karim UUID;
  v_coach UUID;
  v_pkg   UUID;
BEGIN
  v_gym := seed_e2e_gym_fd1(p_slug, p_password);

  SELECT s.id INTO v_karim
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.gym_id = v_gym AND p.first_name_en = 'Karim'
  LIMIT 1;
  SELECT id INTO v_coach FROM coaches WHERE gym_id = v_gym AND is_active LIMIT 1;
  SELECT id INTO v_pkg FROM pt_packages WHERE gym_id = v_gym AND name_en = '5 Sessions Pack' LIMIT 1;

  IF v_karim IS NULL OR v_coach IS NULL OR v_pkg IS NULL THEN
    RETURN v_gym; -- defensive: base seed changed shape; skip the fixture
  END IF;

  -- Idempotent: one expired fixture per run gym.
  IF EXISTS (
    SELECT 1 FROM pt_assignments
    WHERE student_id = v_karim AND package_id = v_pkg AND status = 'active' AND expires_at < now()
  ) THEN
    RETURN v_gym;
  END IF;

  INSERT INTO pt_assignments (
    student_id, package_id, coach_id, sessions_total, sessions_used,
    status, is_active, purchased_at, expires_at, approved_at
  )
  VALUES (
    v_karim, v_pkg, v_coach, 5, 1,
    'active', true, now() - INTERVAL '61 days', now() - INTERVAL '1 day', now() - INTERVAL '61 days'
  );

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
