-- ============================================================
-- 000029: EPHEMERAL PER-RUN E2E GYM (Cycle 5 / Test-Infra hardening)
-- PRO LINE Gym Platform
--
-- The e2e suite was flaky because it ran against the ACCUMULATING shared demo
-- gym (C1 took 7 CI runs to converge). This gives every CI run its OWN fully-
-- seeded gym, provisioned before Playwright and torn down after — the demo
-- `proline-gym` is never touched by e2e again.
--
-- These are ADMIN functions run only via the Supabase Management API (postgres)
-- in CI. They mint gyms + auth.users, so EXECUTE is REVOKED from PUBLIC — they
-- are NOT callable by app (anon/authenticated) users.
--
-- Also: X1 (the only prod-code-adjacent change) — submit_public_lead gains an
-- optional gym-slug selector so CI's landing-page submit targets the run gym;
-- prod (no slug) still defaults to the demo gym.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------
-- sweep_stale_e2e_gyms — failed-teardown safety net (X2)
-- Drops e2e-* gyms older than p_hours + their run-scoped auth.users.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION sweep_stale_e2e_gyms(p_hours INTEGER DEFAULT 2)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, slug FROM gyms
    WHERE slug LIKE 'e2e-%' AND created_at < now() - make_interval(hours => p_hours)
  LOOP
    DELETE FROM auth.users WHERE email LIKE '%+' || r.slug || '@e2e.local';
    DELETE FROM gyms WHERE id = r.id; -- CASCADE clears profiles/students/classes/...
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sweep_stale_e2e_gyms(INTEGER) FROM PUBLIC;

