-- ============================================================
-- 000091: AVATAR-VERSION — thread a cache-buster to the landing coach card
--
-- AVATAR-PATHS stores the bare relative object path; a coach-photo RE-publish
-- overwrites the SAME storage path, so the landing coach card's rendered URL was
-- byte-identical after re-publish → the CDN/browser served the STALE old photo
-- (storage cache-control ~1h). The anon showcase (CoachesSection ← this RPC) had
-- no version signal to bust it.
--
-- Fix: return profiles.updated_at — bumped by trg_update_timestamp (000005) on the
-- publish_coach_profile avatar UPDATE (000061) — so CoachesSection can append it as
-- a read-time `?v=` via storagePublicUrl (the "never store v in the DB" contract is
-- kept: v is derived at read time only). Byte-exact from the CURRENT body (000059):
-- one RETURNS column + one SELECT column added; nothing else changes.
-- ============================================================

CREATE OR REPLACE FUNCTION get_landing_coaches(p_gym_id UUID)
RETURNS TABLE (
  id                UUID,
  first_name_ar     TEXT,
  first_name_en     TEXT,
  first_name_fr     TEXT,
  last_name_ar      TEXT,
  last_name_en      TEXT,
  last_name_fr      TEXT,
  avatar_url        TEXT,
  specialization_ar TEXT,
  specialization_en TEXT,
  specialization_fr TEXT,
  bio_ar            TEXT,
  bio_en            TEXT,
  bio_fr            TEXT,
  landing_status    TEXT,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    p.first_name_ar, p.first_name_en, p.first_name_fr,
    p.last_name_ar,  p.last_name_en,  p.last_name_fr,
    p.avatar_url,
    c.specialization_ar, c.specialization_en, c.specialization_fr,
    c.bio_ar, c.bio_en, c.bio_fr,
    c.landing_status,
    p.updated_at
  FROM coaches c
  JOIN profiles p ON p.id = c.profile_id
  WHERE c.gym_id = p_gym_id
    AND c.is_active
    AND c.landing_visible
    AND is_active_gym(c.gym_id)
  -- current coaches first, "coming soon" last; then alphabetical
  ORDER BY (c.landing_status = 'coming_soon'), p.first_name_en;
$$;
REVOKE ALL ON FUNCTION get_landing_coaches(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_coaches(UUID) TO anon, authenticated;
