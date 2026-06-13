-- ============================================================
-- 000055: G1 — per-gym WhatsApp config + outbound queue (V1 / G1)
-- PRO LINE Gym Platform
--
-- The channel abstraction's DB side: per-gym Cloud-API credentials + the
-- outbound message queue. The wa.me BRIDGE (the day-1 path) needs NO backend
-- and NO row here — these tables are only the G1-full (auto-dispatch) layer,
-- inert until a gym flips its status to 'active'.
--
-- TOKEN SECURITY (the load-bearing rule): the access_token is NEVER readable by
-- the client. It is AES-GCM ciphertext (app-encrypted, src/lib/whatsapp/crypto)
-- AND `gym_whatsapp_config` is fully REVOKED from anon/authenticated — the
-- browser never touches the table. The client reads STATUS ONLY via the
-- SECURITY DEFINER `get_whatsapp_status` reader (no token, ever); writes go
-- through the service-role admin client in the save server action; dispatch
-- reads creds via the service-role client. So the plaintext token exists only
-- transiently in server memory, and even the ciphertext never leaves the server.
-- ============================================================

-- -----------------------------------------------------------
-- 1. gym_whatsapp_config — one row per gym (PK = gym_id)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS gym_whatsapp_config (
  gym_id               UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'not_configured'
                       CHECK (status IN ('not_configured', 'pending', 'active')),
  phone_number_id      TEXT,
  waba_id              TEXT,
  access_token         TEXT,  -- AES-GCM ciphertext; never selectable by the client
  default_country_code TEXT NOT NULL DEFAULT '961',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_config_staff_gym ON gym_whatsapp_config;
CREATE POLICY whatsapp_config_staff_gym ON gym_whatsapp_config FOR ALL
  USING (is_staff() AND gym_id = get_user_gym_id())
  WITH CHECK (is_staff() AND gym_id = get_user_gym_id());

-- The client NEVER touches this table directly — revoke all so the token can't
-- be reached even by a crafted select. Service-role (dispatch/save) + the
-- SECURITY DEFINER reader are the only access paths.
REVOKE ALL ON gym_whatsapp_config FROM authenticated, anon;

-- Status reader (NO token): status + whether a token is configured + the
-- non-secret fields. Staff-gated, gym-scoped.
DROP FUNCTION IF EXISTS get_whatsapp_status(UUID);
CREATE OR REPLACE FUNCTION get_whatsapp_status(p_gym_id UUID)
RETURNS TABLE (status TEXT, configured BOOLEAN, phone_number_id TEXT, default_country_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_staff() AND p_gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT c.status, (c.access_token IS NOT NULL), c.phone_number_id, c.default_country_code
    FROM gym_whatsapp_config c WHERE c.gym_id = p_gym_id;
  -- No row yet ⇒ not_configured.
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_configured'::TEXT, false, NULL::TEXT, '961'::TEXT;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION get_whatsapp_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_whatsapp_status(UUID) TO authenticated;

-- -----------------------------------------------------------
-- 2. outbound_messages — the G1-full send queue (gym-scoped)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbound_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  to_phone   TEXT NOT NULL,
  body       TEXT NOT NULL,
  template   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_gym ON outbound_messages (gym_id, created_at DESC);

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
-- Staff of the gym can READ the queue (visibility); writes are service-role only
-- (the server-side dispatch) — no client INSERT/UPDATE policy.
DROP POLICY IF EXISTS outbound_staff_gym_read ON outbound_messages;
CREATE POLICY outbound_staff_gym_read ON outbound_messages FOR SELECT
  USING (is_staff() AND gym_id = get_user_gym_id());
