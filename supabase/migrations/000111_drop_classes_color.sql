-- ════════════════════════════════════════════════════════════════════════════
-- CLASSES-COLOR-DROP (000111) — drop the vestigial `classes.color` column.
--
-- W3b proved the STAFF shells never read it, and no app WRITE path has set it in a long
-- time (AddClassModal / ClassDetail build color-free payloads). This slice found and
-- retired the two remaining LIVE dependencies W3b's staff-only proof did not cover:
--   1. get_landing_schedule (latest def 000081) still RETURNED color, and the public
--      landing's ScheduleSection painted per-class cells with it. The column was never
--      user-settable, so those colours were stale seed values; the cells now fall back
--      to the gym brand (var(--brand)) — a brand-consistent simplification.
--   2. seed_e2e_gym_base (latest def 000098) still INSERTed color, and it runs at TEST
--      time on every seed_e2e_gym / seed_e2e_wl_gym call — so the drop would break every
--      gym-seeding e2e unless the seed stops writing color.
--
-- Both are fixed FORWARD here (never by editing the historical migrations). The column
-- is dropped LAST, so every earlier migration's INSERT still had it during replay — the
-- db-replay gate (000001→000111 from zero) stays green.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. get_landing_schedule WITHOUT color ────────────────────────────────────
-- RETURNS TABLE signature change (drops the color OUT column) → must DROP first; a bare
-- CREATE OR REPLACE cannot change the return type (returns-table-needs-drop lesson).
DROP FUNCTION IF EXISTS get_landing_schedule(UUID);
CREATE OR REPLACE FUNCTION get_landing_schedule(p_gym_id UUID)
RETURNS TABLE (class_id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT,
               day_of_week SMALLINT, start_time TIME, end_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT,
         s.day_of_week, s.start_time, s.end_time
  FROM classes c
  JOIN class_schedules s ON s.class_id = c.id
  WHERE c.gym_id = p_gym_id AND c.is_active AND c.show_on_landing AND s.is_active AND is_active_gym(c.gym_id)
  ORDER BY s.start_time, s.day_of_week, c.name_en;
$$;
REVOKE ALL ON FUNCTION get_landing_schedule(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_schedule(UUID) TO anon, authenticated;

-- ── 2. seed_e2e_gym_base WITHOUT color ───────────────────────────────────────
-- Byte-identical to the latest def (000098) except the one `classes` INSERT no longer
-- lists/values `color`. Signature unchanged → CREATE OR REPLACE. Based on the CURRENT
-- latest so nothing later is reverted (function-rewrite-reverts-later-migrations lesson).
CREATE OR REPLACE FUNCTION seed_e2e_gym_base(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
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
  -- (CLASSES-COLOR-DROP: the `color` column is gone; the class carries no colour.)
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, is_active, monthly_fee_usd, monthly_fee_lbp)
  VALUES (v_gym, v_disc_mt, v_coach_row, 'ملاكمة تايلاندية - مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant', 'Main Floor', 20, true, 0, 0)
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
  INSERT INTO exchange_rates (gym_id, rate, rate_date, source) VALUES (v_gym, 89000.00, CURRENT_DATE, 'manual')
  ON CONFLICT (gym_id, rate_date, source) DO NOTHING;

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
REVOKE ALL ON FUNCTION seed_e2e_gym_base(TEXT, TEXT) FROM PUBLIC;

-- ── 3. drop the column LAST (every earlier migration's INSERT still had it) ────
ALTER TABLE classes DROP COLUMN IF EXISTS color;
