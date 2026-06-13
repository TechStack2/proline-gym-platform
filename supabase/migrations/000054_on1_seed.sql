-- ============================================================
-- 000054: ON-1 SEED TWEAK — isolated login-less invite fixtures (V1 / ON-1)
-- PRO LINE Gym Platform
--
-- SEED-ONLY (no schema). ON-1's e2e adopts login-less profiles into auth users.
-- Rather than perturb shared actors (Omar/Sami are used by ml1/e1/adm specs),
-- the run gym gets DEDICATED login-less fixtures the invite test owns:
--   · "Adopt Member" — a login-less STUDENT with a phone + a PAID membership
--     invoice already on file → proves identity integrity survives adoption
--     (the auth user is created with this profile's id; the invoice still
--     resolves because the id never changes).
--   · "Adopt Coach" — a login-less COACH with a phone → the team-invite path
--     (elevated scope: members AND team).
-- Neither has a user_roles row (login-less) — the invite action adds it.
-- Teardown (000053) removes the auth users these become; the profiles drop with
-- the gym. Idempotent on the unique names.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_fin1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_fin1;
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
  v_disc UUID;
  v_mp   UUID;  -- member profile
  v_ms   UUID;  -- member student
  v_mem  UUID;  -- membership
  v_cp   UUID;  -- coach profile
BEGIN
  v_gym := seed_e2e_gym_fin1(p_slug, p_password);

  -- Idempotent: one ON-1 adopt-member per run gym.
  IF EXISTS (
    SELECT 1 FROM profiles WHERE gym_id = v_gym AND first_name_en = 'Adopt'
  ) THEN
    RETURN v_gym;
  END IF;

  SELECT id INTO v_plan FROM membership_plans WHERE gym_id = v_gym AND is_active = true ORDER BY price_usd LIMIT 1;
  SELECT id INTO v_disc FROM disciplines WHERE gym_id = v_gym AND is_active LIMIT 1;

  -- ── Adopt Member: login-less student + phone + a PAID membership invoice ──
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'عضو', 'Adopt', 'Adopt', 'للتبني', 'Member', 'Membre', '+96176000501', 'male')
  RETURNING id INTO v_mp;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_mp, v_gym, 'white', CURRENT_DATE - 30, true) RETURNING id INTO v_ms;
  IF v_plan IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
    VALUES (v_ms, v_plan, CURRENT_DATE - 10, CURRENT_DATE + 20, 'active') RETURNING id INTO v_mem;
    -- A PAID invoice already on file → the identity-integrity proof post-adoption.
    INSERT INTO invoices (gym_id, student_id, membership_id, invoice_type, invoice_number, amount_usd, amount_lbp, tax_rate, total_usd, status, due_date, paid_at, notes_en)
    VALUES (v_gym, v_ms, v_mem, 'membership', '', 50.00, 0, 11.00, 55.50, 'paid', CURRENT_DATE - 10, now() - INTERVAL '10 days', 'ON-1 pre-adoption invoice');
  END IF;

  -- ── Adopt Coach: login-less coach + phone (team-invite path) ──
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'مدرب', 'Adopt', 'Adopt', 'للتبني', 'Coachee', 'Coachee', '+96176000502', 'male')
  RETURNING id INTO v_cp;
  INSERT INTO coaches (profile_id, gym_id, specialization_ar, specialization_en, specialization_fr, is_active)
  VALUES (v_cp, v_gym, 'ملاكمة', 'Boxing', 'Boxe', true);

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
