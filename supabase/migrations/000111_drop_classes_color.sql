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


-- ── 2b. reseed_proline_demo WITHOUT color ────────────────────────────────────
-- The LIVE auditor demo-reseed tool (docs/demo/staff-demo-script.md runs
-- `SELECT reseed_proline_demo();` before every demo) also INSERTed color into its six
-- classes. Recreated FORWARD, byte-identical to the latest def (000066) EXCEPT those six
-- INSERTs drop color — diff-proven. No gate calls it, so its correctness rests on that
-- diff + the db-replay compile check.
CREATE OR REPLACE FUNCTION reseed_proline_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym        uuid;
  v_today      date := current_date;
  v_now        timestamptz := now();
  v_month0     date := date_trunc('month', now())::date;        -- 1st of this month
  v_lastmonth  date := (date_trunc('month', now()) - interval '1 month')::date;
  -- preserved login profiles (resolved by the known demo emails; may be null)
  v_l_owner    uuid := (SELECT id FROM auth.users WHERE email = 'owner@prolinegym.lb');
  v_l_coach    uuid := (SELECT id FROM auth.users WHERE email = 'coach@prolinegym.lb');
  v_l_recept   uuid := (SELECT id FROM auth.users WHERE email = 'reception@prolinegym.lb');
  v_l_student  uuid := (SELECT id FROM auth.users WHERE email = 'student@prolinegym.lb');
  -- catalog (resolved from the gym's existing rows — NEVER created/deleted here)
  v_disc_mt uuid; v_disc_bx uuid; v_disc_kb uuid; v_disc_mma uuid;
  v_plan_m uuid; v_plan_q uuid; v_plan_a uuid;
  v_pkg5 uuid; v_pkg10 uuid; v_pkg20 uuid; v_pkg1 uuid;
  v_coaches uuid[]; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_wt uuid; v_wtv int;
  v_belt_mt uuid;  -- a Muay Thai belt_hierarchy row for promotions (nullable)
  -- working
  v_prof uuid; v_stu uuid; v_mem uuid; v_inv invoices; v_cls uuid;
  v_students uuid[] := '{}'; v_dow int; i int; v_pay_method payment_method_enum;
  -- class ids
  v_clsA uuid; v_clsB uuid; v_clsC uuid; v_clsD uuid; v_clsE uuid; v_clsF uuid;
  -- member name pools
  fn text[] := ARRAY['Karim','Lina','Omar','Maya','Rami','Nour','Sami','Dana','Ali','Yara','Hadi','Lara','Ziad','Rana','Fadi','Sara','Jad','Mira','Tarek','Hala'];
  ln text[] := ARRAY['Mourad','Khalil','Haddad','Saad','Aoun','Fares','Nassar','Rizk','Sleiman','Daher','Karam','Najjar','Abou','Chami','Hage','Tannous','Geara','Zein','Bitar','Saliba'];
  gn text[] := ARRAY['male','female','male','female','male','female','male','female','male','female','male','female','male','female','male','female','male','female','male','female'];
  belts text[] := ARRAY['orange','yellow','orange','white','green','yellow','blue','orange','white','yellow','green','white','orange','yellow','blue','white','green','yellow','white','orange'];
  v_plan uuid; v_end date; v_status membership_status_enum; v_lapsed timestamptz;
  v_coach uuid; v_disc uuid;
  -- DEMO-GUARDIAN: the preserved guardian login + its row (re-linked below)
  v_l_guardian uuid := (SELECT id FROM auth.users WHERE email = 'guardian@prolinegym.lb');
  v_guard_row  uuid;
BEGIN
  SELECT id INTO v_gym FROM gyms WHERE slug = 'proline-gym';
  IF v_gym IS NULL THEN RAISE EXCEPTION 'proline-gym not found — refusing to reseed'; END IF;
  IF v_l_student IS NULL THEN RAISE EXCEPTION 'student@prolinegym.lb login not found — refusing (need it to re-link the hero)'; END IF;

  -- ---- resolve catalog (existing rows; never created/deleted) ----
  SELECT id INTO v_disc_mt  FROM disciplines WHERE gym_id=v_gym AND name_en='Muay Thai' LIMIT 1;
  SELECT id INTO v_disc_bx  FROM disciplines WHERE gym_id=v_gym AND name_en='Boxing' LIMIT 1;
  SELECT id INTO v_disc_kb  FROM disciplines WHERE gym_id=v_gym AND name_en='Kick Boxing' LIMIT 1;
  SELECT id INTO v_disc_mma FROM disciplines WHERE gym_id=v_gym AND name_en ILIKE 'Mixed Martial%' LIMIT 1;
  v_disc_mt := COALESCE(v_disc_mt, (SELECT id FROM disciplines WHERE gym_id=v_gym AND is_active ORDER BY sort_order LIMIT 1));
  SELECT id INTO v_plan_m FROM membership_plans WHERE gym_id=v_gym AND duration_days=30  LIMIT 1;
  SELECT id INTO v_plan_q FROM membership_plans WHERE gym_id=v_gym AND duration_days=90  LIMIT 1;
  SELECT id INTO v_plan_a FROM membership_plans WHERE gym_id=v_gym AND duration_days=365 LIMIT 1;
  SELECT id INTO v_pkg5  FROM pt_packages WHERE gym_id=v_gym AND session_count=5  LIMIT 1;
  SELECT id INTO v_pkg10 FROM pt_packages WHERE gym_id=v_gym AND session_count=10 LIMIT 1;
  SELECT id INTO v_pkg20 FROM pt_packages WHERE gym_id=v_gym AND session_count=20 LIMIT 1;
  SELECT id INTO v_pkg1  FROM pt_packages WHERE gym_id=v_gym AND session_count=1  LIMIT 1;
  IF v_plan_m IS NULL OR v_disc_mt IS NULL THEN RAISE EXCEPTION 'proline-gym catalog incomplete (plan/discipline)'; END IF;

  SELECT array_agg(id ORDER BY created_at) INTO v_coaches
  FROM (SELECT id, created_at FROM coaches WHERE gym_id=v_gym AND is_active=true ORDER BY created_at LIMIT 4) s;
  IF v_coaches IS NULL OR array_length(v_coaches,1) < 4 THEN RAISE EXCEPTION 'expected >=4 active coaches, got %', COALESCE(array_length(v_coaches,1),0); END IF;
  v_c1:=v_coaches[1]; v_c2:=v_coaches[2]; v_c3:=v_coaches[3]; v_c4:=v_coaches[4];

  -- ensure a waiver template (prod had none; F3 needs one). Idempotent (UNIQUE gym_id).
  INSERT INTO waiver_templates (gym_id, title_en, title_ar, title_fr, body_en, body_ar, body_fr, version, is_active)
  VALUES (v_gym, 'Liability Waiver', 'إقرار إخلاء مسؤولية', 'Décharge de responsabilité',
    'I acknowledge the risks of martial arts training and release PRO LINE Gym from liability.',
    'أقر بمخاطر التدريب وأخلي صالة برولاين من المسؤولية.',
    'Je reconnais les risques et décharge PRO LINE Gym de toute responsabilité.', 1, true)
  ON CONFLICT (gym_id) DO NOTHING;
  SELECT id, version INTO v_wt, v_wtv FROM waiver_templates WHERE gym_id=v_gym;
  SELECT id INTO v_belt_mt FROM belt_hierarchies WHERE discipline_id=v_disc_mt ORDER BY sort_order LIMIT 1;

  -- ============================================================
  -- WIPE — proline-gym member/journey layer only (child → parent, scoped).
  -- PRESERVES: gyms, catalog, ALL coaches+coach-profiles, ALL login profiles/roles.
  -- ============================================================
  DELETE FROM notifications      WHERE gym_id = v_gym;
  DELETE FROM payments           WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM waiver_signatures  WHERE gym_id = v_gym;
  DELETE FROM member_followups   WHERE gym_id = v_gym;
  DELETE FROM belt_promotions    WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM pt_sessions        WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM pt_assignments     WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM attendance_records WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM camp_attendance    WHERE camp_id IN (SELECT id FROM camps WHERE gym_id=v_gym);
  DELETE FROM camp_registrations WHERE camp_id IN (SELECT id FROM camps WHERE gym_id=v_gym);
  DELETE FROM camps              WHERE gym_id = v_gym;
  DELETE FROM class_registrations WHERE gym_id = v_gym;
  DELETE FROM class_enrollments  WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM trial_classes      WHERE lead_id IN (SELECT id FROM leads WHERE gym_id=v_gym);
  DELETE FROM guardian_students  WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM invoices           WHERE gym_id = v_gym;                       -- after payments
  DELETE FROM student_memberships WHERE student_id IN (SELECT id FROM students WHERE gym_id=v_gym);
  DELETE FROM leads              WHERE gym_id = v_gym;                        -- after trial_classes
  DELETE FROM class_schedules    WHERE class_id IN (SELECT id FROM classes WHERE gym_id=v_gym);
  DELETE FROM classes            WHERE gym_id = v_gym;                        -- after enrollments/registrations/attendance
  DELETE FROM coach_availability WHERE gym_id = v_gym;
  DELETE FROM students           WHERE gym_id = v_gym;                        -- after all student children
  -- pure member profiles (NOT logins, coaches, external_coaches, or guardians)
  DELETE FROM profiles WHERE gym_id = v_gym
    AND id NOT IN (SELECT user_id FROM user_roles WHERE gym_id=v_gym)
    AND id NOT IN (SELECT profile_id FROM coaches WHERE gym_id=v_gym)
    AND id NOT IN (SELECT profile_id FROM external_coaches WHERE gym_id=v_gym)
    AND id NOT IN (SELECT profile_id FROM guardians WHERE gym_id=v_gym);

  -- ============================================================
  -- RESEED — anchored to now(). Classes first (members enroll into them).
  -- ============================================================
  -- 6 classes across the 4 coaches; show_on_landing so the public schedule fills.
  v_dow := EXTRACT(dow FROM v_today)::int;  -- today's day-of-week (Now/Next class)
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, COALESCE(v_disc_mma,v_disc_mt), v_c1, 'أساسيات MMA', 'MMA Fundamentals', 'Bases MMA', 'Cage', 12, 'scheduled', true, true) RETURNING id INTO v_clsA;
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, v_disc_mt, v_c1, 'مواي تاي محترفين', 'Muay Thai Pro', 'Muay Thaï Pro', 'Main Floor', 10, 'scheduled', true, true) RETURNING id INTO v_clsB;
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, COALESCE(v_disc_bx,v_disc_mt), v_c2, 'ملاكمة مبتدئ', 'Boxing Basics', 'Boxe Débutant', 'Ring', 12, 'scheduled', true, true) RETURNING id INTO v_clsC;
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, COALESCE(v_disc_kb,v_disc_mt), v_c2, 'كيك بوكسينغ', 'Kickboxing', 'Kickboxing', 'Main Floor', 14, 'scheduled', true, true) RETURNING id INTO v_clsD;
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, v_disc_mt, v_c3, 'مواي تاي مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant', 'Studio B', 16, 'scheduled', true, true) RETURNING id INTO v_clsE;
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, status, is_active, show_on_landing)
  VALUES (v_gym, v_disc_mt, v_c4, 'حصة مفتوحة', 'Open Mat', 'Tapis Libre', 'Main Floor', 20, 'scheduled', true, true) RETURNING id INTO v_clsF;

  -- schedules: class A runs TODAY ~1h from now (Now/Next + attendance demo)
  INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
  VALUES (v_clsA, v_dow, date_trunc('hour', v_now)::time, (date_trunc('hour', v_now) + interval '90 minutes')::time, true);
  -- other classes spread M/W/F/T/Th/Sat
  INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active) VALUES
    (v_clsB, 1, '18:00','19:30', true), (v_clsB, 3, '18:00','19:30', true), (v_clsB, 5, '18:00','19:30', true),
    (v_clsC, 2, '17:00','18:00', true), (v_clsC, 4, '17:00','18:00', true),
    (v_clsD, 1, '19:30','20:30', true), (v_clsD, 3, '19:30','20:30', true),
    (v_clsE, 2, '16:00','17:00', true), (v_clsE, 4, '16:00','17:00', true),
    (v_clsF, 6, '11:00','12:30', true);

  -- ---- 20 members ----
  FOR i IN 1..20 LOOP
    -- attributes by index bucket
    v_disc := CASE WHEN i % 4 = 0 THEN COALESCE(v_disc_mma,v_disc_mt)
                   WHEN i % 4 = 1 THEN v_disc_mt
                   WHEN i % 4 = 2 THEN COALESCE(v_disc_bx,v_disc_mt)
                   ELSE COALESCE(v_disc_kb,v_disc_mt) END;
    v_coach := v_coaches[(i % 4) + 1];
    v_status := 'active'; v_lapsed := NULL;
    -- plan + end_date by bucket
    IF i <= 8 THEN        v_plan := v_plan_m; v_end := v_today + (7 + i);          -- active Monthly  +8..+16
    ELSIF i <= 11 THEN    v_plan := v_plan_q; v_end := v_today + (10 + i);         -- active Quarterly
    ELSIF i <= 13 THEN    v_plan := v_plan_a; v_end := v_today + (12 + i);         -- active Annual
    ELSIF i = 14 THEN     v_plan := v_plan_m; v_end := v_today;                    -- EXPIRING TODAY
    ELSIF i = 15 THEN     v_plan := v_plan_m; v_end := v_today + 3;                -- EXPIRING +3d
    ELSIF i = 16 THEN     v_plan := v_plan_m; v_end := v_today + 6;                -- EXPIRING +6d (stable anchor)
    ELSIF i = 17 THEN     v_plan := v_plan_m; v_end := v_today + 20;               -- PT-low hero (active)
    ELSIF i = 18 THEN     v_plan := v_plan_m; v_end := v_today + 24;               -- active
    ELSIF i = 19 THEN     v_plan := v_plan_m; v_end := v_today - 10; v_status := 'lapsed'; v_lapsed := v_month0 + 3;  -- LAPSED
    ELSE                  v_plan := v_plan_m; v_end := v_today - 20; v_status := 'lapsed'; v_lapsed := v_month0 + 2;  -- LAPSED → recovered
    END IF;

    -- member #1 reuses the student@ login profile (the hero); others get fresh profiles
    IF i = 1 THEN
      v_prof := v_l_student;
      UPDATE profiles SET first_name_en='Karim', first_name_ar='كريم', first_name_fr='Karim',
        last_name_en='Mourad', last_name_ar='مراد', last_name_fr='Mourad', phone='+96170100001', gender='male'
      WHERE id = v_prof;
    ELSE
      INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, gender)
      VALUES (v_gym, fn[i], fn[i], fn[i], ln[i], ln[i], ln[i], '+9617010' || lpad(i::text,4,'0'), gn[i]::gender_enum)
      RETURNING id INTO v_prof;
    END IF;

    INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, join_date, is_active)
    VALUES (v_prof, v_gym, ln[i] || ' (parent)', '+9617019' || lpad(i::text,4,'0'), belts[i]::belt_rank_enum, v_today - (60 + i), v_today - (60 + i*5), true)
    RETURNING id INTO v_stu;
    v_students := v_students || v_stu;

    -- membership
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew, lapsed_at)
    VALUES (v_stu, v_plan,
      v_end - (SELECT duration_days FROM membership_plans WHERE id=v_plan),
      v_end, v_status, true, v_lapsed)
    RETURNING id INTO v_mem;

    -- member #20 RECOVERED: also has a fresh active membership this month + a reactivated followup
    IF i = 20 THEN
      INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
      VALUES (v_stu, v_plan_m, v_month0 + 5, v_today + 25, 'active', true);
      INSERT INTO member_followups (gym_id, student_id, kind, outcome, note, next_action_date, created_at)
      VALUES (v_gym, v_stu, 'winback', 'reactivated', 'Came back after a call — renewed Monthly.', NULL, v_month0 + 6);
    END IF;
    -- member #19 lapsed, still in win-back queue (pending follow-up due this week)
    IF i = 19 THEN
      INSERT INTO member_followups (gym_id, student_id, kind, outcome, note, next_action_date, created_at)
      VALUES (v_gym, v_stu, 'winback', 'promised_visit', 'Said will drop by this week.', v_today + 2, v_month0 + 4);
    END IF;

    -- enroll active members into classes (varied fill); lapsed members not enrolled
    IF v_status = 'active' THEN
      -- spread across classes to make fill varied: B near-full, C underfilled, others mid
      IF i <= 9 THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsB, v_stu, true); END IF;   -- ~9/10 near-full
      IF i IN (1,2) THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsC, v_stu, true); END IF; -- ~2/12 underfilled
      IF i BETWEEN 3 AND 10 THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsD, v_stu, true); END IF;
      IF i BETWEEN 4 AND 9 THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsE, v_stu, true); END IF;
      IF i IN (1,3,5) THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsF, v_stu, true); END IF;
      -- enroll 7 into TODAY's class A (for Now/Next + attendance)
      IF i BETWEEN 1 AND 7 THEN INSERT INTO class_enrollments (class_id, student_id, is_active) VALUES (v_clsA, v_stu, true); END IF;
    END IF;

    -- waiver signed for ~18/20 (skip i=12,13 → outstanding)
    IF v_wt IS NOT NULL AND i NOT IN (12,13) THEN
      INSERT INTO waiver_signatures (gym_id, student_id, signed_by_profile_id, template_id, template_version, signature, typed_name, signed_at)
      VALUES (v_gym, v_stu, v_prof, v_wt, v_wtv, 'data:image/png;base64,iVBORw0KGgo=', fn[i] || ' ' || ln[i], v_today - (30 + i));
    END IF;

    -- ===== MONEY =====
    -- expiring today (#14) + this week (#15,#16): UNPAID renewal invoice (Week projected / Today due)
    IF i = 14 THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'membership', 50, 0, NULL, NULL, v_mem, v_today, 'Renewal due today');
    ELSIF i IN (15,16) THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'membership', 50, 0, NULL, NULL, v_mem, v_end, 'Renewal due this week');
    END IF;
    -- a couple of OVERDUE (issued, unpaid, past due) → Today overdue + Month aging
    IF i IN (11,18) THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'membership', 50, 0, NULL, NULL, NULL, v_today - (20 + i), 'Overdue balance');
      UPDATE invoices SET status='overdue' WHERE id = v_inv.id;
    END IF;
    -- PAID this-month membership renewals (active regulars) → Month revenue (membership) + a few last month
    IF i BETWEEN 2 AND 9 THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'membership', 50, 0, NULL, NULL, NULL,
        CASE WHEN i <= 6 THEN v_month0 + 2 ELSE v_lastmonth + 5 END, 'Membership');
      v_pay_method := (ARRAY['cash_usd','omt','whish','cash_usd']::payment_method_enum[])[(i%4)+1];
      INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date)
      VALUES (v_inv.id, v_stu, 50, v_pay_method, CASE WHEN i <= 6 THEN (v_month0 + 2)::timestamptz ELSE (v_lastmonth + 5)::timestamptz END);
      UPDATE invoices SET status='paid' WHERE id = v_inv.id;
    END IF;
    -- 1-2 payments dated TODAY → Today cash collected
    IF i IN (3,5) THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'class_registration', 40, 0, NULL, NULL, NULL, v_today, 'Class registration');
      INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date)
      VALUES (v_inv.id, v_stu, 40, 'cash_usd', v_now);
      UPDATE invoices SET status='paid' WHERE id = v_inv.id;
      INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, start_date, end_date, invoice_id, approved_at)
      VALUES (v_clsD, v_stu, v_gym, 'active', 40, v_today, v_today + 30, v_inv.id, v_now);
    END IF;
    -- class-registration revenue this month (a few more, paid) → Month revenue (class)
    IF i IN (6,7,8) THEN
      v_inv := _system_issue_invoice(v_gym, v_stu, 'class_registration', 40, 0, NULL, NULL, NULL, v_month0 + 3, 'Class registration');
      INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date)
      VALUES (v_inv.id, v_stu, 40, 'omt', (v_month0 + 3)::timestamptz);
      UPDATE invoices SET status='paid' WHERE id = v_inv.id;
    END IF;
  END LOOP;

  -- ===== PT (6 active packages; sessions today/week/completed) =====
  -- hero (#1): 10-pack, 6 remaining, purchased this month
  INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active, status)
  VALUES (v_students[1], v_pkg10, v_c1, 10, 4, v_month0 + 1, v_today + 60, true, 'active');
  -- #17 PT-low hero: 5-pack, 1 remaining (LOW) → Week PT-low re-sell
  INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active, status)
  VALUES (v_students[17], v_pkg5, v_c1, 5, 4, v_month0 + 2, v_today + 20, true, 'active');
  -- #2: 5-pack expiring THIS WEEK → Week PT-low (expiring)
  INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active, status)
  VALUES (v_students[2], v_pkg5, v_c2, 5, 2, v_today - 55, v_today + 5, true, 'active');
  -- #3,#4,#5: healthy packs (mix) → Coach-360 PT clients + Month PT-sold
  INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active, status) VALUES
    (v_students[3], v_pkg20, v_c2, 20, 5,  v_month0 + 4, v_today + 80, true, 'active'),
    (v_students[4], v_pkg10, v_c3, 10, 3,  v_month0 + 6, v_today + 70, true, 'active'),
    (v_students[5], v_pkg10, v_c1, 10, 1,  v_month0 + 8, v_today + 85, true, 'active');
  -- PT-pack sales this month (paid) → Month revenue (pt)
  v_inv := _system_issue_invoice(v_gym, v_students[1], 'pt_package', 280, 0, NULL, NULL, NULL, v_month0 + 1, '10 Sessions Pack');
  INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date) VALUES (v_inv.id, v_students[1], 280, 'whish', (v_month0+1)::timestamptz);
  UPDATE invoices SET status='paid' WHERE id = v_inv.id;
  v_inv := _system_issue_invoice(v_gym, v_students[3], 'pt_package', 500, 0, NULL, NULL, NULL, v_month0 + 4, '20 Sessions Pack');
  INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date) VALUES (v_inv.id, v_students[3], 500, 'bank_transfer', (v_month0+4)::timestamptz);
  UPDATE invoices SET status='paid' WHERE id = v_inv.id;

  -- PT sessions: 2 booked TODAY (Today PT + diary), 3 this week, several completed this month
  INSERT INTO pt_sessions (student_id, coach_id, package_id, scheduled_at, duration_minutes, status) VALUES
    (v_students[1], v_c1, v_pkg10, v_now + interval '3 hour', 60, 'scheduled'),
    (v_students[2], v_c2, v_pkg5,  v_now + interval '5 hour', 60, 'scheduled'),
    (v_students[3], v_c2, v_pkg20, v_now + interval '2 day',  60, 'scheduled'),
    (v_students[4], v_c3, v_pkg10, v_now + interval '3 day',  60, 'scheduled'),
    (v_students[5], v_c1, v_pkg10, v_now + interval '4 day',  60, 'scheduled'),
    (v_students[1], v_c1, v_pkg10, v_month0 + 2, 60, 'completed'),
    (v_students[3], v_c2, v_pkg20, v_month0 + 5, 60, 'completed'),
    (v_students[4], v_c3, v_pkg10, v_month0 + 7, 60, 'completed'),
    (v_students[5], v_c1, v_pkg10, v_month0 + 9, 60, 'completed');

  -- ===== Coach availability (4 coaches; coach1 has an OPEN GAP today) =====
  INSERT INTO coach_availability (gym_id, coach_id, day_of_week, start_time, end_time, is_active) VALUES
    (v_gym, v_c1, v_dow, '09:00','12:00', true),   -- open gap today (no PT booked 9-12)
    (v_gym, v_c1, v_dow, '14:00','17:00', true),
    (v_gym, v_c1, 1, '09:00','17:00', true), (v_gym, v_c1, 3, '09:00','17:00', true),
    (v_gym, v_c2, v_dow, '10:00','15:00', true), (v_gym, v_c2, 2, '10:00','18:00', true), (v_gym, v_c2, 4, '10:00','18:00', true),
    (v_gym, v_c3, v_dow, '12:00','16:00', true), (v_gym, v_c3, 2, '12:00','16:00', true),
    (v_gym, v_c4, 6, '10:00','14:00', true), (v_gym, v_c4, v_dow, '15:00','18:00', true);

  -- ===== Attendance: ~4 weeks history for active members + some today (unmarked left) =====
  -- history: each of the first 9 (class B roster) present on the last 4 same-weekdays
  FOR i IN 1..9 LOOP
    INSERT INTO attendance_records (class_id, student_id, attendance_date, status)
    SELECT v_clsB, v_students[i], (v_today - 28 + off)::date, 'present'
    FROM generate_series(0, 27, 7) AS g(off)
    ON CONFLICT (class_id, student_id, attendance_date) DO NOTHING;
  END LOOP;
  -- today's class A: mark #1,#2,#3 present; leave #4..#7 UNMARKED (live attendance demo)
  INSERT INTO attendance_records (class_id, student_id, attendance_date, status, check_in_time) VALUES
    (v_clsA, v_students[1], v_today, 'present', v_now - interval '5 min'),
    (v_clsA, v_students[2], v_today, 'present', v_now - interval '4 min'),
    (v_clsA, v_students[3], v_today, 'present', v_now - interval '3 min')
  ON CONFLICT (class_id, student_id, attendance_date) DO NOTHING;

  -- ===== Belts: 1-2 recent promotions (hero + one more) =====
  IF v_belt_mt IS NOT NULL THEN
    INSERT INTO belt_promotions (student_id, coach_id, discipline_id, belt_hierarchy_id, from_rank, to_rank, promotion_date)
    VALUES (v_students[1], v_c1, v_disc_mt, v_belt_mt, 'yellow', 'orange', v_month0 + 5),
           (v_students[5], v_c1, v_disc_mt, v_belt_mt, 'white', 'yellow', v_month0 + 8);
  END IF;

  -- ===== Leads / trials / conversions (pipeline — not in the 20) =====
  -- 2 leads today + 3 this week (Today/Week new leads)
  INSERT INTO leads (gym_id, first_name, last_name, phone, source, status, created_at) VALUES
    (v_gym, 'Walid','Nakhle','+96171000001','instagram','new', v_now - interval '2 hour'),
    (v_gym, 'Carla','Maroun','+96171000002','walk_in','new', v_now - interval '5 hour'),
    (v_gym, 'Georges','Saadeh','+96171000003','referral','contacted', v_now - interval '2 day'),
    (v_gym, 'Nadine','Khoury','+96171000004','instagram','new', v_now - interval '3 day'),
    (v_gym, 'Bilal','Hamdan','+96171000005','phone','contacted', v_now - interval '4 day');
  -- 2 trials this week (date / lead / assigned coach)
  INSERT INTO trial_classes (lead_id, class_id, scheduled_date, scheduled_time, assigned_coach_id, status)
  SELECT id, v_clsB, v_today + 2, '18:00', v_c1, 'scheduled' FROM leads WHERE gym_id=v_gym AND first_name='Walid';
  INSERT INTO trial_classes (lead_id, class_id, scheduled_date, scheduled_time, assigned_coach_id, status)
  SELECT id, v_clsC, v_today + 4, '17:00', v_c2, 'scheduled' FROM leads WHERE gym_id=v_gym AND first_name='Carla';
  -- 3-4 converted this month (varied sources) → Month conversion
  INSERT INTO leads (gym_id, first_name, last_name, phone, source, status, converted_student_id, converted_at) VALUES
    (v_gym, 'Joelle','Aractingi','+96171000010','instagram','converted', v_students[2], v_month0 + 3),
    (v_gym, 'Marc','Doumit','+96171000011','walk_in','converted', v_students[4], v_month0 + 7),
    (v_gym, 'Reem','Salameh','+96171000012','referral','converted', v_students[6], v_month0 + 10),
    (v_gym, 'Karl','Abboud','+96171000013','instagram','converted', v_students[7], v_month0 + 12);

  -- ===== Camp (minimal): 1 upcoming + 3 signups (Month camp signups) =====
  DECLARE v_camp uuid;
  BEGIN
    INSERT INTO camps (gym_id, name_ar, name_en, name_fr, max_capacity, price_usd, status, start_date, end_date)
    VALUES (v_gym, 'مخيم صيفي', 'Summer Camp', 'Camp Été', 25, 120, 'open', v_today + 14, v_today + 18)
    RETURNING id INTO v_camp;
    v_inv := _system_issue_invoice(v_gym, v_students[6], 'camp', 120, 0, NULL, NULL, NULL, v_month0 + 9, 'Summer Camp');
    INSERT INTO payments (invoice_id, student_id, amount_usd, payment_method, payment_date) VALUES (v_inv.id, v_students[6], 120, 'cash_usd', (v_month0+9)::timestamptz);
    UPDATE invoices SET status='paid' WHERE id = v_inv.id;
    INSERT INTO camp_registrations (camp_id, student_id, invoice_id, status) VALUES
      (v_camp, v_students[6], v_inv.id, 'confirmed'),
      (v_camp, v_students[7], NULL, 'confirmed'),
      (v_camp, v_students[8], NULL, 'confirmed');
  END;

  -- ===== Notifications: ~8 recent, meaningful → Today inbox =====
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, action_url, created_at)
  SELECT ur.user_id, v_gym, n.type, n.tkey, n.bkey, n.params, n.etype, n.url, v_now - (n.ago || ' hour')::interval
  FROM user_roles ur
  CROSS JOIN (VALUES
    ('lead_new','messages.lead_new.title','messages.lead_new.body', jsonb_build_object('leadName','Walid'), 'lead','/leads', 2),
    ('lead_new','messages.lead_new.title','messages.lead_new.body', jsonb_build_object('leadName','Carla'), 'lead','/leads', 5),
    ('renewal_due','messages.renewal_due.title','messages.renewal_due.body', jsonb_build_object('memberName','Karim'), 'membership','/today', 8),
    ('payment_received','messages.payment_received.title','messages.payment_received.body', jsonb_build_object('amount','40'), 'invoice','/money', 12)
  ) AS n(type,tkey,bkey,params,etype,url,ago)
  WHERE ur.gym_id = v_gym AND ur.role IN ('owner','receptionist') AND ur.user_id IN (v_l_owner, v_l_recept);

  -- ============================================================
  -- DEMO GUARDIAN re-link (DEMO-GUARDIAN) — the guardian@prolinegym.lb login
  -- (seeded by 000066) survives a reseed: its profile + guardians row are
  -- PRESERVED by the WIPE above, but guardian_students is dropped. Ensure the
  -- guardians row (defensive) and re-link it to the hero student (Karim = #1) so
  -- the kid-switcher shows Karim after every reseed. Skipped if the login is
  -- absent (e.g. reseed runs before 000066 applied).
  -- ============================================================
  IF v_l_guardian IS NOT NULL THEN
    SELECT id INTO v_guard_row FROM guardians WHERE profile_id = v_l_guardian AND gym_id = v_gym LIMIT 1;
    IF v_guard_row IS NULL THEN
      INSERT INTO guardians (profile_id, gym_id, relationship_ar, relationship_en, relationship_fr, is_primary_contact)
      VALUES (v_l_guardian, v_gym, 'الأب', 'Father', 'Père', true)
      RETURNING id INTO v_guard_row;
    END IF;
    INSERT INTO guardian_students (guardian_id, student_id)
    VALUES (v_guard_row, v_students[1])
    ON CONFLICT (guardian_id, student_id) DO NOTHING;
  END IF;

  -- ============================================================
  -- COACH SHOWCASE — publish the landing coaches (COACH-SHOWCASE-SEED)
  -- get_landing_coaches() (000059) projects coaches WHERE is_active AND
  -- landing_visible; "coming soon" coaches are ALSO landing_visible (it just
  -- orders them last). Idempotent: reset the whole roster to hidden first, then
  -- publish a deterministic set — 3 ACTIVE + 1 COMING-SOON — with bio_* +
  -- specialization_* populated so the showcase cards have content. The rest stay
  -- unpublished (no leak). Scoped to v_gym. Specializations match each coach's
  -- seeded classes above (c1: MMA/Muay Thai, c2: Boxing/Kickboxing, c3: Muay Thai,
  -- c4: light → the coming-soon teaser).
  -- ============================================================
  UPDATE coaches SET landing_visible = false WHERE gym_id = v_gym;   -- pristine: hide all, then publish the chosen

  -- Coach 1 (head): MMA & Muay Thai — ACTIVE
  UPDATE coaches SET
    landing_visible     = true,
    landing_status      = 'active',
    has_pending_changes = false,
    last_published_at   = v_now,
    specialization_ar = 'المدرب الرئيسي · فنون قتالية مختلطة ومواي تاي',
    specialization_en = 'Head Coach · MMA & Muay Thai',
    specialization_fr = 'Entraîneur principal · MMA & Muay Thaï',
    bio_ar = 'يقود فريق برولاين للقتال بخبرة تتجاوز العقد داخل القفص والحلبة، ويبني الأبطال من الأساسيات.',
    bio_en = 'Leads PRO LINE''s fight team with over a decade in the cage and the ring — building champions from the fundamentals up.',
    bio_fr = 'Dirige l''équipe de combat de PRO LINE avec plus de dix ans d''expérience en cage et sur le ring — forge des champions dès les bases.'
  WHERE id = v_c1;

  -- Coach 2: Boxing & Kickboxing — ACTIVE
  UPDATE coaches SET
    landing_visible     = true,
    landing_status      = 'active',
    has_pending_changes = false,
    last_published_at   = v_now,
    specialization_ar = 'مدرب ملاكمة وكيك بوكسينغ',
    specialization_en = 'Boxing & Kickboxing Coach',
    specialization_fr = 'Entraîneur de boxe & kickboxing',
    bio_ar = 'يصقل الحركة والتوقيت والقوة لملاكمي ولاعبي الكيك بوكسينغ بكل المستويات، من أول لكمة إلى أول نزال.',
    bio_en = 'Sharpens footwork, timing and power for boxers and kickboxers at every level — from first jab to first bout.',
    bio_fr = 'Affûte le jeu de jambes, le timing et la puissance des boxeurs et kickboxeurs, du premier jab au premier combat.'
  WHERE id = v_c2;

  -- Coach 3: Muay Thai — ACTIVE
  UPDATE coaches SET
    landing_visible     = true,
    landing_status      = 'active',
    has_pending_changes = false,
    last_published_at   = v_now,
    specialization_ar = 'مدرب مواي تاي',
    specialization_en = 'Muay Thai Coach',
    specialization_fr = 'Entraîneur de Muay Thaï',
    bio_ar = 'ينقل فن الأطراف الثمانية للمبتدئين والمقاتلين معاً بتدريب تقني وصبور.',
    bio_en = 'Brings the art of eight limbs to beginners and fighters alike, with patient, technical coaching.',
    bio_fr = 'Transmet l''art des huit membres aux débutants comme aux combattants, avec un coaching technique et patient.'
  WHERE id = v_c3;

  -- Coach 4 (light): Strength & Conditioning — COMING SOON (visible, ordered last)
  UPDATE coaches SET
    landing_visible     = true,
    landing_status      = 'coming_soon',
    has_pending_changes = false,
    last_published_at   = v_now,
    specialization_ar = 'اللياقة والتكييف البدني',
    specialization_en = 'Strength & Conditioning',
    specialization_fr = 'Préparation physique',
    bio_ar = 'ينضم إلى فريق برولاين قريباً لقيادة برنامج اللياقة والتكييف البدني — ترقّبوا.',
    bio_en = 'Joining the PRO LINE team soon to lead strength & conditioning — stay tuned.',
    bio_fr = 'Rejoint bientôt l''équipe PRO LINE pour diriger la préparation physique — restez à l''écoute.'
  WHERE id = v_c4;

  -- ============================================================
  -- READINESS COUNTS (so the auditor can confirm each card)
  -- ============================================================
  RETURN jsonb_build_object(
    'gym_id', v_gym, 'ran_at', v_now,
    'members_total', (SELECT count(*) FROM students WHERE gym_id=v_gym),
    'members_active', (SELECT count(DISTINCT sm.student_id) FROM student_memberships sm JOIN students s ON s.id=sm.student_id WHERE s.gym_id=v_gym AND sm.status='active'),
    'expiring_today', (SELECT count(*) FROM student_memberships sm JOIN students s ON s.id=sm.student_id WHERE s.gym_id=v_gym AND sm.status='active' AND sm.end_date=v_today),
    'expiring_this_week', (SELECT count(*) FROM student_memberships sm JOIN students s ON s.id=sm.student_id WHERE s.gym_id=v_gym AND sm.status='active' AND sm.end_date > v_today AND sm.end_date <= v_today+7),
    'lapsed', (SELECT count(*) FROM student_memberships sm JOIN students s ON s.id=sm.student_id WHERE s.gym_id=v_gym AND sm.status='lapsed'),
    'winback_recovered', (SELECT count(*) FROM member_followups WHERE gym_id=v_gym AND outcome='reactivated'),
    'classes', (SELECT count(*) FROM classes WHERE gym_id=v_gym),
    'classes_today', (SELECT count(DISTINCT c.id) FROM classes c JOIN class_schedules cs ON cs.class_id=c.id WHERE c.gym_id=v_gym AND cs.day_of_week=v_dow AND cs.is_active),
    'published_classes', (SELECT count(*) FROM classes WHERE gym_id=v_gym AND show_on_landing AND is_active),
    'enrollments', (SELECT count(*) FROM class_enrollments ce JOIN students s ON s.id=ce.student_id WHERE s.gym_id=v_gym),
    'attendance_today_marked', (SELECT count(*) FROM attendance_records ar JOIN students s ON s.id=ar.student_id WHERE s.gym_id=v_gym AND ar.attendance_date=v_today),
    'pt_active_packages', (SELECT count(*) FROM pt_assignments pa JOIN students s ON s.id=pa.student_id WHERE s.gym_id=v_gym AND pa.status='active'),
    'pt_sessions_today', (SELECT count(*) FROM pt_sessions ps JOIN students s ON s.id=ps.student_id WHERE s.gym_id=v_gym AND ps.scheduled_at::date=v_today),
    'pt_sessions_this_week', (SELECT count(*) FROM pt_sessions ps JOIN students s ON s.id=ps.student_id WHERE s.gym_id=v_gym AND ps.status='scheduled' AND ps.scheduled_at::date > v_today AND ps.scheduled_at::date <= v_today+7),
    'invoices_open', (SELECT count(*) FROM invoices WHERE gym_id=v_gym AND status IN ('pending','partial','overdue')),
    'invoices_paid', (SELECT count(*) FROM invoices WHERE gym_id=v_gym AND status='paid'),
    'payments_today_usd', (SELECT COALESCE(sum(amount_usd),0) FROM payments p JOIN students s ON s.id=p.student_id WHERE s.gym_id=v_gym AND p.payment_date::date=v_today),
    'revenue_mtd_usd', (SELECT COALESCE(sum(amount_usd),0) FROM payments p JOIN students s ON s.id=p.student_id WHERE s.gym_id=v_gym AND p.payment_date >= v_month0),
    'overdue', (SELECT count(*) FROM invoices WHERE gym_id=v_gym AND status='overdue'),
    'leads_total', (SELECT count(*) FROM leads WHERE gym_id=v_gym),
    'leads_converted_mtd', (SELECT count(*) FROM leads WHERE gym_id=v_gym AND status='converted' AND converted_at >= v_month0),
    'trials_this_week', (SELECT count(*) FROM trial_classes tc JOIN leads l ON l.id=tc.lead_id WHERE l.gym_id=v_gym AND tc.status='scheduled' AND tc.scheduled_date > v_today AND tc.scheduled_date <= v_today+7),
    'coach_load', (SELECT jsonb_object_agg(cid, jsonb_build_object('classes', ncls, 'pt', npt)) FROM (
        SELECT c.id::text cid,
          (SELECT count(*) FROM classes cl WHERE cl.coach_id=c.id AND cl.gym_id=v_gym) ncls,
          (SELECT count(*) FROM pt_assignments pa WHERE pa.coach_id=c.id AND pa.status='active') npt
        FROM coaches c WHERE c.id = ANY(v_coaches)) z),
    'waivers_signed', (SELECT count(*) FROM waiver_signatures WHERE gym_id=v_gym),
    'notifications', (SELECT count(*) FROM notifications WHERE gym_id=v_gym),
    'camps', (SELECT count(*) FROM camps WHERE gym_id=v_gym),
    'hero_student_linked', (SELECT EXISTS(SELECT 1 FROM students WHERE profile_id=v_l_student AND gym_id=v_gym)),
    'demo_guardian_linked', (SELECT EXISTS(
        SELECT 1 FROM guardian_students gs
        JOIN guardians g ON g.id = gs.guardian_id
        WHERE g.profile_id = v_l_guardian AND gs.student_id = v_students[1])),
    'coaches_preserved', (SELECT count(*) FROM coaches WHERE gym_id=v_gym),
    -- COACH-SHOWCASE-SEED readiness: landing showcase populated (via the COACH-LP reader)
    'landing_coaches', (SELECT count(*) FROM get_landing_coaches(v_gym)),
    'landing_coaches_active', (SELECT count(*) FROM coaches WHERE gym_id=v_gym AND is_active AND landing_visible AND landing_status='active'),
    'landing_coaches_coming_soon', (SELECT count(*) FROM coaches WHERE gym_id=v_gym AND is_active AND landing_visible AND landing_status='coming_soon'),
    'logins_preserved', (SELECT count(*) FROM user_roles WHERE gym_id=v_gym),
    'other_tenant_students', (SELECT count(*) FROM students WHERE gym_id <> v_gym)
  );
END;
$$;
REVOKE ALL ON FUNCTION reseed_proline_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reseed_proline_demo() TO service_role, postgres;
-- ── 3. drop the column LAST (every earlier migration's INSERT still had it) ────
ALTER TABLE classes DROP COLUMN IF EXISTS color;
