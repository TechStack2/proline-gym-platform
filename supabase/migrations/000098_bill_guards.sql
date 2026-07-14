-- ============================================================
-- 000098: BILL-GUARDS — cost is required, one billing door, no silent free.
--
-- OWNER DECREE (Lebanese model, fee due upfront at registration):
--   R2(i)   _activate_class_registration RAISES (P0001, curated prose) when the
--           resolved class fee is NULL (fee was never set). fee=0 stays the
--           by-design free skip. Root cause was COALESCE(..., 0) masking NULL as free.
--   R2(ii)  the same function REJECTS a discount (% > 100 or amount > fee) that would
--           silently drive the net to free.
--   R2(iii) sell_pt_package + register_camp reject a NULL price the same way; camp
--           now skips the invoice for an explicit 0 (free) — mirrors class/PT.
--   R5      NEW sell_membership: an initial membership sale that ISSUES an invoice
--           like every other product (was a direct student_memberships insert with
--           no bill), mirroring _issue_membership_renewal via _system_issue_invoice.
--
-- Byte-exact function-rewrite protocol: every rewrite below is the CURRENT latest
-- body (000090) reproduced VERBATIM with ONLY the guard lines added (assembled by
-- a diff-proved extract+patch, not retyped) — no later amendment is reverted, the
-- pinned `SET search_path = public` is preserved, and CREATE OR REPLACE keeps each
-- function's existing ACL (grants unchanged; PUBLIC re-revoked defensively).
--
-- The seed_e2e_gym_base rewrite gives the per-worker E2E class an explicit fee=0
-- (was NULL) so the new NULL guard doesn't break the suite — 0 reproduces today's
-- COALESCE(NULL→0) free-skip exactly. (db-replay is blind to the seed; it runs in E2E.)
--
-- NEEDS PROD APPLY. Owner sets real fees on live products via the (now-required) UI.
-- ============================================================

-- ── seed: per-worker E2E class fee 0 (free) — behavior-identical to today ──
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
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr, room, max_capacity, color, is_active, monthly_fee_usd, monthly_fee_lbp)
  VALUES (v_gym, v_disc_mt, v_coach_row, 'ملاكمة تايلاندية - مبتدئ', 'Muay Thai Beginner', 'Muay Thaï Débutant', 'Main Floor', 20, '#E53E3E', true, 0, 0)
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

