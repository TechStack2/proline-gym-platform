-- ============================================================
-- 000101: LANDING-CUSTOM — tenant landing customization data
-- PRO LINE Gym Platform (Praxella)
--
-- WHY. Two remaining gaps in the per-gym landing's DATA model:
--   (1) OFFICE HOURS render from hardcoded i18n strings in the footer — every
--       tenant shows the same block. Make them per-gym DATA. Unlike the flat
--       contact columns (000078), hours are inherently STRUCTURED (7 days ×
--       open/close, or closed), so a single JSONB column is the right shape —
--       and it is still returned EXPLICITLY by get_public_gym, so the anon
--       exposure contract stays auditable (one known key, hours only; NULL =
--       don't render → the existing hardcoded footer block remains the fallback,
--       keeping unset gyms byte-identical).
--   (2) TikTok + YouTube have no home. Two nullable TEXT columns mirror the
--       000078 instagram_handle/facebook_handle pattern (trivial; folded here per
--       the slice's "only if trivial in the same migration" allowance).
--
-- REWRITE BASE: get_public_gym's CURRENT definer is 000078 (chain 000035 →
-- 000072 → 000078). Return-type change → DROP + recreate (the 000072/000078
-- pattern); body extended ONLY by the three new columns. The signature
-- get_public_gym(TEXT) is UNCHANGED, so its definer-posture allowlist entry
-- (000096 anon_leaf / assert-definer-posture.sql) still matches and the anon
-- grant is re-issued verbatim → posture stays green.
--
-- ADDITIVE + idempotent; replays clean from zero. No RLS/policy change.
-- ============================================================

-- 1. New landing columns (all NULLABLE — NULL = section absent / template fallback).
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS office_hours   JSONB,   -- per-day {open,close} or {closed:true}; NULL = don't render (footer keeps its i18n fallback)
  ADD COLUMN IF NOT EXISTS tiktok_handle  TEXT,    -- no leading @; footer social link
  ADD COLUMN IF NOT EXISTS youtube_handle TEXT;    -- channel handle/path; footer social link

-- 2. Extend get_public_gym (return-type change → DROP + recreate, 000078 pattern).
DROP FUNCTION IF EXISTS get_public_gym(TEXT);
CREATE OR REPLACE FUNCTION get_public_gym(p_slug TEXT)
RETURNS TABLE (
  id UUID, slug TEXT, name_ar TEXT, name_en TEXT, name_fr TEXT,
  logo_url TEXT, brand_color TEXT, hero_image_url TEXT,
  tagline_ar TEXT, tagline_en TEXT, tagline_fr TEXT,
  address_ar TEXT, address_en TEXT, address_fr TEXT,
  contact_whatsapp TEXT, contact_phone TEXT, contact_email TEXT,
  instagram_handle TEXT, instagram_followers INTEGER, facebook_handle TEXT,
  map_lat NUMERIC, map_lng NUMERIC,
  office_hours JSONB, tiktok_handle TEXT, youtube_handle TEXT
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
         g.map_lat, g.map_lng,
         g.office_hours, g.tiktok_handle, g.youtube_handle
  FROM gyms g
  WHERE g.slug = p_slug AND g.is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_public_gym(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_gym(TEXT) TO anon, authenticated;

-- ============================================================
-- R1(b) NOTE — the submit_platform_lead anon-leaf allowlist amendment is applied
-- IN PLACE in 000096's anon_leaf array (the canonical sweep allowlist), NOT here:
-- the 000096 DO-block is the code that a future re-sweep would run, so that is the
-- list that must name submit_platform_lead. Editing it is inert on the from-zero
-- replay (submit_platform_lead is not yet in pg_proc when 000096 applies — it is
-- created later, in 000100) and inert on prod (000096 is already applied and is
-- not re-run), so it changes NO posture today; it only makes the canonical
-- allowlist correct if the sweep is ever re-invoked. The LIVE guard
-- (assert-definer-posture.sql) already lists all 24 anon names incl.
-- submit_platform_lead (added by 000100), so the posture assert stays green.
-- ============================================================
