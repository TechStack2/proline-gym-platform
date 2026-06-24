-- ============================================================
-- 000006: SEED DATA
-- PRO LINE Gym — Baabda, Lebanon
-- Source: Instagram @prolinegym.lb / Facebook prolinegym.lb
-- Ownership: Fakih Brothers
-- Reality: Muay Thai, Boxing, Fitness, Zumba, Ladies Training, Kids
-- ============================================================

-- -----------------------------------------------------------
-- GYM — PRO LINE Gym, Baabda Sky Business Center
-- -----------------------------------------------------------
INSERT INTO gyms (name_ar, name_en, name_fr, slug, address_ar, address_en, address_fr, city, country, phone, email, website, timezone, currency_preference)
VALUES (
  'برو لاين جيم',
  'PRO LINE Gym',
  'PRO LINE Gym',
  'proline-gym',
  'مركز سكاي للأعمال، ببدا',
  'Sky Business Center, Baabda',
  'Sky Business Center, Baabda',
  'Baabda',
  'Lebanon',
  '+961 70 628 601',
  'alifakih998@gmail.com',
  'https://prolinegym.lb',
  'Asia/Beirut',
  'USD'
);

-- -----------------------------------------------------------
-- DISCIPLINES — Actual offerings per social media
-- Muay Thai, Boxing, Fitness, Zumba, Ladies Training, Kids
-- -----------------------------------------------------------
INSERT INTO disciplines (gym_id, name_ar, name_en, name_fr, sort_order)
SELECT id, 'ملاكمة تايلاندية', 'Muay Thai', 'Muay Thaï', 1 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'ملاكمة', 'Boxing', 'Boxe', 2 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'لياقة بدنية', 'Fitness', 'Fitness', 3 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'زومبا', 'Zumba', 'Zumba', 4 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'تدريب السيدات', 'Ladies Training', 'Entraînement Femmes', 5 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'أطفال', 'Kids', 'Enfants', 6 FROM gyms WHERE slug = 'proline-gym';

-- -----------------------------------------------------------
-- BELT HIERARCHIES — Full 20-rank system
-- Only Muay Thai and Boxing have rank systems
-- Colors aligned with BELT_DISPLAY map in belt-engine-client.tsx
-- -----------------------------------------------------------

-- Muay Thai — full 20-rank prajoud/khan system
DO $$
DECLARE mt_id UUID;
BEGIN
  SELECT d.id INTO mt_id FROM disciplines d JOIN gyms g ON d.gym_id = g.id WHERE d.name_en = 'Muay Thai' AND g.slug = 'proline-gym';
  INSERT INTO belt_hierarchies (discipline_id, rank, name_ar, name_en, name_fr, sort_order, min_months_in_rank, min_classes_attended, is_black_belt) VALUES
  (mt_id, 'white',         'أبيض',         'White',         'Blanche',          1,  1,   8,  false),
  (mt_id, 'white_yellow',  'أبيض/أصفر',    'White/Yellow',  'Blanc/Jaune',      2,  2,  16,  false),
  (mt_id, 'yellow',        'أصفر',         'Yellow',        'Jaune',            3,  2,  20,  false),
  (mt_id, 'yellow_orange', 'أصفر/برتقالي', 'Yellow/Orange', 'Jaune/Orange',     4,  3,  24,  false),
  (mt_id, 'orange',        'برتقالي',      'Orange',        'Orange',           5,  3,  24,  false),
  (mt_id, 'orange_green',  'برتقالي/أخضر', 'Orange/Green',  'Orange/Vert',      6,  3,  28,  false),
  (mt_id, 'green',         'أخضر',         'Green',         'Verte',            7,  4,  32,  false),
  (mt_id, 'green_blue',    'أخضر/أزرق',    'Green/Blue',    'Vert/Bleu',        8,  4,  36,  false),
  (mt_id, 'blue',          'أزرق',         'Blue',          'Bleue',            9,  4,  40,  false),
  (mt_id, 'blue_purple',   'أزرق/أرجواني', 'Blue/Purple',   'Bleu/Violet',     10,  5,  44,  false),
  (mt_id, 'purple',        'أرجواني',      'Purple',        'Violette',        11,  5,  48,  false),
  (mt_id, 'purple_brown',  'أرجواني/بني',  'Purple/Brown',  'Violet/Marron',   12,  6,  52,  false),
  (mt_id, 'brown',         'بني',          'Brown',         'Marron',          13,  6,  56,  false),
  (mt_id, 'brown_black',   'بني/أسود',     'Brown/Black',   'Marron/Noir',     14,  6,  60,  false),
  (mt_id, 'red',           'أحمر',         'Red',           'Rouge',           15,  8,  80,  false),
  (mt_id, 'black_1',       'أسود °1',      'Black 1°',      'Noir 1°',         16, 12, 120,  true),
  (mt_id, 'black_2',       'أسود °2',      'Black 2°',      'Noir 2°',         17, 12, 120,  true),
  (mt_id, 'black_3',       'أسود °3',      'Black 3°',      'Noir 3°',         18, 12, 120,  true),
  (mt_id, 'black_4',       'أسود °4',      'Black 4°',      'Noir 4°',         19, 12, 120,  true),
  (mt_id, 'black_5',       'أسود °5',      'Black 5°',      'Noir 5°',         20, 12, 120,  true)
  ON CONFLICT (discipline_id, rank) DO NOTHING;
