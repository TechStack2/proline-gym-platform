-- ============================================================
-- 000032: notifications.user_id FK → profiles (V1 slice #1 — carried debt)
-- PRO LINE Gym Platform
--
-- Problem: notifications.user_id FKs auth.users (000003:487). Since 000018 made
-- `profiles` the UNIVERSAL identity (login-less gym-managed members get
-- profiles.id = gen_random_uuid() with NO auth.users row), every producer INSERT
-- addressed to a login-less member fails the FK (23503) and is swallowed by the
-- best-effort helpers — so 23-R's lead_converted and D1's invoice_issued /
-- payment_received to a converted member are SILENTLY DROPPED. That blocks all
-- member-facing comms (and is the prerequisite for G1 WhatsApp delivery, which
-- reads these persisted rows server-side).
--
-- Fix (decided): re-point the FK to profiles(id) — the post-000018 identity that
-- the producers already insert (recipient `profile_id`). Login users are
-- unaffected (profiles.id = auth.users.id for them). RLS is unchanged
-- (select_self/update_self/insert_staff_same_gym are correct; recipient_in_gym
-- already validates against profiles). No producer/consumer code changes — the
-- FK was the only blocker. user_id stays NOT NULL; no backfill of dropped rows.
--
-- Migration safety: any pre-existing notification whose user_id has no profiles
-- row is an orphan (unreadable anyway — RLS select_self needs user_id = a real
-- identity) and would break the new constraint. Delete them first and report the
-- count via NOTICE (visible in the apply log). ON DELETE CASCADE is preserved:
-- deleting a profile now clears its notifications (the gym-CASCADE teardown still
-- reaches them via profiles, alongside notifications.gym_id's own CASCADE).
-- ============================================================

-- 1) Drop the old FK (→ auth.users).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

-- 2) Safety: remove orphans (user_id with no profiles row) and report how many.
DO $$
DECLARE v_orphans BIGINT;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM notifications n
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = n.user_id);

  RAISE NOTICE '000032 FK swap: % orphan notification(s) (user_id with no profiles row) will be deleted', v_orphans;

  DELETE FROM notifications n
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = n.user_id);
END $$;

-- 3) Add the new FK (→ profiles), keeping ON DELETE CASCADE.
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
