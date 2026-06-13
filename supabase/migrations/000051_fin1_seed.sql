-- ============================================================
-- 000051: FIN-1 SEED TWEAK — horizon + churn/win-back fixtures (V1 / FIN-1)
-- PRO LINE Gym Platform
--
-- SEED-ONLY (no schema). FIN-1 needs deterministic fixtures that DON'T depend
-- on the ML-1 tick having run (ml1's spec both LAPSES and later REINSTATES
-- Omar, and runs before fin1 in the project order — so Omar is an unreliable
-- churn fixture by the time fin1 runs). FIN-1 therefore owns ISOLATED rows no
-- other spec touches:
--   · HORIZON student "Horizon Member": active membership ending +6 DAYS →
--     appears in the Week & Month expiring lenses but NOT Today (the distinct-
--     count proof). Plus an OPEN invoice due +6d (projected-collections proof).
--   · WIN-BACK student "Dropped Member": membership already 'lapsed', ended
--     -20d, lapsed_at set to THIS month → shows in churn-this-month AND the
--     win-back queue without needing the tick; reinstate flips it read-time.
--     Plus an aged OPEN invoice due -40d (the 31–60d aging-bucket proof).
-- Wraps the ML-1 seed (rename-once chain). Idempotent on the unique names.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_ml1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_ml1;
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
  v_plan  UUID;
  v_hp    UUID;  -- horizon profile
  v_hs    UUID;  -- horizon student
  v_dp    UUID;  -- dropped profile
  v_ds    UUID;  -- dropped student
  v_mem   UUID;
BEGIN
  v_gym := seed_e2e_gym_ml1(p_slug, p_password);

  SELECT id INTO v_plan FROM membership_plans
  WHERE gym_id = v_gym AND is_active = true ORDER BY price_usd ASC LIMIT 1;
  IF v_plan IS NULL THEN RETURN v_gym; END IF;

  -- Idempotent: one FIN-1 horizon member per run gym.
  IF EXISTS (
    SELECT 1 FROM students s JOIN profiles p ON p.id = s.profile_id
    WHERE s.gym_id = v_gym AND p.first_name_en = 'Horizon'
  ) THEN
    RETURN v_gym;
  END IF;

  -- ── Horizon member: membership ending +6d + an open invoice due +6d ──
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'أفق', 'Horizon', 'Horizon', 'عضو', 'Member', 'Membre', '+96170000301', 'male')
  RETURNING id INTO v_hp;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_hp, v_gym, 'white', CURRENT_DATE - 30, true) RETURNING id INTO v_hs;
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
  VALUES (v_hs, v_plan, CURRENT_DATE - 24, CURRENT_DATE + 6, 'active');
  INSERT INTO invoices (gym_id, student_id, invoice_type, invoice_number, amount_usd, amount_lbp, tax_rate, total_usd, status, due_date, notes_en)
  VALUES (v_gym, v_hs, 'membership', '', 50.00, 0, 11.00, 55.50, 'pending', CURRENT_DATE + 6, 'FIN-1 horizon invoice (+6d)');

  -- ── Dropped member: already lapsed (ended -20d, lapsed THIS month) + an
  --    aged open invoice due -40d (31–60d aging bucket). lapsed_at is set
  --    EXPLICITLY (status starts 'lapsed' so the churn trigger won't fire). ──
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'منسحب', 'Dropped', 'Abandonné', 'عضو', 'Member', 'Membre', '+96170000302', 'female')
  RETURNING id INTO v_dp;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_dp, v_gym, 'white', CURRENT_DATE - 60, true) RETURNING id INTO v_ds;
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, lapsed_at)
  VALUES (v_ds, v_plan, CURRENT_DATE - 50, CURRENT_DATE - 20, 'lapsed',
          date_trunc('month', now()) + INTERVAL '2 days')
  RETURNING id INTO v_mem;
  INSERT INTO invoices (gym_id, student_id, membership_id, invoice_type, invoice_number, amount_usd, amount_lbp, tax_rate, total_usd, status, due_date, notes_en)
  VALUES (v_gym, v_ds, v_mem, 'membership', '', 50.00, 0, 11.00, 55.50, 'overdue', CURRENT_DATE - 40, 'FIN-1 aged invoice (-40d)');

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
