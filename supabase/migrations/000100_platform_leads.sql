-- ============================================================
-- 000100: PLATFORM LEADS (PRAXELLA-DOOR / R3)
-- Praxella (the vendor) marketing landing → demo requests.
--
-- A vendor-scoped lead table (NOT gym-scoped): anon prospects submit a
-- "request a demo" from praxella.com via the SECURITY DEFINER RPC
-- submit_platform_lead (mirrors submit_public_lead's anon-insert-via-definer
-- shape), and platform admins triage them in the (vendor) console. RLS is
-- is_platform_admin()-only for reads; writes go ONLY through the definer RPC
-- (anon insert) and the vendor console's service-role server actions (status).
--
-- Posture: submit_platform_lead is a genuinely-public anon leaf → it is added
-- to the reviewed anon allowlist in supabase/ci/assert-definer-posture.sql in
-- THIS slice (23 → 24). The DEFINER-POSTURE CI guard stays green because it now
-- EXPECTS submit_platform_lead, not because any check was weakened.
-- ============================================================

-- -----------------------------------------------------------
-- 1. platform_leads — vendor-owned prospect table
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  business_name VARCHAR(160),
  activity_type VARCHAR(40),          -- gym | martial_arts | gymnastics | dance | other
  phone         VARCHAR(40) NOT NULL,
  email         VARCHAR(200),
  city          VARCHAR(120),
  message       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  source        VARCHAR(50) NOT NULL DEFAULT 'praxella_landing',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_leads_status_time ON platform_leads(status, created_at DESC);

ALTER TABLE platform_leads ENABLE ROW LEVEL SECURITY;

-- Table privileges (mirror platform_admins, 000082): cloud default-grants ALL on
-- new public tables; the local stack does not — cover both. anon: NO table grant
-- (it inserts only via the definer RPC). authenticated: SELECT only (RLS then
-- narrows to platform admins). NO INSERT/UPDATE/DELETE to anon/authenticated →
-- no self-serve path. service_role (RLS-exempt) does the console status writes.
REVOKE ALL ON platform_leads FROM anon, authenticated;
GRANT SELECT ON platform_leads TO authenticated;
GRANT ALL ON platform_leads TO service_role;

-- Reads: ONLY platform admins. There is deliberately NO write policy — RLS is on
-- and no permissive INSERT/UPDATE/DELETE policy exists, so only service_role (the
-- vendor console actions) and the definer RPC (anon insert) can write.
DROP POLICY IF EXISTS platform_leads_admin_read ON platform_leads;
CREATE POLICY platform_leads_admin_read ON platform_leads FOR SELECT
  USING (is_platform_admin());

-- -----------------------------------------------------------
-- 2. submit_platform_lead — anon demo-request capture (DEFINER)
--    Mirrors submit_public_lead (000023): anon-callable, runs as owner so it can
--    INSERT past RLS, validates + length-caps + whitelists, honeypot + a light
--    same-phone throttle. Returns the lead id (or an existing id on throttle) so
--    the caller never learns whether a row was created.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_platform_lead(
  p_name          TEXT,
  p_phone         TEXT,
  p_business_name TEXT DEFAULT NULL,
  p_activity_type TEXT DEFAULT NULL,
  p_email         TEXT DEFAULT NULL,
  p_city          TEXT DEFAULT NULL,
  p_message       TEXT DEFAULT NULL,
  p_source        TEXT DEFAULT 'praxella_landing',
  p_honeypot      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_name     TEXT := btrim(coalesce(p_name, ''));
  v_phone    TEXT := btrim(coalesce(p_phone, ''));
  v_activity TEXT := nullif(btrim(coalesce(p_activity_type, '')), '');
BEGIN
  -- Honeypot: a bot filled the hidden field → accept silently, insert nothing.
  IF p_honeypot IS NOT NULL AND btrim(p_honeypot) <> '' THEN
    RETURN gen_random_uuid();
  END IF;

  -- Required fields.
  IF v_name = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF v_phone = '' THEN RAISE EXCEPTION 'Phone is required'; END IF;

  -- Length caps (defence in depth; the columns also bound VARCHAR lengths).
  IF length(v_name) > 120
     OR length(v_phone) > 40
     OR length(coalesce(p_business_name, '')) > 160
     OR length(coalesce(p_email, '')) > 200
     OR length(coalesce(p_city, '')) > 120
     OR length(coalesce(p_message, '')) > 2000 THEN
    RAISE EXCEPTION 'One or more fields are too long';
  END IF;

  -- Activity-type whitelist (NULL/'' allowed — it is optional).
  IF v_activity IS NOT NULL
     AND v_activity NOT IN ('gym', 'martial_arts', 'gymnastics', 'dance', 'other') THEN
    RAISE EXCEPTION 'Invalid activity type';
  END IF;

  -- Light throttle: the same phone submitting inside 30s returns the existing
  -- lead id instead of stacking duplicates (mirrors the join-door 'duplicate' path).
  SELECT id INTO v_id
  FROM platform_leads
  WHERE phone = v_phone AND created_at > now() - interval '30 seconds'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO platform_leads (name, business_name, activity_type, phone, email, city, message, source, status)
  VALUES (
    v_name,
    nullif(btrim(coalesce(p_business_name, '')), ''),
    v_activity,
    v_phone,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'praxella_landing'),
    'new'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- DEFINER posture: strip PUBLIC + the three data-plane roles, then grant exactly
-- anon + authenticated (a genuinely-public leaf, on the reviewed allowlist).
REVOKE ALL ON FUNCTION submit_platform_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_platform_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_platform_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
