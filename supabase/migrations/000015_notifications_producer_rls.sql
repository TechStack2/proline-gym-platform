-- ============================================================
-- 000015: NOTIFICATION PRODUCER LAYER — columns, RLS, realtime
-- Proline Gym — Cycle 5 / Prompt 21 (notification substrate / gap M0)
--
-- Context: the notifications table was "write-never" — 6 consumer sites,
-- 0 producers, and a single self-only FOR ALL policy that made it
-- impossible for staff to create a notification addressed to a student.
--
-- This migration:
--   1. Adds producer columns (gym scope, type, i18n keys + params, entity ref).
--      i18n KEYS are stored (not rendered strings); the client renders them
--      via the next-intl `notifications` namespace.
--   2. Replaces the self-only FOR ALL policy with explicit policies:
--        - SELECT/UPDATE: a user may only touch their OWN notifications.
--        - INSERT: an authenticated STAFF user may create a notification
--          addressed to another profile WITHIN THE SAME GYM. No cross-gym
--          insert; no cross-gym read.
--   3. Adds notifications to the supabase_realtime publication so the bell
--      updates live on INSERT (state visibility = Managed).
-- ============================================================

-- -----------------------------------------------------------
-- 1. Producer columns
-- -----------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS gym_id      UUID REFERENCES gyms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type        TEXT,
  ADD COLUMN IF NOT EXISTS title_key   TEXT,
  ADD COLUMN IF NOT EXISTS body_key    TEXT,
  ADD COLUMN IF NOT EXISTS params      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id   UUID;

-- gym_id is used by the INSERT RLS check and by gym-scoped queries — index it.
CREATE INDEX IF NOT EXISTS idx_notifications_gym ON notifications(gym_id);

-- -----------------------------------------------------------
-- 2. RLS — replace self-only FOR ALL with explicit policies
-- -----------------------------------------------------------

-- Helper: is the recipient profile a member of the given gym?
-- SECURITY DEFINER so the INSERT check is deterministic and not subject to the
-- caller's own RLS visibility over profiles.
CREATE OR REPLACE FUNCTION recipient_in_gym(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND gym_id = p_gym_id
  );
$$;

DROP POLICY IF EXISTS notifications_self ON notifications;

-- Read: only your own notifications (no cross-gym read).
DROP POLICY IF EXISTS notifications_select_self ON notifications;
CREATE POLICY notifications_select_self ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Update (mark-as-read): only your own.
DROP POLICY IF EXISTS notifications_update_self ON notifications;
CREATE POLICY notifications_update_self ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert: staff may produce a notification addressed to a profile in their
-- OWN gym only. gym_id must equal the caller's gym, and the recipient must
-- belong to that same gym. No cross-gym insert.
DROP POLICY IF EXISTS notifications_insert_staff_same_gym ON notifications;
CREATE POLICY notifications_insert_staff_same_gym ON notifications FOR INSERT
  WITH CHECK (
    is_staff()
    AND gym_id = get_user_gym_id()
    AND recipient_in_gym(user_id, gym_id)
  );

-- -----------------------------------------------------------
-- 3. Realtime — publish INSERTs so the bell updates without a refresh
-- -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- supabase_realtime publication not present (e.g. bare Postgres); skip.
    NULL;
END $$;
