-- ============================================================
-- 000083: VENDOR-CONSOLE — cross-tenant gym enumeration for the platform admin
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / VENDOR-CONSOLE)
--
-- The vendor console lists ALL gyms across tenants. Normal RLS is gym-scoped (a
-- user only ever sees their own gym), so cross-tenant enumeration needs a
-- SECURITY DEFINER projection GATED to platform admins — the 000082 primitive.
--
-- SECURITY: the platform-admin gate lives INSIDE the function (`WHERE
-- is_platform_admin()`), so a non-admin / anon caller gets ZERO rows (never the
-- gym list) even though EXECUTE is granted to authenticated. is_platform_admin()
-- is itself SECURITY DEFINER + returns false for anon. No new table, no RLS change,
-- no write path. member_count is a cheap correlated count (a vendor has few gyms).
-- Additive + idempotent; mirrors get_all_gyms shape to get_landing_coaches (000059).
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_gyms_for_admin()
RETURNS TABLE (
  id           UUID,
  name_en      TEXT,
  slug         TEXT,
  is_active    BOOLEAN,
  created_at   TIMESTAMPTZ,
  member_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.name_en::text,
    g.slug::text,
    g.is_active,
    g.created_at,
    (SELECT count(*) FROM students s WHERE s.gym_id = g.id) AS member_count
  FROM gyms g
  WHERE is_platform_admin()            -- gate INSIDE: a non-admin caller sees zero rows
  ORDER BY g.created_at DESC;
$$;
REVOKE ALL ON FUNCTION get_all_gyms_for_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_all_gyms_for_admin() TO authenticated;