END $$;

-- Boxing — full 20-rank tier system
DO $$
DECLARE bx_id UUID;
BEGIN
  SELECT d.id INTO bx_id FROM disciplines d JOIN gyms g ON d.gym_id = g.id WHERE d.name_en = 'Boxing' AND g.slug = 'proline-gym';
  INSERT INTO belt_hierarchies (discipline_id, rank, name_ar, name_en, name_fr, sort_order, min_months_in_rank, min_classes_attended, is_black_belt) VALUES
  (bx_id, 'white',         'أبيض',         'White',         'Blanche',          1,  1,   8,  false),
  (bx_id, 'white_yellow',  'أبيض/أصفر',    'White/Yellow',  'Blanc/Jaune',      2,  2,  16,  false),
  (bx_id, 'yellow',        'أصفر',         'Yellow',        'Jaune',            3,  2,  20,  false),
  (bx_id, 'yellow_orange', 'أصفر/برتقالي', 'Yellow/Orange', 'Jaune/Orange',     4,  3,  24,  false),
  (bx_id, 'orange',        'برتقالي',      'Orange',        'Orange',           5,  3,  24,  false),
  (bx_id, 'orange_green',  'برتقالي/أخضر', 'Orange/Green',  'Orange/Vert',      6,  3,  28,  false),
  (bx_id, 'green',         'أخضر',         'Green',         'Verte',            7,  4,  32,  false),
  (bx_id, 'green_blue',    'أخضر/أزرق',    'Green/Blue',    'Vert/Bleu',        8,  4,  36,  false),
  (bx_id, 'blue',          'أزرق',         'Blue',          'Bleue',            9,  4,  40,  false),
  (bx_id, 'blue_purple',   'أزرق/أرجواني', 'Blue/Purple',   'Bleu/Violet',     10,  5,  44,  false),
  (bx_id, 'purple',        'أرجواني',      'Purple',        'Violette',        11,  5,  48,  false),
  (bx_id, 'purple_brown',  'أرجواني/بني',  'Purple/Brown',  'Violet/Marron',   12,  6,  52,  false),
  (bx_id, 'brown',         'بني',          'Brown',         'Marron',          13,  6,  56,  false),
  (bx_id, 'brown_black',   'بني/أسود',     'Brown/Black',   'Marron/Noir',     14,  6,  60,  false),
  (bx_id, 'red',           'أحمر',         'Red',           'Rouge',           15,  8,  80,  false),
  (bx_id, 'black_1',       'أسود °1',      'Black 1°',      'Noir 1°',         16, 12, 120,  true),
  (bx_id, 'black_2',       'أسود °2',      'Black 2°',      'Noir 2°',         17, 12, 120,  true),
  (bx_id, 'black_3',       'أسود °3',      'Black 3°',      'Noir 3°',         18, 12, 120,  true),
  (bx_id, 'black_4',       'أسود °4',      'Black 4°',      'Noir 4°',         19, 12, 120,  true),
  (bx_id, 'black_5',       'أسود °5',      'Black 5°',      'Noir 5°',         20, 12, 120,  true)
  ON CONFLICT (discipline_id, rank) DO NOTHING;
