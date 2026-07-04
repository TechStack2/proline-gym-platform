-- ============================================================
-- 000080: CATALOG-SCOPE (Phase 4 SECURITY) — kill cross-tenant catalog enumeration
-- PRO LINE Gym Platform
--
-- PROBLEM. The public-landing anon SELECT policies grant the anon key a BLANKET
-- read of EVERY active gym's full catalog + pricing:
--   · 000035 disciplines_public_read / classes_public_read /
--     class_schedules_public_read / membership_plans_public_read
--   · 000041 pt_packages_public_read
--   · 000043 camps_public_read
-- Fine with one tenant; a competitive-data leak (bulk scrape, cross-tenant join,
-- gym discovery) the moment a second gym exists — anon can `SELECT *` the whole
-- table across all gyms.
--
-- FIX. Replace the blanket anon table reads with per-gym SECURITY DEFINER RPCs
-- (the get_landing_coaches (000059) / get_landing_images (000079) pattern) — each
-- returns ONLY the active public rows of ONE active gym per call, so anon can no
-- longer enumerate across tenants. Then DROP the six anon *_public_read policies.
-- The AUTHENTICATED *_read policies (000004, gym-scoped via get_user_gym_id) are
-- UNTOUCHED — staff/member app reads stay RLS-scoped; anon direct SELECT now
-- returns ZERO rows (RLS is enabled on all six, no anon policy remains).
--
-- SCOPE NOTE (auditor): the slice named "the four" 000035 tables. pt_packages
-- (000041) + camps (000043) carry the IDENTICAL anon-enumeration leak and their
-- landing sections read anon, so they are closed here with the same pre-approved
-- shape (per-gym RPC + drop *_public_read). SIX policies dropped, SIX RPCs added.
--
-- ADDITIVE + idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS); replay-clean.
-- Text/enum columns cast ::TEXT to match the RETURNS TABLE contract (VARCHAR(255)
-- names, VARCHAR(7) color, camp_status_enum status) — the get_public_gym pattern.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Per-gym landing catalog RPCs. STABLE SECURITY DEFINER; active rows of an
--    ACTIVE gym only; REVOKE PUBLIC / GRANT anon+authenticated. is_active_gym()
--    (000035) gates the active-gym check without anon reading `gyms` directly.
-- -----------------------------------------------------------

-- Disciplines (also feeds the trial-form interest chips: id + names).
CREATE OR REPLACE FUNCTION get_landing_disciplines(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT, sort_order INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name_ar::TEXT, d.name_en::TEXT, d.name_fr::TEXT, d.sort_order
  FROM disciplines d
  WHERE d.gym_id = p_gym_id AND d.is_active AND is_active_gym(d.gym_id)
  ORDER BY d.sort_order, d.id;
$$;
REVOKE ALL ON FUNCTION get_landing_disciplines(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_disciplines(UUID) TO anon, authenticated;

-- Weekly schedule = active classes JOIN their active recurring slots (flattened).
CREATE OR REPLACE FUNCTION get_landing_schedule(p_gym_id UUID)
RETURNS TABLE (class_id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT, color TEXT,
               day_of_week SMALLINT, start_time TIME, end_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT, c.color::TEXT,
         s.day_of_week, s.start_time, s.end_time
  FROM classes c
  JOIN class_schedules s ON s.class_id = c.id
  WHERE c.gym_id = p_gym_id AND c.is_active AND s.is_active AND is_active_gym(c.gym_id)
  ORDER BY s.start_time, s.day_of_week, c.name_en;
$$;
REVOKE ALL ON FUNCTION get_landing_schedule(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_schedule(UUID) TO anon, authenticated;

-- Membership plans (pricing cards).
CREATE OR REPLACE FUNCTION get_landing_plans(p_gym_id UUID)
RETURNS TABLE (name_ar TEXT, name_en TEXT, name_fr TEXT, duration_days INTEGER,
               price_usd NUMERIC, price_lbp NUMERIC, includes_pt BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.name_ar::TEXT, m.name_en::TEXT, m.name_fr::TEXT, m.duration_days,
         m.price_usd, m.price_lbp, m.includes_pt
  FROM membership_plans m
  WHERE m.gym_id = p_gym_id AND m.is_active AND is_active_gym(m.gym_id)
  ORDER BY m.duration_days;
$$;
REVOKE ALL ON FUNCTION get_landing_plans(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_plans(UUID) TO anon, authenticated;

-- Priced classes (per-class monthly registration fees — B2).
CREATE OR REPLACE FUNCTION get_landing_class_fees(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT,
               monthly_fee_usd NUMERIC, monthly_fee_lbp NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT,
         c.monthly_fee_usd, c.monthly_fee_lbp
  FROM classes c
  WHERE c.gym_id = p_gym_id AND c.is_active AND c.monthly_fee_usd IS NOT NULL
    AND is_active_gym(c.gym_id)
  ORDER BY c.monthly_fee_usd;
$$;
REVOKE ALL ON FUNCTION get_landing_class_fees(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_class_fees(UUID) TO anon, authenticated;

-- PT packages (active + published on the landing).
CREATE OR REPLACE FUNCTION get_landing_pt(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT,
               session_count INTEGER, price_usd NUMERIC, validity_days INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name_ar::TEXT, p.name_en::TEXT, p.name_fr::TEXT,
         p.session_count, p.price_usd, p.validity_days
  FROM pt_packages p
  WHERE p.gym_id = p_gym_id AND p.is_active AND p.show_on_landing
    AND p.deleted_at IS NULL AND is_active_gym(p.gym_id)
  ORDER BY p.session_count;
$$;
REVOKE ALL ON FUNCTION get_landing_pt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_pt(UUID) TO anon, authenticated;

-- Camps (published, upcoming, open/full/in-progress — mirrors 000043's gate).
CREATE OR REPLACE FUNCTION get_landing_camps(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT,
               start_date DATE, end_date DATE, min_age INTEGER, max_age INTEGER,
               price_usd NUMERIC, status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT,
         c.start_date, c.end_date, c.min_age, c.max_age, c.price_usd, c.status::TEXT
  FROM camps c
  WHERE c.gym_id = p_gym_id AND c.show_on_landing AND c.deleted_at IS NULL
    AND c.status IN ('open', 'full', 'in_progress')
    AND c.end_date >= CURRENT_DATE
    AND is_active_gym(c.gym_id)
  ORDER BY c.start_date;
$$;
REVOKE ALL ON FUNCTION get_landing_camps(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_camps(UUID) TO anon, authenticated;

-- -----------------------------------------------------------
-- 2. DROP the anon *_public_read policies. Anon can no longer SELECT * across
--    tenants; it reads the public catalog ONLY through the per-gym RPCs above.
--    The AUTHENTICATED gym-scoped *_read policies (000004) are UNTOUCHED.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS disciplines_public_read      ON disciplines;
DROP POLICY IF EXISTS classes_public_read          ON classes;
DROP POLICY IF EXISTS class_schedules_public_read  ON class_schedules;
DROP POLICY IF EXISTS membership_plans_public_read ON membership_plans;
DROP POLICY IF EXISTS pt_packages_public_read      ON pt_packages;
DROP POLICY IF EXISTS camps_public_read            ON camps;
