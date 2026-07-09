-- ============================================================
-- 000092: DISC-ICON — an optional per-discipline icon/image
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / DISC-ICON)
--
-- A discipline (Boxing / Muay Thai / BJJ …) gets an OPTIONAL uploaded icon that
-- renders wherever disciplines are listed: the Settings discipline manager, the
-- class-wizard discipline chips, and the public landing programs section. Until
-- a gym uploads one, every surface falls back to an emoji-free initial glyph, so
-- this is purely additive — nothing renders differently for existing rows.
--
-- Storage: REUSES the public `gym-landing` bucket (000079) at the per-gym path
--   <gym_id>/disciplines/<uuid>.jpg
-- The existing gym-landing storage policies already authorize this prefix — the
-- INSERT/UPDATE/DELETE policies gate on `(storage.foldername(name))[1] =
-- get_user_gym_id()::text AND is_gym_admin()`, and `disciplines/<uuid>.jpg` sits
-- UNDER the `<gym_id>/` folder, so no new bucket and NO new storage policy are
-- needed (and no service-role path). Public read is the bucket's public flag +
-- gym_landing_public_read. icon_url stores the RELATIVE object path (AVATAR-PATHS
-- contract); the app resolves it with storagePublicUrl('gym-landing', …).
-- ============================================================

-- 1) The column — nullable, additive, replay-safe. -------------------------------
ALTER TABLE disciplines ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- 2) Landing read path — the public programs section reads disciplines through the
--    CATALOG-SCOPE definer RPC (000080), NOT a blanket anon table read, so the new
--    column must be projected there to reach the landing. Adding a column to the
--    RETURNS TABLE is a return-type change → CREATE OR REPLACE fails 42P13; DROP
--    the old signature first, then recreate + re-grant (the get_landing_* leaf is
--    safe to drop — no dependents). Column order is additive (icon_url appended).
DROP FUNCTION IF EXISTS get_landing_disciplines(UUID);
CREATE OR REPLACE FUNCTION get_landing_disciplines(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT, sort_order INTEGER, icon_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name_ar::TEXT, d.name_en::TEXT, d.name_fr::TEXT, d.sort_order, d.icon_url
  FROM disciplines d
  WHERE d.gym_id = p_gym_id AND d.is_active AND is_active_gym(d.gym_id)
  ORDER BY d.sort_order, d.id;
$$;
REVOKE ALL ON FUNCTION get_landing_disciplines(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_disciplines(UUID) TO anon, authenticated;