END $$;

-- -----------------------------------------------------------
-- MEMBERSHIP PLANS (3 tiers)
-- -----------------------------------------------------------
INSERT INTO membership_plans (gym_id, name_ar, name_en, name_fr, duration_days, price_usd, max_classes_per_week, includes_pt)
SELECT id, 'شهري', 'Monthly', 'Mensuel', 30, 50.00, NULL::integer, false FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'ربع سنوي', 'Quarterly', 'Trimestriel', 90, 130.00, NULL::integer, false FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'سنوي', 'Annual', 'Annuel', 365, 450.00, NULL::integer, true FROM gyms WHERE slug = 'proline-gym';

-- -----------------------------------------------------------
-- PT PACKAGES
-- -----------------------------------------------------------
INSERT INTO pt_packages (gym_id, name_ar, name_en, name_fr, session_count, price_usd, validity_days)
SELECT id, 'باقة 5 جلسات', '5 Sessions Pack', 'Pack 5 Séances', 5, 150.00, 60 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'باقة 10 جلسات', '10 Sessions Pack', 'Pack 10 Séances', 10, 280.00, 90 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'باقة 20 جلسة', '20 Sessions Pack', 'Pack 20 Séances', 20, 500.00, 180 FROM gyms WHERE slug = 'proline-gym';

-- -----------------------------------------------------------
-- RENTALS (facility spaces)
-- -----------------------------------------------------------
INSERT INTO rentals (gym_id, name_ar, name_en, name_fr, hourly_rate_usd)
SELECT id, 'صالة التدريب الرئيسية', 'Main Training Floor', 'Salle Principale', 25.00 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'غرفة التدريب الخاص', 'Private Training Room', 'Salle Privée', 15.00 FROM gyms WHERE slug = 'proline-gym'
UNION ALL
SELECT id, 'منطقة اللياقة', 'Fitness Area', 'Zone Fitness', 10.00 FROM gyms WHERE slug = 'proline-gym';

-- ============================================================
-- COACH RECORDS
-- ============================================================

