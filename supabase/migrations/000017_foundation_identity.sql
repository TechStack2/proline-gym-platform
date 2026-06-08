-- ============================================================
-- 000017: FOUNDATION & IDENTITY INTEGRITY (Cycle 5 / Phase 0 / F1)
-- PRO LINE Gym Platform — BLOCKING fix
--
-- Root cause of every empty portal: the identity chain was broken.
--   1. The auto-profile trigger `on_auth_user_created` was never attached
--      (commented out in 000005) → new auth.users got no profiles row.
--   2. 000006 tried to create demo profiles/coaches by looking up auth.users
--      that don't exist until 000008 → guarded inserts silently skipped.
--   3. 000008 created auth.users + user_roles but no profiles.
-- Net: all 4 demo logins had no profiles row → get_user_gym_id() = NULL →
--      every gym-scoped query returned nothing. And because no coach profiles
--      existed when 000006 ran, no coaches/classes were seeded either.
--
-- This forward-only, idempotent migration:
--   A. Makes handle_new_user() robust + attaches the trigger (real signups).
--   B. Backfills a COHERENT demo gym for the 4 logins: profiles, a coach with
--      a class + schedule, and a student enrolled in that class with a belt
--      promotion + an invoice + a membership.
-- Safe to re-run.
-- ============================================================

