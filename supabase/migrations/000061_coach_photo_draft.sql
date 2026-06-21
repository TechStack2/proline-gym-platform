-- ============================================================
-- 000061: COACH PHOTO GATE — stage the coach headshot through the admin gate
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / COACH-PHOTO-GATE)
--
-- Closes the one COACH-LP (000059) scope gap: bio/specialty already flow
-- coach-edit → draft → admin-publish, but the PHOTO still went live via the
-- ADM-2 uploader (no approval). This brings the photo under the same gate.
--
-- The hard part 000059 deferred: the live `avatars` bucket is PUBLIC, so any
-- path in it (even a `pending/` prefix) is anon-readable via the public CDN
-- endpoint. A draft photo therefore CANNOT live in `avatars`. The clean
-- isolation is a SEPARATE PRIVATE bucket whose RLS grants read/write to the
-- coach (own) + in-gym staff and NOTHING to anon — mirroring how 000059 used a
-- separate `coach_profile_pending` table (no anon policy) for the text drafts.
--
--   • new PRIVATE bucket `coach-avatar-drafts` (public = false) — its path
--     contract mirrors `avatars`:  <gym_id>/<profile_id>.<ext>
--   • Storage RLS (named `coach_avatar_drafts_*`): owner (filename stem =
--     auth.uid()) OR in-gym staff (folder = get_user_gym_id() AND is_staff());
--     NO public/anon policy at all → the draft is unreadable to the public, and
--     a private bucket's public endpoint refuses to serve it regardless.
--   • the EXISTING `avatars` policies (000039) are NOT touched / not weakened.
--   • the coach editor records the draft object PATH in the reserved
--     coach_profile_pending.avatar_url column; the Coach-360 panel shows the
--     before/after; on publish the app copies the bytes private→public `avatars`
--     and passes the resulting public URL to publish_coach_profile (below), the
--     only path that ever makes a coach photo live.
--
--   • publish_coach_profile gains a `p_live_avatar_url` arg (the promoted PUBLIC
--     url). It sets profiles.avatar_url to it — alongside the text promotion,
--     atomically, behind the EXISTING owner/head_coach gate — then clears the
--     draft. The old `pending.avatar_url → profiles` copy is removed (the column
--     now holds a PRIVATE path, never a public url). The 1-arg overload is
--     dropped so the defaulted 2-arg form is unambiguous.
-- Forward-only, idempotent. Never weakens existing RLS.
-- ============================================================

-- 1) Private drafts bucket -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('coach-avatar-drafts', 'coach-avatar-drafts', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Storage RLS — coach(own) + in-gym staff; NO anon. Path: <gym_id>/<profile_id>.<ext>
--    (mirrors the avatars 000039 predicate, scoped to the drafts bucket; the
--     SELECT policy is OWNER/STAFF-ONLY — there is deliberately no public read.)
DROP POLICY IF EXISTS coach_avatar_drafts_select ON storage.objects;
CREATE POLICY coach_avatar_drafts_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'coach-avatar-drafts' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

DROP POLICY IF EXISTS coach_avatar_drafts_insert ON storage.objects;
CREATE POLICY coach_avatar_drafts_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'coach-avatar-drafts' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

DROP POLICY IF EXISTS coach_avatar_drafts_update ON storage.objects;
CREATE POLICY coach_avatar_drafts_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'coach-avatar-drafts' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'coach-avatar-drafts' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

DROP POLICY IF EXISTS coach_avatar_drafts_delete ON storage.objects;
CREATE POLICY coach_avatar_drafts_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'coach-avatar-drafts' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

-- 3) publish_coach_profile — promote the draft photo (PUBLIC url, app-copied) to
--    live alongside the text, atomically + owner/head_coach-gated. Drop the 1-arg
--    overload first so the defaulted 2-arg signature is unambiguous.
DROP FUNCTION IF EXISTS publish_coach_profile(UUID);

CREATE OR REPLACE FUNCTION publish_coach_profile(p_coach_id UUID, p_live_avatar_url TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gym       UUID;
  v_profile   UUID;
  v_pending   coach_profile_pending%ROWTYPE;
BEGIN
  SELECT gym_id, profile_id INTO v_gym, v_profile FROM coaches WHERE id = p_coach_id;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'coach not found'; END IF;

  -- TEAM-1 guardrail: publish to the public landing is owner/head_coach only.
  IF get_user_gym_id() <> v_gym OR get_user_role() NOT IN ('owner', 'head_coach') THEN
    RAISE EXCEPTION 'forbidden: publish requires owner or head_coach';
  END IF;

  SELECT * INTO v_pending FROM coach_profile_pending WHERE coach_id = p_coach_id;
  IF FOUND THEN
    UPDATE coaches SET
      specialization_ar = COALESCE(v_pending.specialization_ar, specialization_ar),
      specialization_en = COALESCE(v_pending.specialization_en, specialization_en),
      specialization_fr = COALESCE(v_pending.specialization_fr, specialization_fr),
      bio_ar            = COALESCE(v_pending.bio_ar, bio_ar),
      bio_en            = COALESCE(v_pending.bio_en, bio_en),
      bio_fr            = COALESCE(v_pending.bio_fr, bio_fr),
      landing_visible   = true,
      has_pending_changes = false,
      last_published_at = now()
    WHERE id = p_coach_id;

    -- Photo: the live avatar is set ONLY from the explicitly-promoted PUBLIC url
    -- (the publishCoachProfile action copies the private draft → public `avatars`
    -- bucket and passes the url here). pending.avatar_url is a PRIVATE draft path,
    -- so it is NEVER copied to profiles — the byte copy + this gate are the only
    -- path a coach photo reaches the landing.
    IF p_live_avatar_url IS NOT NULL AND v_profile IS NOT NULL THEN
      UPDATE profiles SET avatar_url = p_live_avatar_url WHERE id = v_profile;
    END IF;

    DELETE FROM coach_profile_pending WHERE coach_id = p_coach_id;  -- clears text + photo draft refs
  ELSE
    -- nothing pending → publish simply makes the live profile visible
    UPDATE coaches SET landing_visible = true, last_published_at = now()
      WHERE id = p_coach_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION publish_coach_profile(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publish_coach_profile(UUID, TEXT) TO authenticated;
