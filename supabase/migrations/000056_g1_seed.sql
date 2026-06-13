-- ============================================================
-- 000056: G1 SEED TWEAK — WhatsApp forced-error fixture (V1 / G1)
-- PRO LINE Gym Platform
--
-- SEED-ONLY. The G1 dispatch e2e proves best-effort routing on ONE gym by
-- toggling its WhatsApp config (not_configured → active) and reminding members:
--   · the normal path reuses ON-1's "Adopt Member" (phone +96176000501, active
--     membership) → record-mode dispatch → outbound row 'sent'.
--   · this fixture, "WA Force", has a SENTINEL phone (digits ending in 7+ zeros)
--     which the record-mode provider treats as a forced failure → outbound row
--     'failed' while the in-app notification + the action still succeed (the
--     best-effort / no-rollback proof). Plus an active membership to remind.
-- Wraps the ON-1 seed (rename-once chain). Idempotent on the unique name.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_on1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_on1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym  UUID;
  v_plan UUID;
  v_fp   UUID;  -- force profile
  v_fs   UUID;  -- force student
BEGIN
  v_gym := seed_e2e_gym_on1(p_slug, p_password);

  IF EXISTS (SELECT 1 FROM profiles WHERE gym_id = v_gym AND first_name_en = 'WA') THEN
    RETURN v_gym;
  END IF;

  SELECT id INTO v_plan FROM membership_plans WHERE gym_id = v_gym AND is_active = true ORDER BY price_usd LIMIT 1;

  -- WA Force: sentinel phone (record-mode provider forces a send failure) + an
  -- active membership so a renewal reminder has something to target.
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'واتساب', 'WA', 'WA', 'فشل', 'Force', 'Force', '+9610000000', 'male')
  RETURNING id INTO v_fp;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_fp, v_gym, 'white', CURRENT_DATE - 30, true) RETURNING id INTO v_fs;
  IF v_plan IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
    VALUES (v_fs, v_plan, CURRENT_DATE - 10, CURRENT_DATE + 20, 'active');
  END IF;

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