-- -----------------------------------------------------------
-- A. Auto-profile on signup (robust + idempotent) + attach trigger
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  -- Prefer an explicit gym from signup metadata; fall back to the single
  -- active gym (V1 is single-tenant in practice).
  BEGIN
    v_gym_id := NULLIF(NEW.raw_user_meta_data->>'gym_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_gym_id := NULL;
  END;

  IF v_gym_id IS NULL THEN
    SELECT id INTO v_gym_id FROM gyms WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- profiles.gym_id is NOT NULL: only create the profile once a gym exists.
  -- (Never block the auth signup if no gym is provisioned yet.)
  IF v_gym_id IS NOT NULL THEN
    INSERT INTO profiles (id, gym_id, phone, created_at, updated_at)
    VALUES (NEW.id, v_gym_id, NEW.phone, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------
-- B. Backfill a coherent demo gym for the 4 demo logins (idempotent)
-- -----------------------------------------------------------
DO $$
DECLARE
  v_gym         UUID;
  v_owner       UUID;
  v_coach       UUID;
  v_recept      UUID;
  v_student     UUID;
  v_disc        UUID;
  v_belt_h      UUID;
  v_plan        UUID;
  v_coach_row   UUID;
  v_student_row UUID;
  v_class       UUID;
BEGIN
  SELECT id INTO v_gym FROM gyms WHERE slug = 'proline-gym';
  IF v_gym IS NULL THEN
    RAISE NOTICE '000017: proline-gym not found — skipping demo backfill';
    RETURN;
  END IF;

  SELECT id INTO v_owner   FROM auth.users WHERE email = 'owner@prolinegym.lb';
  SELECT id INTO v_coach   FROM auth.users WHERE email = 'coach@prolinegym.lb';
  SELECT id INTO v_recept  FROM auth.users WHERE email = 'reception@prolinegym.lb';
  SELECT id INTO v_student FROM auth.users WHERE email = 'student@prolinegym.lb';

  -- Resolve seeded reference rows (disciplines / belts / plans all exist post-000006)
  SELECT id INTO v_disc FROM disciplines WHERE gym_id = v_gym AND name_en = 'Muay Thai' LIMIT 1;
  IF v_disc IS NULL THEN SELECT id INTO v_disc FROM disciplines WHERE gym_id = v_gym ORDER BY sort_order LIMIT 1; END IF;
  SELECT id INTO v_belt_h FROM belt_hierarchies WHERE discipline_id = v_disc AND rank = 'white' LIMIT 1;
  IF v_belt_h IS NULL THEN SELECT id INTO v_belt_h FROM belt_hierarchies WHERE discipline_id = v_disc ORDER BY sort_order LIMIT 1; END IF;
  SELECT id INTO v_plan FROM membership_plans WHERE gym_id = v_gym AND name_en = 'Monthly' LIMIT 1;

  -- ---- Profiles for all 4 logins (self-healing: ensure gym_id set) ----
  IF v_owner IS NOT NULL THEN
    INSERT INTO profiles (id, gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, created_at, updated_at)
    VALUES (v_owner, v_gym, 'المالك', 'Owner', 'Propriétaire', 'برولاين', 'Proline', 'Proline', '+96170000010', now(), now())
    ON CONFLICT (id) DO UPDATE SET gym_id = EXCLUDED.gym_id, updated_at = now();
  END IF;

  IF v_recept IS NOT NULL THEN
    INSERT INTO profiles (id, gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, created_at, updated_at)
    VALUES (v_recept, v_gym, 'الاستقبال', 'Reception', 'Réception', 'برولاين', 'Proline', 'Proline', '+96170000011', now(), now())
    ON CONFLICT (id) DO UPDATE SET gym_id = EXCLUDED.gym_id, updated_at = now();
  END IF;

  IF v_coach IS NOT NULL THEN
    INSERT INTO profiles (id, gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender, created_at, updated_at)
    VALUES (v_coach, v_gym, 'سامي', 'Sami', 'Sami', 'حداد', 'Haddad', 'Haddad', '+96170000012', 'male', now(), now())
    ON CONFLICT (id) DO UPDATE SET gym_id = EXCLUDED.gym_id, updated_at = now();

    -- Coach record (so the Coach portal resolves a real coach)
    INSERT INTO coaches (profile_id, gym_id, specialization_ar, specialization_en, specialization_fr, belt_rank, hourly_rate_usd, is_active)
    SELECT v_coach, v_gym, 'ملاكمة تايلاندية', 'Muay Thai', 'Muay Thaï', 'black_1', 25.00, true
    WHERE NOT EXISTS (SELECT 1 FROM coaches WHERE profile_id = v_coach);

    SELECT id INTO v_coach_row FROM coaches WHERE profile_id = v_coach LIMIT 1;
  END IF;

  -- ---- A class taught by the demo coach (+ weekly schedule) ----
  IF v_coach_row IS NOT NULL AND v_disc IS NOT NULL THEN
    SELECT id INTO v_class FROM classes WHERE gym_id = v_gym AND name_en = 'Muay Thai Beginner' LIMIT 1;
    IF v_class IS NULL THEN
      INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active)
      VALUES (v_gym, v_disc, v_coach_row, 'ملاكمة تايلاندية - مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant', 'Main Floor', 20, '#E53E3E', true)
      RETURNING id INTO v_class;
    END IF;

    -- Mon + Wed 18:00–19:30
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    SELECT v_class, 1, '18:00', '19:30', true
    WHERE NOT EXISTS (SELECT 1 FROM class_schedules WHERE class_id = v_class AND day_of_week = 1);
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    SELECT v_class, 3, '18:00', '19:30', true
    WHERE NOT EXISTS (SELECT 1 FROM class_schedules WHERE class_id = v_class AND day_of_week = 3);
  END IF;

  -- ---- Student record + enrollment + belt + invoice + membership ----
  IF v_student IS NOT NULL THEN
    INSERT INTO profiles (id, gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender, created_at, updated_at)
    VALUES (v_student, v_gym, 'كريم', 'Karim', 'Karim', 'مراد', 'Mourad', 'Mourad', '+96170000001', 'male', now(), now())
    ON CONFLICT (id) DO UPDATE SET gym_id = EXCLUDED.gym_id, updated_at = now();

    INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
    SELECT v_student, v_gym, 'Ali Mourad', '+961 70 000 099', 'white', CURRENT_DATE - 30, true
    WHERE NOT EXISTS (SELECT 1 FROM students WHERE profile_id = v_student);

    SELECT id INTO v_student_row FROM students WHERE profile_id = v_student LIMIT 1;

    -- Enroll in the demo class
    IF v_student_row IS NOT NULL AND v_class IS NOT NULL THEN
      INSERT INTO class_enrollments (class_id, student_id, is_active)
      VALUES (v_class, v_student_row, true)
      ON CONFLICT (class_id, student_id) DO NOTHING;
    END IF;

    -- Belt promotion (progress) — needs a coach + belt hierarchy
    IF v_student_row IS NOT NULL AND v_coach_row IS NOT NULL AND v_belt_h IS NOT NULL THEN
      INSERT INTO belt_promotions (student_id, coach_id, discipline_id, belt_hierarchy_id, from_rank, to_rank, promotion_date, notes_en)
      SELECT v_student_row, v_coach_row, v_disc, v_belt_h, NULL, 'white', CURRENT_DATE - 30, 'Initial grading'
      WHERE NOT EXISTS (SELECT 1 FROM belt_promotions WHERE student_id = v_student_row AND to_rank = 'white');
    END IF;

    -- An invoice (billing) — dual-currency; triggers fill number + totals
    IF v_student_row IS NOT NULL THEN
      INSERT INTO invoices (gym_id, student_id, invoice_type, invoice_number, amount_usd, amount_lbp, total_usd, status, due_date, notes_en)
      SELECT v_gym, v_student_row, 'membership', '', 50.00, 0, 50.00, 'pending', CURRENT_DATE + 14, 'Demo membership invoice'
      WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE student_id = v_student_row AND notes_en = 'Demo membership invoice');
    END IF;

    -- A membership (so billing/schedule context is coherent)
    IF v_student_row IS NOT NULL AND v_plan IS NOT NULL THEN
      INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
      SELECT v_student_row, v_plan, CURRENT_DATE - 5, CURRENT_DATE + 25, 'active', true
      WHERE NOT EXISTS (SELECT 1 FROM student_memberships WHERE student_id = v_student_row AND status = 'active');
    END IF;
  END IF;
END $$;