-- Coach 1: John Smith — Head Coach, Muay Thai
-- Links to coach@prolinegym.lb auth user (created in 000008)
DO $$
DECLARE
  v_gym_id UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'coach@prolinegym.lb';

  IF v_user_id IS NOT NULL THEN
    -- Upsert profile for coach
    INSERT INTO profiles (id, gym_id, first_name_en, last_name_en, phone, gender, created_at, updated_at)
    VALUES (v_user_id, v_gym_id, 'John', 'Smith', '+961 70 111 222', 'male', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Insert coach record
    INSERT INTO coaches (profile_id, gym_id, specialization_en, belt_rank, hourly_rate_usd, is_active)
    SELECT v_user_id, v_gym_id, 'Head Coach - Muay Thai', 'black_3'::belt_rank_enum, 30.00, true
    WHERE NOT EXISTS (SELECT 1 FROM coaches WHERE profile_id = v_user_id AND gym_id = v_gym_id);
  END IF;
END $$;

-- Coach 2: Sarah Johnson — Coach, Boxing
-- Links to owner@prolinegym.lb auth user as secondary coach profile
DO $$
DECLARE
  v_gym_id UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'owner@prolinegym.lb';

  IF v_user_id IS NOT NULL THEN
    -- Insert coach record using owner's profile (demo convenience)
    INSERT INTO coaches (profile_id, gym_id, specialization_en, specialization_ar, specialization_fr, belt_rank, hourly_rate_usd, is_active)
    SELECT v_user_id, v_gym_id, 'Coach - Boxing', 'مدرب - ملاكمة', 'Coach - Boxe', 'black_2'::belt_rank_enum, 25.00, true
    WHERE NOT EXISTS (SELECT 1 FROM coaches WHERE profile_id = v_user_id AND gym_id = v_gym_id);
  END IF;
END $$;

-- ============================================================
-- DEMO CLASSES
-- ============================================================
DO $$
DECLARE
  v_gym_id UUID;
  v_mt_id UUID;
  v_bx_id UUID;
  v_coach_mt_id UUID;
  v_coach_bx_id UUID;
  v_class_mt UUID;
  v_class_bx UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';
  SELECT d.id INTO v_mt_id FROM disciplines d WHERE d.gym_id = v_gym_id AND d.name_en = 'Muay Thai';
  SELECT d.id INTO v_bx_id FROM disciplines d WHERE d.gym_id = v_gym_id AND d.name_en = 'Boxing';

  -- Coach assignments
  SELECT c.id INTO v_coach_mt_id FROM coaches c WHERE c.gym_id = v_gym_id AND c.specialization_en LIKE '%Muay Thai%' LIMIT 1;
  SELECT c.id INTO v_coach_bx_id FROM coaches c WHERE c.gym_id = v_gym_id AND c.specialization_en LIKE '%Boxing%' LIMIT 1;

  -- Fallback: use any coach
  IF v_coach_mt_id IS NULL THEN SELECT c.id INTO v_coach_mt_id FROM coaches c WHERE c.gym_id = v_gym_id LIMIT 1; END IF;
  IF v_coach_bx_id IS NULL THEN SELECT c.id INTO v_coach_bx_id FROM coaches c WHERE c.gym_id = v_gym_id LIMIT 1; END IF;

  -- Only insert classes if we have coaches
  IF v_coach_mt_id IS NOT NULL THEN
    -- Muay Thai Beginner
    INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active)
    VALUES (v_gym_id, v_mt_id, v_coach_mt_id,
            'ملاكمة تايلاندية - مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant',
            'Main Floor', 20, '#E53E3E', true)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_coach_bx_id IS NOT NULL THEN
    -- Boxing Beginner
    INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active)
    VALUES (v_gym_id, v_bx_id, v_coach_bx_id,
            'ملاكمة - مبتدئ', 'Boxing Beginner', 'Boxe Débutant',
            'Main Floor', 16, '#DD6B20', true)
    ON CONFLICT DO NOTHING;

    -- Boxing Intermediate
    INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active)
    VALUES (v_gym_id, v_bx_id, v_coach_bx_id,
            'ملاكمة - متوسط', 'Boxing Intermediate', 'Boxe Intermédiaire',
            'Main Floor', 14, '#D69E2E', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- DEMO CLASS SCHEDULES (weekly recurring)
-- ============================================================
DO $$
DECLARE
  v_gym_id UUID;
  v_class_mt UUID;
  v_class_bx UUID;
  v_class_bx_int UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';
  SELECT c.id INTO v_class_mt FROM classes c WHERE c.gym_id = v_gym_id AND c.name_en = 'Muay Thai Beginner' LIMIT 1;
  SELECT c.id INTO v_class_bx FROM classes c WHERE c.gym_id = v_gym_id AND c.name_en = 'Boxing Beginner' LIMIT 1;
  SELECT c.id INTO v_class_bx_int FROM classes c WHERE c.gym_id = v_gym_id AND c.name_en = 'Boxing Intermediate' LIMIT 1;

  -- Muay Thai Beginner: Mon/Wed 18:00-19:30
  IF v_class_mt IS NOT NULL THEN
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class_mt, 1, '18:00', '19:30', true)  -- Monday
    ON CONFLICT DO NOTHING;
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class_mt, 3, '18:00', '19:30', true)  -- Wednesday
    ON CONFLICT DO NOTHING;
  END IF;

  -- Boxing Beginner: Tue/Thu 17:00-18:30
  IF v_class_bx IS NOT NULL THEN
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class_bx, 2, '17:00', '18:30', true)  -- Tuesday
    ON CONFLICT DO NOTHING;
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class_bx, 4, '17:00', '18:30', true)  -- Thursday
    ON CONFLICT DO NOTHING;
  END IF;

  -- Boxing Intermediate: Sat 10:00-12:00
  IF v_class_bx_int IS NOT NULL THEN
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    VALUES (v_class_bx_int, 6, '10:00', '12:00', true) -- Saturday
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- DEMO STUDENTS (for testing Belt Engine)
-- ============================================================
-- ISO-DB Phase 0b: the demo-student INSERTs below reference current_belt_rank +
-- belt_promotion_date, which 000002 never created and 000010 only ADDs later — a
-- forward reference that aborts a from-zero `supabase db reset` here with 42703
-- (the long-lived cloud DB had the columns by the time this re-ran). 000010 already
-- ADD COLUMN IF NOT EXISTS these (its own comment notes "000006 already inserts
-- these columns"), so creating them here first is a safe no-op there. (Order bug,
-- not data change.)
ALTER TABLE students ADD COLUMN IF NOT EXISTS current_belt_rank belt_rank_enum;
ALTER TABLE students ADD COLUMN IF NOT EXISTS belt_promotion_date DATE;

INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
SELECT p.id, g.id, 'Ali Fakih', '+961 70 628 601', 'brown', '2026-01-15', true
FROM profiles p, gyms g
WHERE p.phone = '+96170000001' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM students WHERE profile_id = p.id);

INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
SELECT p.id, g.id, 'Rana Saad', '+961 71 111 222', 'blue', '2026-03-20', true
FROM profiles p, gyms g
WHERE p.phone = '+96170000002' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM students WHERE profile_id = p.id);

INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
SELECT p.id, g.id, 'Mohammad Hadi', '+961 70 333 444', 'white', '2026-05-01', true
FROM profiles p, gyms g
WHERE p.phone = '+96170000003' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM students WHERE profile_id = p.id);

INSERT INTO students (profile_id, gym_id, emergency_contact_name, emergency_contact_phone, current_belt_rank, belt_promotion_date, is_active)
SELECT p.id, g.id, 'Fatima Nour', '+961 76 555 666', 'yellow', '2026-02-10', true
FROM profiles p, gyms g
WHERE p.phone = '+96170000004' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM students WHERE profile_id = p.id);

-- ============================================================
-- DEMO STUDENT MEMBERSHIPS
-- ============================================================
DO $$
DECLARE
  v_gym_id UUID;
  v_plan_monthly UUID;
  v_plan_quarterly UUID;
  v_student1 UUID;
  v_student2 UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';
  SELECT mp.id INTO v_plan_monthly FROM membership_plans mp WHERE mp.gym_id = v_gym_id AND mp.name_en = 'Monthly' LIMIT 1;
  SELECT mp.id INTO v_plan_quarterly FROM membership_plans mp WHERE mp.gym_id = v_gym_id AND mp.name_en = 'Quarterly' LIMIT 1;

  -- Student 1 (Karim Mourad) — Monthly membership
  SELECT s.id INTO v_student1 FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000001' AND s.gym_id = v_gym_id LIMIT 1;
  IF v_student1 IS NOT NULL AND v_plan_monthly IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
    VALUES (v_student1, v_plan_monthly, '2026-04-01', '2026-05-01', 'active', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Student 2 (Rana Saad) — Quarterly membership
  SELECT s.id INTO v_student2 FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000002' AND s.gym_id = v_gym_id LIMIT 1;
  IF v_student2 IS NOT NULL AND v_plan_quarterly IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
    VALUES (v_student2, v_plan_quarterly, '2026-03-01', '2026-06-01', 'active', false)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Demo profiles (id is same as auth.users.id — created by handle_new_user trigger when users are seeded)
-- These INSERTs are idempotent thanks to WHERE NOT EXISTS
INSERT INTO profiles (id, gym_id, first_name_ar, first_name_en, last_name_ar, last_name_en, phone, gender, created_at, updated_at)
SELECT u.id, g.id, 'كريم', 'Karim', 'مراد', 'Mourad', '+96170000001', 'male', now(), now()
FROM auth.users u, gyms g WHERE u.email = 'student@prolinegym.lb' AND g.slug = 'proline-gym'
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = u.id);