-- ── R2(i)+(ii): class-registration fee + discount guards ──
CREATE OR REPLACE FUNCTION _activate_class_registration(
  p_reg_id UUID, p_discount_pct NUMERIC, p_discount_amount_usd NUMERIC, p_notify_type TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg     class_registrations;
  v_class   classes;
  v_fee     NUMERIC;
  v_pct     NUMERIC;
  v_amt     NUMERIC;
  v_net     NUMERIC;
  v_net_lbp NUMERIC;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_inv     invoices;
  v_inv_id  UUID := NULL;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  SELECT * INTO v_class FROM classes WHERE id = v_reg.class_id;

  -- BILL-GUARDS R2(i): the resolved fee must be SET. NULL = the class fee was never
  -- entered → billing nothing silently is the bug this closes. 0 stays the free skip.
  v_fee := COALESCE(v_reg.monthly_fee_usd, v_class.monthly_fee_usd);
  IF v_fee IS NULL THEN
    RAISE EXCEPTION 'This class has no fee set. Set a monthly fee or mark the class free before registering.';
  END IF;
  -- BILL-GUARDS R2(ii): reject a discount that exceeds the fee (would silently free it).
  IF COALESCE(p_discount_pct, 0) < 0 OR COALESCE(p_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'The discount percentage must be between 0 and 100.';
  END IF;
  IF COALESCE(p_discount_amount_usd, 0) < 0 OR COALESCE(p_discount_amount_usd, 0) > v_fee THEN
    RAISE EXCEPTION 'The discount is larger than the class fee.';
  END IF;
  v_pct := LEAST(GREATEST(COALESCE(p_discount_pct, 0), 0), 100);     -- E6: % in [0,100]
  v_amt := GREATEST(COALESCE(p_discount_amount_usd, 0), 0);          -- E6: floor 0
  v_net := v_fee * (1 - v_pct / 100.0) - v_amt;
  IF v_net < 0 THEN v_net := 0; END IF;                              -- E6: never below 0

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_reg.gym_id ORDER BY rate_date DESC LIMIT 1;
  v_net_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE COALESCE(v_reg.monthly_fee_lbp, 0) END;

  -- E5: bill on the active transition (skip when fully discounted / free).
  IF v_net > 0.005 THEN
    v_inv := _system_issue_invoice(
      v_reg.gym_id, v_reg.student_id, 'class_registration', v_net, v_net_lbp, v_rate, v_rdate, NULL,
      (CURRENT_DATE + 14),
      COALESCE(v_class.name_en, '') || ' — ' || _invoice_month_label(CURRENT_DATE, 'en'),
      COALESCE(v_class.name_ar, '') || ' — ' || _invoice_month_label(CURRENT_DATE, 'ar'),
      COALESCE(v_class.name_fr, '') || ' — ' || _invoice_month_label(CURRENT_DATE, 'fr'));
    v_inv_id := v_inv.id;
  END IF;

  UPDATE class_registrations
  SET status = 'active', waitlist_position = NULL,
      discount_pct = v_pct, discount_amount_usd = v_amt,
      start_date = CURRENT_DATE, end_date = (CURRENT_DATE + INTERVAL '1 month')::date,
      invoice_id = v_inv_id, approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_reg_id;

  -- Project the attendance roster (B1 class_enrollments — unchanged flow).
  INSERT INTO class_enrollments (class_id, student_id, is_active)
  VALUES (v_reg.class_id, v_reg.student_id, true)
  ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;

  PERFORM _notify_class_student(
    v_reg.student_id, v_reg.gym_id, p_notify_type,
    -- GO-LIVE-GUARDS: the approval notify shows what the member OWES — the
    -- tax-inclusive invoice total — not the pre-TVA net.
    jsonb_build_object('class', COALESCE(v_class.name_en, v_class.name_ar), 'fee', COALESCE(v_inv.total_usd, v_net)), p_reg_id);

  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('class_registrations', p_reg_id, 'update',
          jsonb_build_object('action', p_notify_type, 'net_usd', v_net, 'invoice', v_inv_id), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;

-- ── R2(iii): PT package NULL-price guard ──
CREATE OR REPLACE FUNCTION sell_pt_package(
  p_student_id          UUID,
  p_package_id          UUID,
  p_coach_id            UUID,
  p_discount_pct        NUMERIC DEFAULT 0,
  p_discount_amount_usd NUMERIC DEFAULT 0,
  p_request_id          UUID DEFAULT NULL
) RETURNS pt_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg     pt_packages;
  v_student students;
  v_req     pt_assignments;
  v_a       pt_assignments;
  v_net     NUMERIC;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_lbp     NUMERIC;
  v_inv     invoices;
  v_expires TIMESTAMPTZ;
  v_name    TEXT;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may sell PT packages'; END IF;

  SELECT * INTO v_pkg FROM pt_packages WHERE id = p_package_id;
  IF v_pkg.id IS NULL THEN RAISE EXCEPTION 'Package type % not found', p_package_id; END IF;
  IF v_pkg.gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Package type is not in your gym'; END IF;
  IF NOT v_pkg.is_active OR v_pkg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Package type is archived'; END IF;
  -- BILL-GUARDS R2(iii): a package with no price can't be sold (silent free).
  IF v_pkg.price_usd IS NULL THEN
    RAISE EXCEPTION 'This package has no price set. Set a price or mark it free.';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF v_student.gym_id <> v_pkg.gym_id THEN RAISE EXCEPTION 'Member and package are in different gyms'; END IF;
  IF NOT v_student.is_active THEN RAISE EXCEPTION 'Member is not active'; END IF;

  -- Coach: MANDATORY for a desk sale (allocation binds at sale, §3); the 22R
  -- approval path (p_request_id) may carry NULL — the legacy request semantics
  -- where the coach binds at scheduling (schedule_pt_session requires one).
  IF p_request_id IS NULL AND p_coach_id IS NULL THEN
    RAISE EXCEPTION 'A coach is required for a PT sale';
  END IF;
  IF p_coach_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coaches WHERE id = p_coach_id AND gym_id = v_pkg.gym_id AND is_active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Coach is not an active coach of this gym';
  END IF;

  IF COALESCE(p_discount_pct, 0) < 0 OR COALESCE(p_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 100';
  END IF;

  -- Discount discipline (B2 idiom): % then fixed, floor at zero.
  v_net := GREATEST(0, round(v_pkg.price_usd * (1 - COALESCE(p_discount_pct, 0) / 100), 2)
                        - COALESCE(p_discount_amount_usd, 0));
  v_expires := CASE WHEN v_pkg.validity_days IS NOT NULL
                    THEN now() + make_interval(days => v_pkg.validity_days) END;

  IF p_request_id IS NOT NULL THEN
    -- 22R approval path: ACTIVATE the member's requested row (same writer).
    SELECT * INTO v_req FROM pt_assignments WHERE id = p_request_id FOR UPDATE;
    IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF v_req.status <> 'requested' THEN RAISE EXCEPTION 'Request is not pending (status %)', v_req.status; END IF;
    IF v_req.student_id <> p_student_id OR v_req.package_id <> p_package_id THEN
      RAISE EXCEPTION 'Request does not match the member/package';
    END IF;
    UPDATE pt_assignments
    SET status = 'active', is_active = true, coach_id = COALESCE(p_coach_id, coach_id),
        sessions_total = v_pkg.session_count, sessions_used = 0,
        purchased_at = now(), expires_at = v_expires,
        approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_a;
  ELSE
    INSERT INTO pt_assignments (
      student_id, package_id, coach_id, sessions_total, sessions_used,
      status, is_active, purchased_at, expires_at, approved_by, approved_at
    )
    VALUES (
      p_student_id, p_package_id, p_coach_id, v_pkg.session_count, 0,
      'active', true, now(), v_expires, auth.uid(), now()
    )
    RETURNING * INTO v_a;
  END IF;

  -- Invoice via the canonical issuance path (number/TVA triggers; payer
  -- auto-resolves to the primary guardian for linked minors — B3).
  IF v_net > 0.005 THEN
    SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_pkg.gym_id ORDER BY rate_date DESC LIMIT 1;
    v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE COALESCE(v_pkg.price_lbp, 0) END;
    v_inv := _system_issue_invoice(
      v_pkg.gym_id, p_student_id, 'pt_package', v_net, v_lbp, v_rate, v_rdate, NULL, NULL,
      COALESCE(v_pkg.name_en, '') || ' · ' || v_pkg.session_count || ' sessions',
      COALESCE(v_pkg.name_ar, '') || ' · ' || v_pkg.session_count || ' حصص',
      COALESCE(v_pkg.name_fr, '') || ' · ' || v_pkg.session_count || ' séances',
      NULL);
    UPDATE pt_assignments SET invoice_id = v_inv.id, updated_at = now() WHERE id = v_a.id
    RETURNING * INTO v_a;
  END IF;

  -- Best-effort notifications (member approved/sold + coach assigned) — the
  -- F2 pattern; login-less members have no auth row, so never fail the sale.
  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_pkg.gym_id, 'pt_approved',
            'messages.pt_approved.title', 'messages.pt_approved.body',
            jsonb_build_object('package', COALESCE(v_pkg.name_en, v_pkg.name_ar), 'count', v_a.sessions_total),
            'pt_assignment', v_a.id, '/portal/pt');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT c.profile_id, v_pkg.gym_id, 'pt_assigned',
           'messages.pt_assigned.title', 'messages.pt_assigned.body',
           jsonb_build_object('count', v_a.sessions_total),
           'pt_assignment', v_a.id, '/coach/pt'
    FROM coaches c WHERE c.id = p_coach_id AND c.profile_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_a;
END;
$$;
REVOKE ALL ON FUNCTION sell_pt_package(UUID, UUID, UUID, NUMERIC, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_pt_package(UUID, UUID, UUID, NUMERIC, NUMERIC, UUID) TO authenticated;

-- ── R2(iii): camp NULL-price guard + explicit-0 free skip ──
CREATE OR REPLACE FUNCTION register_camp(
  p_student_id UUID,
  p_camp_id    UUID,
  p_request_id UUID DEFAULT NULL
) RETURNS camp_registrations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp      camps;
  v_student   students;
  v_req       camp_registrations;
  v_reg       camp_registrations;
  v_confirmed INTEGER;
  v_rate      NUMERIC;
  v_rdate     DATE;
  v_lbp       NUMERIC;
  v_inv       invoices;
  v_guardian  UUID;
  v_payerprof UUID;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may register for a camp'; END IF;

  -- LOCK the camp row: the capacity count below is race-safe — two concurrent
  -- registrations serialize here and the N+1th gets the clear error.
  SELECT * INTO v_camp FROM camps WHERE id = p_camp_id FOR UPDATE;
  IF v_camp.id IS NULL OR v_camp.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Camp not found'; END IF;
  IF v_camp.gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Camp is not in your gym'; END IF;
  IF v_camp.status NOT IN ('open', 'in_progress', 'full') THEN
    RAISE EXCEPTION 'Camp is not open for registration';
  END IF;
  -- BILL-GUARDS R2(iii): a camp with no price can't be registered (silent free).
  IF v_camp.price_usd IS NULL THEN
    RAISE EXCEPTION 'This camp has no price set. Set a price or mark it free.';
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF v_student.gym_id <> v_camp.gym_id THEN RAISE EXCEPTION 'Member and camp are in different gyms'; END IF;

  SELECT count(*) INTO v_confirmed FROM camp_registrations
  WHERE camp_id = p_camp_id AND status = 'confirmed';
  IF v_confirmed >= v_camp.max_capacity THEN
    RAISE EXCEPTION 'Camp is full (% of % places taken)', v_confirmed, v_camp.max_capacity;
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_req FROM camp_registrations WHERE id = p_request_id FOR UPDATE;
    IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending (status %)', v_req.status; END IF;
    IF v_req.student_id <> p_student_id OR v_req.camp_id <> p_camp_id THEN
      RAISE EXCEPTION 'Request does not match the member/camp';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM camp_registrations
      WHERE camp_id = p_camp_id AND student_id = p_student_id AND status NOT IN ('cancelled')
    ) THEN
      RAISE EXCEPTION 'Already registered for this camp';
    END IF;
  END IF;

  -- B3: the registration remembers the primary guardian (guardians row), and
  -- _system_issue_invoice auto-resolves the same guardian as the invoice payer.
  v_payerprof := _primary_guardian_profile(p_student_id);
  IF v_payerprof IS NOT NULL THEN
    SELECT g.id INTO v_guardian FROM guardians g WHERE g.profile_id = v_payerprof LIMIT 1;
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE camp_registrations
    SET status = 'confirmed', price_usd = v_camp.price_usd, price_lbp = v_camp.price_lbp,
        guardian_id = COALESCE(guardian_id, v_guardian), updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_reg;
  ELSE
    INSERT INTO camp_registrations (camp_id, student_id, guardian_id, status, registration_date, price_usd, price_lbp)
    VALUES (p_camp_id, p_student_id, v_guardian, 'confirmed', now(), v_camp.price_usd, v_camp.price_lbp)
    ON CONFLICT (camp_id, student_id)
    DO UPDATE SET status = 'confirmed', guardian_id = COALESCE(EXCLUDED.guardian_id, camp_registrations.guardian_id),
                  price_usd = EXCLUDED.price_usd, price_lbp = EXCLUDED.price_lbp,
                  registration_date = now(), updated_at = now()
    RETURNING * INTO v_reg;
  END IF;

  -- BILL-GUARDS R2(iii): 0 = explicitly free → no invoice (mirrors the class/PT skip;
  -- _system_issue_invoice rejects a $0 amount anyway). NULL was rejected above.
  IF v_camp.price_usd > 0.005 THEN
  -- Invoice via the canonical path (TVA/number triggers; payer auto = guardian).
  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_camp.gym_id ORDER BY rate_date DESC LIMIT 1;
  v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_camp.price_usd * v_rate) ELSE COALESCE(v_camp.price_lbp, 0) END;
  v_inv := _system_issue_invoice(
    v_camp.gym_id, p_student_id, 'camp', v_camp.price_usd, v_lbp, v_rate, v_rdate, NULL, NULL,
    COALESCE(v_camp.name_en, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'en'),
    COALESCE(v_camp.name_ar, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'ar'),
    COALESCE(v_camp.name_fr, '') || ' — ' || _invoice_month_label(v_camp.start_date, 'fr'),
    NULL);
  UPDATE camp_registrations SET invoice_id = v_inv.id, updated_at = now() WHERE id = v_reg.id
  RETURNING * INTO v_reg;
  END IF;

  -- Capacity edge: this registration filled the camp → flip status (the
  -- landing/portal "Full" badge is a catalog field, visible to anon).
  IF v_confirmed + 1 >= v_camp.max_capacity AND v_camp.status IN ('open', 'in_progress') THEN
    UPDATE camps SET status = 'full', updated_at = now() WHERE id = p_camp_id;
  END IF;

  -- Best-effort member notification (login-less kids have no auth row).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_camp.gym_id, 'camp_confirmed',
            'messages.camp_confirmed.title', 'messages.camp_confirmed.body',
            jsonb_build_object('camp', COALESCE(v_camp.name_en, v_camp.name_ar)),
            'camp_registration', v_reg.id, '/portal');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION register_camp(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_camp(UUID, UUID, UUID) TO authenticated;

-- ── R5: sell_membership — initial sale bills like everything else ──
CREATE OR REPLACE FUNCTION sell_membership(
  p_student_id UUID,
  p_plan_id    UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_auto_renew BOOLEAN DEFAULT true
) RETURNS student_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym     UUID;
  v_student students;
  v_plan    membership_plans;
  v_mem     student_memberships;
  v_start   DATE;
  v_end     DATE;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_lbp     NUMERIC;
  v_inv     invoices;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may sell a membership'; END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN RAISE EXCEPTION 'No gym context for caller'; END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF v_student.gym_id <> v_gym THEN RAISE EXCEPTION 'Member is not in your gym'; END IF;

  SELECT * INTO v_plan FROM membership_plans WHERE id = p_plan_id AND gym_id = v_gym;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Membership plan not found in your gym'; END IF;
  -- BILL-GUARDS R1/R5: a plan with no price can't be sold (silent free membership).
  IF v_plan.price_usd IS NULL THEN
    RAISE EXCEPTION 'This plan has no price set. Set a price or mark it free.';
  END IF;

  v_start := COALESCE(p_start_date, CURRENT_DATE);
  v_end   := v_start + v_plan.duration_days;
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status, auto_renew)
  VALUES (p_student_id, p_plan_id, v_start, v_end, 'active', COALESCE(p_auto_renew, true))
  RETURNING * INTO v_mem;

  -- Initial-sale invoice via the canonical service (number/TVA triggers; payer auto =
  -- primary guardian for a linked minor). 0 = explicitly free → no invoice.
  IF v_plan.price_usd > 0.005 THEN
    SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_gym ORDER BY rate_date DESC LIMIT 1;
    v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_plan.price_usd * v_rate) ELSE COALESCE(v_plan.price_lbp, 0) END;
    v_inv := _system_issue_invoice(
      v_gym, p_student_id, 'membership', v_plan.price_usd, v_lbp, v_rate, v_rdate,
      v_mem.id, v_start,
      COALESCE(v_plan.name_en, '') || ' — ' || _invoice_month_label(v_start, 'en'),
      COALESCE(v_plan.name_ar, '') || ' — ' || _invoice_month_label(v_start, 'ar'),
      COALESCE(v_plan.name_fr, '') || ' — ' || _invoice_month_label(v_start, 'fr'),
      NULL);
  END IF;

  RETURN v_mem;
END;
$$;
-- NEW function → Supabase default privileges auto-GRANT execute to anon; REVOKE it
-- explicitly (REVOKE FROM PUBLIC does not remove the explicit anon grant — AUTH-DEPTH).
REVOKE ALL ON FUNCTION sell_membership(UUID, UUID, DATE, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION sell_membership(UUID, UUID, DATE, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION sell_membership(UUID, UUID, DATE, BOOLEAN) TO authenticated;
