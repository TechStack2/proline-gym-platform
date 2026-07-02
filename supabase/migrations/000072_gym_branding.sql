-- ============================================================
-- 000072: WL-LANDING — per-gym landing branding (white-label)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / WL-LANDING)
--
-- The public landing already resolves a gym by slug (get_public_gym) and shows
-- that gym's disciplines/classes/schedule, but BRANDING (name/logo/color/hero/
-- tagline) was hardcoded to the Proline demo. This ADDITIVE, replay-clean
-- migration makes branding a per-gym data source, DEFAULTING to the current
-- Proline look when unset (NULL → the template's built-in default → no regression):
--   1. brand columns on gyms (logo_url already exists) — all NULLABLE
--   2. get_public_gym extended to return the (public) branding fields for anon
--   3. seed_e2e_wl_gym — an e2e-only seed for the branding guard
--
-- Branding is PUBLIC by nature (it's shown to logged-out visitors), so returning
-- it from the anon RPC is safe — unlike the gyms row's TVA/email, which stay
-- unexposed (the RPC returns ONLY these columns). No RLS change. Incremental:
-- data-source + template wiring only — NO CMS/page-builder (a later slice).
-- ============================================================

-- 1. Per-gym brand fields — all NULLABLE; NULL = the template's default (Proline).
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS brand_color    TEXT,   -- hex like '#cd1419'; NULL = default crimson
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,   -- full-bleed hero photo; NULL = /landing/gym-1.jpg
  ADD COLUMN IF NOT EXISTS tagline_ar     TEXT,
  ADD COLUMN IF NOT EXISTS tagline_en     TEXT,
  ADD COLUMN IF NOT EXISTS tagline_fr     TEXT;
-- gyms.logo_url already exists (000002).

-- 2. Extend get_public_gym to carry the public branding fields. Return-type change
--    → DROP + recreate (CREATE OR REPLACE cannot change the OUT columns). Same
--    anon-only exposure contract as 000035 (active gym; only these columns).
DROP FUNCTION IF EXISTS get_public_gym(TEXT);
CREATE OR REPLACE FUNCTION get_public_gym(p_slug TEXT)
RETURNS TABLE (
  id UUID, slug TEXT, name_ar TEXT, name_en TEXT, name_fr TEXT,
  logo_url TEXT, brand_color TEXT, hero_image_url TEXT,
  tagline_ar TEXT, tagline_en TEXT, tagline_fr TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.slug::TEXT, g.name_ar::TEXT, g.name_en::TEXT, g.name_fr::TEXT,
         g.logo_url, g.brand_color, g.hero_image_url,
         g.tagline_ar, g.tagline_en, g.tagline_fr
  FROM gyms g
  WHERE g.slug = p_slug AND g.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_public_gym(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_gym(TEXT) TO anon, authenticated;

-- 3. E2E-ONLY seed for the WL-LANDING branding guard: an isolated gym whose brand
--    color + name are set (or left NULL to prove the default). SECURITY DEFINER /
--    REVOKE PUBLIC / GRANT service_role ONLY (reset_ml1_e2e pattern). Test slugs only.
CREATE OR REPLACE FUNCTION seed_e2e_wl_gym(
  p_slug TEXT, p_brand_color TEXT, p_name TEXT, p_password TEXT DEFAULT 'E2eTestPass!23'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE v_gym UUID;
BEGIN
  v_gym := seed_e2e_gym(p_slug, p_password);
  UPDATE gyms SET
    brand_color = p_brand_color,
    name_ar = COALESCE(p_name, name_ar),
    name_en = COALESCE(p_name, name_en),
    name_fr = COALESCE(p_name, name_fr),
    tagline_en = COALESCE(tagline_en, p_name)   -- a visible per-gym tagline for the guard
  WHERE id = v_gym;
  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_wl_gym(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_e2e_wl_gym(TEXT, TEXT, TEXT, TEXT) TO service_role;
