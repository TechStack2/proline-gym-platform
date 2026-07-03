-- ============================================================
-- 000079: LANDING-CONTENT — per-gym champions / gallery / affiliations images
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / Phase 3 / LANDING-CONTENT)
--
-- The landing's Champions, Gallery and Affiliations sections render Proline's
-- hardcoded /landing/* photos for EVERY gym. Make those three sections a per-gym
-- DATA source (mirrors WL-LANDING branding + the COACH-LP showcase), so a
-- white-label gym shows its OWN images, while Proline (and any gym with no rows)
-- renders the built-in set EXACTLY as today — demo parity without seeding.
--
-- Additive + replay-clean. NO CMS/page-builder, NO upload UI (a later Settings
-- slice) and NO testimonials. This migration ships the model only:
--   1. gym_landing_images — one row per image, section-tagged, i18n captions.
--   2. RLS: PUBLIC read of active rows of an active gym (catalog pattern, 000035);
--      writes owner/head_coach-only (is_gym_admin(), 000077).
--   3. get_landing_images(gym, section) — the anon read path (SECURITY DEFINER
--      projection, the get_landing_coaches 000059 pattern) the sections call.
--   4. A public `gym-landing` Storage bucket (the avatars 000039 pattern) for
--      uploads later; image_url may equally point at an existing /landing/* path.
-- ============================================================

-- 1) The table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gym_landing_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                 -- 'champions' | 'gallery' | 'affiliations'
  image_url   TEXT NOT NULL,                 -- a /landing/* path OR a gym-landing storage URL
  caption_ar  TEXT,
  caption_en  TEXT,
  caption_fr  TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE gym_landing_images ADD CONSTRAINT gym_landing_images_section_chk
    CHECK (section IN ('champions', 'gallery', 'affiliations'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS gym_landing_images_gym_section_idx
  ON gym_landing_images (gym_id, section, sort_order);

ALTER TABLE gym_landing_images ENABLE ROW LEVEL SECURITY;

-- API-role grants (RLS still applies). Cloud auto-grants these out-of-band, but a
-- from-zero local/CI stack (db reset) needs them explicit — else 42501 on read.
GRANT SELECT ON gym_landing_images TO anon, authenticated;
GRANT ALL    ON gym_landing_images TO service_role;

-- 2) RLS -------------------------------------------------------------------------
-- PUBLIC read of ACTIVE rows of an ACTIVE gym (branding/imagery is public by
-- nature — shown to logged-out visitors — exactly like the 000035 catalog).
DROP POLICY IF EXISTS landing_images_public_read ON gym_landing_images;
CREATE POLICY landing_images_public_read ON gym_landing_images FOR SELECT
  USING (is_active AND is_active_gym(gym_id));

-- Writes (and reading own drafts/inactive) — owner/head_coach only, own gym.
-- FOR ALL so the future Settings editor can list/insert/update/delete its rows;
-- the public SELECT above is OR'd in for anon, so nothing here narrows reads.
DROP POLICY IF EXISTS landing_images_admin_write ON gym_landing_images;
CREATE POLICY landing_images_admin_write ON gym_landing_images FOR ALL
  USING (gym_id = get_user_gym_id() AND is_gym_admin())
  WITH CHECK (gym_id = get_user_gym_id() AND is_gym_admin());

-- 3) Anon read path — SECURITY DEFINER projection (get_landing_coaches pattern).
--    Returns only the display columns of ACTIVE rows of an ACTIVE gym, ordered.
CREATE OR REPLACE FUNCTION get_landing_images(p_gym_id UUID, p_section TEXT)
RETURNS TABLE (
  id         UUID,
  image_url  TEXT,
  caption_ar TEXT,
  caption_en TEXT,
  caption_fr TEXT,
  sort_order INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.image_url, i.caption_ar, i.caption_en, i.caption_fr, i.sort_order
  FROM gym_landing_images i
  WHERE i.gym_id = p_gym_id
    AND i.section = p_section
    AND i.is_active
    AND is_active_gym(i.gym_id)
  ORDER BY i.sort_order, i.id;
$$;
REVOKE ALL ON FUNCTION get_landing_images(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_images(UUID, TEXT) TO anon, authenticated;

-- 4) Storage: a public `gym-landing` bucket for future uploads (avatars 000039
--    pattern). Path contract:  <gym_id>/<filename>. Public read; writes are
--    owner/head_coach of THAT gym only (folder must equal the caller's gym).
INSERT INTO storage.buckets (id, name, public)
VALUES ('gym-landing', 'gym-landing', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS gym_landing_public_read ON storage.objects;
CREATE POLICY gym_landing_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-landing');

DROP POLICY IF EXISTS gym_landing_admin_insert ON storage.objects;
CREATE POLICY gym_landing_admin_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-landing'
    AND is_gym_admin()
    AND (storage.foldername(name))[1] = get_user_gym_id()::text
  );

DROP POLICY IF EXISTS gym_landing_admin_update ON storage.objects;
CREATE POLICY gym_landing_admin_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-landing'
    AND is_gym_admin()
    AND (storage.foldername(name))[1] = get_user_gym_id()::text
  )
  WITH CHECK (
    bucket_id = 'gym-landing'
    AND is_gym_admin()
    AND (storage.foldername(name))[1] = get_user_gym_id()::text
  );

DROP POLICY IF EXISTS gym_landing_admin_delete ON storage.objects;
CREATE POLICY gym_landing_admin_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-landing'
    AND is_gym_admin()
    AND (storage.foldername(name))[1] = get_user_gym_id()::text
  );
