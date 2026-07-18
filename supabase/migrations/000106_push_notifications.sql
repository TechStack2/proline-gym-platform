-- ============================================================
-- 000106: PUSH-1 — web push subscriptions + per-category prefs + drain guard
-- PRO LINE Gym Platform / PRAXELLA
--
-- Field finding 10 (owner-decreed): real web-push for ALL roles, "7/10
-- aggressiveness". This migration is ADDITIVE and adds NO new FUNCTIONS — the
-- sender is app-side (service-role reads), so the DEFINER-POSTURE allowlist is
-- UNAFFECTED (no anon-executable fn added). The DEFAULT-PRIV contract is still
-- honored at the TABLE level: on prod the cloud default-grants ALL on new public
-- tables to anon+authenticated, so we REVOKE anon explicitly (REVOKE PUBLIC is
-- insufficient — see [[prod-default-priv-trap]]).
-- ============================================================

-- -----------------------------------------------------------
-- 1) push_subscriptions — one row per browser push endpoint, owned by the auth
--    user. FK → auth.users so only a LOGGED-IN device can subscribe: login-less
--    gym-managed members (profiles.id with NO auth.users row — the
--    notifications-FK caveat) simply never have a subscription, so push no-ops
--    for them BY CONSTRUCTION (no special-casing needed).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner-of-row only. The device's own auth user reads/writes/deletes its rows.
DROP POLICY IF EXISTS push_subscriptions_self ON push_subscriptions;
CREATE POLICY push_subscriptions_self ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Table privileges (mirror platform_leads/000100): cloud default-grants ALL on new
-- public tables; the local stack does not — cover both. anon: NONE. authenticated:
-- self CRUD (RLS narrows to own rows). service_role (RLS-exempt): the SENDER reads
-- every gym's subscriptions + prunes 410-Gone endpoints.
REVOKE ALL ON push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT ALL ON push_subscriptions TO service_role;

-- -----------------------------------------------------------
-- 2) Per-category push preferences on the profile (default ON — the 7/10 decree).
--    The master on/off IS "has a subscription or not" (subscribe/unsubscribe);
--    these are the granular category toggles the sender checks before sending.
--    profiles_self (000004) already lets a user read/update their own row.
-- -----------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_operational   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_schedule      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_informational BOOLEAN NOT NULL DEFAULT true;

-- -----------------------------------------------------------
-- 3) Drain guard — the sender stamps this once a notification has been pushed, so
--    a notification is delivered EXACTLY ONCE regardless of which mirror (the app
--    createNotification hook, a per-RPC hook, or the cron drain) fires first. The
--    drain selects WHERE push_sent_at IS NULL over a short recent window. Additive
--    nullable column; every existing reader ignores it.
-- -----------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

-- Backfill: every pre-existing notification predates push — stamp it sent so the
-- drain never delivers a HISTORICAL backlog the day VAPID keys are configured.
UPDATE notifications SET push_sent_at = created_at WHERE push_sent_at IS NULL;

-- Partial index scoped to the (small) set of not-yet-pushed rows — the drain's hot path.
CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON notifications(created_at) WHERE push_sent_at IS NULL;
