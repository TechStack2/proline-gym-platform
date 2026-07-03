-- ============================================================
-- 000078: PROLINE-LANDING-DATA — public contact/social identity as DATA
-- PRO LINE Gym Platform (Phase 3)
--
-- WHY. The landing's contact identity (wa.me, phone, email, Instagram,
-- Facebook, map coordinates, follower count) is hardcoded to Proline in the
-- components — the WL "fallback" IS Proline's identity baked in code. This
-- makes it per-gym DATA, following the 000072 branding pattern exactly.
--
-- COLUMN MODEL: discrete nullable columns (NOT a public_contact JSONB), because
--   1. it matches 000072's precedent (flat nullable brand columns + an explicit
--      typed RPC contract) and the SETTINGS-LIVE editor's flat-field writes;
--   2. get_public_gym returns a typed TABLE — discrete columns keep the anon
--      exposure contract EXPLICIT and auditable (a JSONB blob invites
--      accidentally leaking a later internal key through the same hole);
--   3. lat/lng are numeric with their own validation shape.
--
-- EXPOSURE. All new columns are public-by-nature (they render on the anon
-- landing). gyms.email / gyms.phone (internal ops contacts) and tax fields stay
-- UNEXPOSED — contact_email/contact_phone are deliberately separate columns.
--
-- REWRITE BASE: get_public_gym's CURRENT definer is 000072 (000035 was the
-- original; 000073 references without redefining). Return-type change → DROP +
-- recreate (the 000072 pattern), body extended ONLY by the new columns +
-- gyms.address_* (which already existed but was never exposed; needed for the
-- footer/facility address line).
--
-- DEMO PARITY: the proline-gym DEMO row is populated with the exact values the
-- code hardcodes today (idempotent, only-if-NULL) — so the demo renders
-- byte-identically FROM DATA, and the code fallbacks remain only as template
-- safety nets. ADDITIVE + idempotent; replay-clean from zero.
-- ============================================================

-- 1. Public contact/social columns (all NULLABLE — NULL = template fallback).
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS contact_whatsapp    TEXT,           -- wa.me target, digits or +961…
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT,           -- public tel: display
  ADD COLUMN IF NOT EXISTS contact_email       TEXT,           -- public mailto (NOT gyms.email)
  ADD COLUMN IF NOT EXISTS instagram_handle    TEXT,           -- no leading @
  ADD COLUMN IF NOT EXISTS instagram_followers INTEGER,        -- hero social proof; NULL = segment dropped
  ADD COLUMN IF NOT EXISTS facebook_handle     TEXT,           -- footer social link
  ADD COLUMN IF NOT EXISTS map_lat             NUMERIC(9,6),   -- facility map marker
  ADD COLUMN IF NOT EXISTS map_lng             NUMERIC(9,6);

-- 2. Extend get_public_gym (return-type change → DROP + recreate, 000072 pattern).
DROP FUNCTION IF EXISTS get_public_gym(TEXT);
CREATE OR REPLACE FUNCTION get_public_gym(p_slug TEXT)
RETURNS TABLE (
  id UUID, slug TEXT, name_ar TEXT, name_en TEXT, name_fr TEXT,
  logo_url TEXT, brand_color TEXT, hero_image_url TEXT,
  tagline_ar TEXT, tagline_en TEXT, tagline_fr TEXT,
  address_ar TEXT, address_en TEXT, address_fr TEXT,
  contact_whatsapp TEXT, contact_phone TEXT, contact_email TEXT,
  instagram_handle TEXT, instagram_followers INTEGER, facebook_handle TEXT,
  map_lat NUMERIC, map_lng NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.slug::TEXT, g.name_ar::TEXT, g.name_en::TEXT, g.name_fr::TEXT,
         g.logo_url, g.brand_color, g.hero_image_url,
         g.tagline_ar, g.tagline_en, g.tagline_fr,
         g.address_ar::TEXT, g.address_en::TEXT, g.address_fr::TEXT,
         g.contact_whatsapp, g.contact_phone, g.contact_email,
         g.instagram_handle, g.instagram_followers, g.facebook_handle,
         g.map_lat, g.map_lng
  FROM gyms g
  WHERE g.slug = p_slug AND g.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_public_gym(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_gym(TEXT) TO anon, authenticated;

-- 3. DEMO PARITY: move today's hardcoded Proline values into the DEMO gym's row
--    (only where still NULL — idempotent; a later manual edit wins).
UPDATE gyms SET
  contact_whatsapp    = COALESCE(contact_whatsapp,    '96170628601'),
  contact_phone       = COALESCE(contact_phone,       '+961 70 628 601'),
  contact_email       = COALESCE(contact_email,       'alifakih998@gmail.com'),
  instagram_handle    = COALESCE(instagram_handle,    'prolinegym.lb'),
  instagram_followers = COALESCE(instagram_followers, 2760),
  facebook_handle     = COALESCE(facebook_handle,     'prolinegym.lb'),
  map_lat             = COALESCE(map_lat,             33.8340),
  map_lng             = COALESCE(map_lng,             35.5440)
WHERE slug = 'proline-gym';