-- -----------------------------------------------------------
-- teardown_e2e_gym(slug) — drop the run gym + its users; then sweep (X2/X3)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION teardown_e2e_gym(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Run-scoped logins are not FK'd from profiles (000018 dropped that FK), so
  -- delete them explicitly (CASCADE clears user_roles). Then drop the gym.
  DELETE FROM auth.users WHERE email LIKE '%+' || p_slug || '@e2e.local';
  DELETE FROM gyms WHERE slug = p_slug; -- CASCADE clears profiles/students/classes/...
  PERFORM sweep_stale_e2e_gyms(2);
END;
$$;
REVOKE ALL ON FUNCTION teardown_e2e_gym(TEXT) FROM PUBLIC;

-- -----------------------------------------------------------
-- seed_e2e_gym(slug, password) — a fully-seeded, isolated gym per run.
-- Generalizes 000006 (disciplines/belts/plans/packages) + 000017 (coherent
-- identity) + 000019 (single-session PT) for an arbitrary slug. Idempotent per
-- slug. Returns the gym id.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym       UUID;
  v_owner     UUID;
  v_coach     UUID;
  v_recept    UUID;
  v_student   UUID;
  v_disc_mt   UUID;
  v_disc_bx   UUID;
  v_coach_row UUID;
  v_class     UUID;
  v_stu_row   UUID;
  v_omar_id   UUID;
  v_omar_row  UUID;
  v_plan      UUID;
  v_mem       UUID;
  d           INTEGER;
BEGIN
  -- Safety net: clear any long-orphaned e2e gyms first.
  PERFORM sweep_stale_e2e_gyms(2);

  -- Idempotent per slug.
  SELECT id INTO v_gym FROM gyms WHERE slug = p_slug;
  IF v_gym IS NOT NULL THEN
    RETURN v_gym;
  END IF;

  -- ---- Gym ----
  INSERT INTO gyms (name_ar, name_en, name_fr, slug, city, country, phone, timezone, currency_preference)
  VALUES ('برولاين تجريبي', 'PRO LINE E2E', 'PRO LINE E2E', p_slug, 'Baabda', 'Lebanon', '+96170000000', 'Asia/Beirut', 'USD')
  RETURNING id INTO v_gym;

  -- ---- 4 run-scoped auth.users (the handle_new_user trigger fills profiles
  --      with gym_id from raw_user_meta_data). Emails carry the slug so teardown
  --      can target them. ----
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'owner+' || p_slug || '@e2e.local',
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('gym_id', v_gym::text),
    now(), now(), '', '', '', '')
  RETURNING id INTO v_owner;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'coach+' || p_slug || '@e2e.local',
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('gym_id', v_gym::text),
    now(), now(), '', '', '', '')
  RETURNING id INTO v_coach;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'reception+' || p_slug || '@e2e.local',
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('gym_id', v_gym::text),
    now(), now(), '', '', '', '')
  RETURNING id INTO v_recept;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'student+' || p_slug || '@e2e.local',
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('gym_id', v_gym::text),
    now(), now(), '', '', '', '')
  RETURNING id INTO v_student;

  -- ---- Roles ----
  INSERT INTO user_roles (user_id, gym_id, role, is_primary) VALUES
    (v_owner, v_gym, 'owner', true),
    (v_coach, v_gym, 'coach', true),
    (v_recept, v_gym, 'receptionist', true),
    (v_student, v_gym, 'student', true);

  -- ---- Profile names (the trigger created the rows; fill display fields) ----
  UPDATE profiles SET first_name_ar='المالك', first_name_en='Owner', first_name_fr='Propriétaire',
    last_name_ar='تجريبي', last_name_en='E2E', last_name_fr='E2E', phone='+96170000010' WHERE id = v_owner;
  UPDATE profiles SET first_name_ar='الاستقبال', first_name_en='Reception', first_name_fr='Réception',
    last_name_ar='تجريبي', last_name_en='E2E', last_name_fr='E2E', phone='+96170000011' WHERE id = v_recept;
  UPDATE profiles SET first_name_ar='سامي', first_name_en='Sami', first_name_fr='Sami',
    last_name_ar='حداد', last_name_en='Haddad', last_name_fr='Haddad', phone='+96170000012', gender='male' WHERE id = v_coach;
  UPDATE profiles SET first_name_ar='كريم', first_name_en='Karim', first_name_fr='Karim',
    last_name_ar='مراد', last_name_en='Mourad', last_name_fr='Mourad', phone='+96170000001', gender='male' WHERE id = v_student;

  -- ---- Disciplines (Muay Thai + Boxing) ----
  INSERT INTO disciplines (gym_id, name_ar, name_en, name_fr, sort_order)
  VALUES (v_gym, 'ملاكمة تايلاندية', 'Muay Thai', 'Muay Thaï', 1) RETURNING id INTO v_disc_mt;
  INSERT INTO disciplines (gym_id, name_ar, name_en, name_fr, sort_order)
  VALUES (v_gym, 'ملاكمة', 'Boxing', 'Boxe', 2) RETURNING id INTO v_disc_bx;

  -- ---- Full 20-rank belt ladder for Muay Thai (headroom so one-way promotion
  --      never exhausts in a run) ----
  INSERT INTO belt_hierarchies (discipline_id, rank, name_ar, name_en, name_fr, sort_order, min_months_in_rank, min_classes_attended, is_black_belt)
  SELECT v_disc_mt, x.rank::belt_rank_enum, x.ar, x.en, x.fr, x.so, x.mm, x.mc, x.bb
  FROM (VALUES
    ('white','أبيض','White','Blanche',1,1,8,false),
    ('white_yellow','أبيض/أصفر','White/Yellow','Blanc/Jaune',2,2,16,false),
    ('yellow','أصفر','Yellow','Jaune',3,2,20,false),
    ('yellow_orange','أصفر/برتقالي','Yellow/Orange','Jaune/Orange',4,3,24,false),
    ('orange','برتقالي','Orange','Orange',5,3,24,false),
    ('orange_green','برتقالي/أخضر','Orange/Green','Orange/Vert',6,3,28,false),
    ('green','أخضر','Green','Verte',7,4,32,false),
    ('green_blue','أخضر/أزرق','Green/Blue','Vert/Bleu',8,4,36,false),
    ('blue','أزرق','Blue','Bleue',9,4,40,false),
    ('blue_purple','أزرق/أرجواني','Blue/Purple','Bleu/Violet',10,5,44,false),
    ('purple','أرجواني','Purple','Violette',11,5,48,false),
    ('purple_brown','أرجواني/بني','Purple/Brown','Violet/Marron',12,6,52,false),
    ('brown','بني','Brown','Marron',13,6,56,false),
    ('brown_black','بني/أسود','Brown/Black','Marron/Noir',14,6,60,false),
    ('red','أحمر','Red','Rouge',15,8,80,false),
    ('black_1','أسود °1','Black 1°','Noir 1°',16,12,120,true),
    ('black_2','أسود °2','Black 2°','Noir 2°',17,12,120,true),
    ('black_3','أسود °3','Black 3°','Noir 3°',18,12,120,true),
    ('black_4','أسود °4','Black 4°','Noir 4°',19,12,120,true),
    ('black_5','أسود °5','Black 5°','Noir 5°',20,12,120,true)
  ) AS x(rank, ar, en, fr, so, mm, mc, bb);

  -- ---- Coach (Sami) ----
  INSERT INTO coaches (profile_id, gym_id, specialization_ar, specialization_en, specialization_fr, belt_rank, hourly_rate_usd, is_active)
  VALUES (v_coach, v_gym, 'ملاكمة تايلاندية', 'Muay Thai', 'Muay Thaï', 'black_1', 25.00, true)
  RETURNING id INTO v_coach_row;

  -- ---- Class (Muay Thai Beginner) taught by Sami, scheduled EVERY weekday ----
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active)
  VALUES (v_gym, v_disc_mt, v_coach_row, 'ملاكمة تايلاندية - مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant', 'Main Floor', 20, '#E53E3E', true)
  RETURNING id INTO v_class;
  FOR d IN 0..6 LOOP
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class, d, '18:00', '19:30', true);
  END LOOP;

  -- ---- Membership plans ----
  INSERT INTO membership_plans (gym_id, name_ar, name_en, name_fr, duration_days, price_usd, price_lbp, max_classes_per_week, includes_pt)
  VALUES (v_gym, 'شهري', 'Monthly', 'Mensuel', 30, 50.00, 0, NULL, false) RETURNING id INTO v_plan;
  INSERT INTO membership_plans (gym_id, name_ar, name_en, name_fr, duration_days, price_usd, price_lbp, max_classes_per_week, includes_pt)
  VALUES (v_gym, 'ربع سنوي', 'Quarterly', 'Trimestriel', 90, 130.00, 0, NULL, false);
  INSERT INTO membership_plans (gym_id, name_ar, name_en, name_fr, duration_days, price_usd, price_lbp, max_classes_per_week, includes_pt)
  VALUES (v_gym, 'سنوي', 'Annual', 'Annuel', 365, 450.00, 0, NULL, true);

  -- ---- PT packages (incl. the single-session pack the PT specs exhaust) ----
  INSERT INTO pt_packages (gym_id, name_ar, name_en, name_fr, session_count, price_usd, price_lbp, validity_days, is_active) VALUES
    (v_gym, 'جلسة تدريب خاص واحدة', 'Single PT Session', 'Séance Coaching Unique', 1, 35.00, 0, 30, true),
    (v_gym, 'باقة 5 جلسات', '5 Sessions Pack', 'Pack 5 Séances', 5, 150.00, 0, 60, true),
    (v_gym, 'باقة 10 جلسات', '10 Sessions Pack', 'Pack 10 Séances', 10, 280.00, 0, 90, true);

  -- ---- Exchange rate (dual-currency coherence) ----
  INSERT INTO exchange_rates (rate, rate_date, source) VALUES (89000.00, CURRENT_DATE, 'manual')
  ON CONFLICT (rate_date, source) DO NOTHING;

  -- ---- Student Karim — enrolled, WHITE belt, CLEAN history (no promotions) ----
  INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_student, v_gym, 'Ali Mourad', '+96170000099', 'white', CURRENT_DATE - 30, true)
  RETURNING id INTO v_stu_row;
  INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_class, v_stu_row, true);

  -- A membership + an invoice so portal/billing is populated.
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
  VALUES (v_stu_row, v_plan, CURRENT_DATE - 5, CURRENT_DATE + 25, 'active', true)
  RETURNING id INTO v_mem;
  INSERT INTO invoices (gym_id, student_id, membership_id, invoice_type, invoice_number, amount_usd, amount_lbp, tax_rate, total_usd, status, due_date, notes_en)
  VALUES (v_gym, v_stu_row, v_mem, 'membership', '', 50.00, 0, 11.00, 50.00, 'pending', CURRENT_DATE + 14, 'E2E membership invoice');

  -- ---- A second roster student (no login) so the admin list has >1 ----
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
  VALUES (v_gym, 'عمر', 'Omar', 'Omar', 'خليل', 'Khalil', 'Khalil', '+96170000002', 'male')
  RETURNING id INTO v_omar_id;
  INSERT INTO students (profile_id, gym_id, current_belt_rank, belt_promotion_date, is_active)
  VALUES (v_omar_id, v_gym, 'white', CURRENT_DATE - 30, true) RETURNING id INTO v_omar_row;
  INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_class, v_omar_row, true);

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;