-- ============================================================
-- DEMO PT ASSIGNMENTS — Credit tracking (sessions_used < sessions_total)
-- ============================================================
DO $$
DECLARE
  v_gym_id UUID;
  v_student_karim UUID;
  v_student_rana UUID;
  v_student_mohammad UUID;
  v_student_fatima UUID;
  v_coach_john UUID;
  v_coach_sarah UUID;
  v_pkg_5 UUID;
  v_pkg_10 UUID;
  v_pkg_20 UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE slug = 'proline-gym';

  -- Students (via profile phone)
  SELECT s.id INTO v_student_karim FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000001' AND s.gym_id = v_gym_id LIMIT 1;
  SELECT s.id INTO v_student_rana FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000002' AND s.gym_id = v_gym_id LIMIT 1;
  SELECT s.id INTO v_student_mohammad FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000003' AND s.gym_id = v_gym_id LIMIT 1;
  SELECT s.id INTO v_student_fatima FROM students s JOIN profiles p ON s.profile_id = p.id WHERE p.phone = '+96170000004' AND s.gym_id = v_gym_id LIMIT 1;

  -- Coaches (via specialization)
  SELECT c.id INTO v_coach_john FROM coaches c WHERE c.gym_id = v_gym_id AND c.specialization_en LIKE '%Muay Thai%' LIMIT 1;
  SELECT c.id INTO v_coach_sarah FROM coaches c WHERE c.gym_id = v_gym_id AND c.specialization_en LIKE '%Boxing%' LIMIT 1;

  -- Packages (via name)
  SELECT p.id INTO v_pkg_5 FROM pt_packages p WHERE p.gym_id = v_gym_id AND p.session_count = 5 LIMIT 1;
  SELECT p.id INTO v_pkg_10 FROM pt_packages p WHERE p.gym_id = v_gym_id AND p.session_count = 10 LIMIT 1;
  SELECT p.id INTO v_pkg_20 FROM pt_packages p WHERE p.gym_id = v_gym_id AND p.session_count = 20 LIMIT 1;

  -- Assignment 1: Karim — 10-session pack with John (Muay Thai), 3 sessions used
  IF v_student_karim IS NOT NULL AND v_pkg_10 IS NOT NULL AND v_coach_john IS NOT NULL THEN
    INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active)
    SELECT v_student_karim, v_pkg_10, v_coach_john, 10, 3, '2026-05-01'::timestamptz, '2026-08-01'::timestamptz, true
    WHERE NOT EXISTS (SELECT 1 FROM pt_assignments WHERE student_id = v_student_karim AND package_id = v_pkg_10 AND coach_id = v_coach_john);
  END IF;

  -- Assignment 2: Rana — 5-session pack with Sarah (Boxing), 1 session used
  IF v_student_rana IS NOT NULL AND v_pkg_5 IS NOT NULL AND v_coach_sarah IS NOT NULL THEN
    INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active)
    SELECT v_student_rana, v_pkg_5, v_coach_sarah, 5, 1, '2026-06-01'::timestamptz, '2026-08-01'::timestamptz, true
    WHERE NOT EXISTS (SELECT 1 FROM pt_assignments WHERE student_id = v_student_rana AND package_id = v_pkg_5 AND coach_id = v_coach_sarah);
  END IF;

  -- Assignment 3: Mohammad — 20-session pack with John (Muay Thai), 0 sessions used (brand new)
  IF v_student_mohammad IS NOT NULL AND v_pkg_20 IS NOT NULL AND v_coach_john IS NOT NULL THEN
    INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active)
    SELECT v_student_mohammad, v_pkg_20, v_coach_john, 20, 0, '2026-06-05'::timestamptz, '2026-12-05'::timestamptz, true
    WHERE NOT EXISTS (SELECT 1 FROM pt_assignments WHERE student_id = v_student_mohammad AND package_id = v_pkg_20 AND coach_id = v_coach_john);
  END IF;

  -- Assignment 4: Fatima — 10-session pack with Sarah (Boxing), 7 sessions used (almost done)
  IF v_student_fatima IS NOT NULL AND v_pkg_10 IS NOT NULL AND v_coach_sarah IS NOT NULL THEN
    INSERT INTO pt_assignments (student_id, package_id, coach_id, sessions_total, sessions_used, purchased_at, expires_at, is_active)
    SELECT v_student_fatima, v_pkg_10, v_coach_sarah, 10, 7, '2026-04-15'::timestamptz, '2026-07-15'::timestamptz, true
    WHERE NOT EXISTS (SELECT 1 FROM pt_assignments WHERE student_id = v_student_fatima AND package_id = v_pkg_10 AND coach_id = v_coach_sarah);
  END IF;
END $$;
