-- ============================================================
-- 000035: PUBLIC LANDING READ (V1 / LP) — anon catalog visibility
-- PRO LINE Gym Platform
--
-- The landing's data sections (Disciplines / Schedule / Pricing) only rendered
-- to LOGGED-IN users: the `_read` policies on disciplines/classes/class_schedules/
-- membership_plans gate on `auth.role() = 'authenticated'`, and `gyms` has no
-- public read at all — so a logged-out visitor saw empty sections.
--
-- This adds `anon`-role SELECT visibility for the PUBLIC CATALOG ONLY — active
-- rows of active gyms — and NOTHING else. No students / attendance / enrollments /
-- registrations / profiles / payments / invoices (those tables get no anon policy,
-- so RLS denies anon by default). The gym itself is resolved via a SECURITY
-- DEFINER function that returns only {id, slug, name_*} — so the `gyms` row
-- (tvA_registration_number, email, …) is never exposed to anon. The catalog
-- policies gate active-gym/active-class via SECURITY DEFINER helpers, so the
-- policy joins don't require anon to read `gyms`/`classes` directly.
-- ============================================================

-- -----------------------------------------------------------
-- Helpers (SECURITY DEFINER → bypass RLS for the gate checks only)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION is_active_gym(p_gym_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM gyms WHERE id = p_gym_id AND is_active);
$$;
REVOKE ALL ON FUNCTION is_active_gym(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_gym(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION is_public_class(p_class_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c
    JOIN gyms g ON g.id = c.gym_id
    WHERE c.id = p_class_id AND c.is_active AND g.is_active
  );
$$;
REVOKE ALL ON FUNCTION is_public_class(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_public_class(UUID) TO anon, authenticated;

-- Public gym resolver — only the slug + display names of an ACTIVE gym. Never
-- exposes the gyms row (tvA number, email, settings). Used by the landing.
CREATE OR REPLACE FUNCTION get_public_gym(p_slug TEXT)
RETURNS TABLE (id UUID, slug TEXT, name_ar TEXT, name_en TEXT, name_fr TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.slug::TEXT, g.name_ar::TEXT, g.name_en::TEXT, g.name_fr::TEXT
  FROM gyms g
  WHERE g.slug = p_slug AND g.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_public_gym(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_gym(TEXT) TO anon, authenticated;

-- -----------------------------------------------------------
-- Anon SELECT policies — public catalog, active rows of active gyms ONLY.
-- Additive (permissive): logged-in users keep their existing `_read` policies.
-- -----------------------------------------------------------
DROP POLICY IF EXISTS disciplines_public_read ON disciplines;
CREATE POLICY disciplines_public_read ON disciplines FOR SELECT TO anon
  USING (is_active AND is_active_gym(gym_id));

DROP POLICY IF EXISTS classes_public_read ON classes;
CREATE POLICY classes_public_read ON classes FOR SELECT TO anon
  USING (is_active AND is_active_gym(gym_id));

DROP POLICY IF EXISTS class_schedules_public_read ON class_schedules;
CREATE POLICY class_schedules_public_read ON class_schedules FOR SELECT TO anon
  USING (is_active AND is_public_class(class_id));

DROP POLICY IF EXISTS membership_plans_public_read ON membership_plans;
CREATE POLICY membership_plans_public_read ON membership_plans FOR SELECT TO anon
  USING (is_active AND is_active_gym(gym_id));