-- -----------------------------------------------------------
-- X1: submit_public_lead — optional gym selector (the only prod-adjacent change)
-- Prod (no slug) keeps the "first active gym" default (demo); CI passes the run
-- gym slug so the landing-page submit lands in the right gym.
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS submit_public_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION submit_public_lead(
  p_first_name TEXT,
  p_phone      TEXT,
  p_source     TEXT DEFAULT 'website',
  p_notes      TEXT DEFAULT NULL,
  p_last_name  TEXT DEFAULT NULL,
  p_email      TEXT DEFAULT NULL,
  p_program    TEXT DEFAULT NULL,
  p_gym_slug   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gym_id  UUID;
  v_lead_id UUID;
  v_disc    UUID;
BEGIN
  IF p_gym_slug IS NOT NULL AND p_gym_slug <> '' THEN
    SELECT id INTO v_gym_id FROM gyms WHERE slug = p_gym_slug AND is_active = true;
  END IF;
  IF v_gym_id IS NULL THEN
    SELECT id INTO v_gym_id FROM gyms WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No active gym found';
  END IF;

  IF p_program IS NOT NULL AND p_program <> '' THEN
    SELECT id INTO v_disc FROM disciplines
    WHERE gym_id = v_gym_id AND (name_en = p_program OR name_ar = p_program OR name_fr = p_program)
    LIMIT 1;
  END IF;

  INSERT INTO leads (gym_id, first_name, last_name, phone, email, source, interested_discipline_id, notes, status)
  VALUES (v_gym_id, p_first_name, NULLIF(p_last_name, ''), p_phone, NULLIF(p_email, ''), p_source, v_disc, p_notes, 'new')
  RETURNING id INTO v_lead_id;

  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
  SELECT ur.user_id, v_gym_id, 'lead_new', 'messages.lead_new.title', 'messages.lead_new.body',
         jsonb_build_object('leadName', p_first_name), 'lead', v_lead_id, '/leads'
  FROM user_roles ur
  WHERE ur.gym_id = v_gym_id AND ur.role IN ('owner', 'receptionist');

  RETURN v_lead_id;
END;
$$;
GRANT EXECUTE ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
