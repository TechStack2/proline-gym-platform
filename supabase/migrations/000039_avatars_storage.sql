-- ============================================================
-- 000039: AVATARS — first Storage infrastructure (V1 / ADM-2, tightly scoped)
-- PRO LINE Gym Platform
--
-- One public-READ bucket `avatars`; writes are Storage-RLS-gated to the profile
-- OWNER or STAFF OF THAT GYM; the object path is the contract:
--
--     <gym_id>/<profile_id>.<ext>
--
-- database-reviewer design notes:
--  * READ: the bucket is public (avatar URLs render in <img> without tokens) +
--    an explicit SELECT policy for API/list reads. Avatars are display photos —
--    no PII beyond the face the gym already displays on physical boards.
--  * WRITE (INSERT/UPDATE/DELETE): the path encodes the authorization:
--      - owner:  the FILENAME stem must equal auth.uid()
--                (a user can only ever write <their-gym>/<their-own-id>.*)
--      - staff:  is_staff() AND the FOLDER must equal get_user_gym_id()
--                (staff write any profile photo within their own gym, never
--                 another gym's folder)
--    No other bucket is created; nothing existing is touched.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public; this also covers authenticated API list/read).
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Owner-or-staff write, path-scoped. (storage.foldername(name))[1] = gym folder;
-- the filename stem before the extension must be the profile id.
DROP POLICY IF EXISTS avatars_owner_staff_insert ON storage.objects;
CREATE POLICY avatars_owner_staff_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

DROP POLICY IF EXISTS avatars_owner_staff_update ON storage.objects;
CREATE POLICY avatars_owner_staff_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'avatars' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );

DROP POLICY IF EXISTS avatars_owner_staff_delete ON storage.objects;
CREATE POLICY avatars_owner_staff_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND (
      split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text
      OR (is_staff() AND (storage.foldername(name))[1] = get_user_gym_id()::text)
    )
  );
