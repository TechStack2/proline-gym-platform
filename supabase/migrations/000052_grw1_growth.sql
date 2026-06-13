-- ============================================================
-- 000052: GRW-1 — campaigns + anon trial-inquiry capture (V1 / GRW-1)
-- PRO LINE Gym Platform
--
-- REAL-COLUMNS AUDIT (leads, done BEFORE this file):
--   leads ALREADY carries source VARCHAR (CHECK: instagram/facebook/whatsapp/
--   walk_in/phone/referral/website/other), source_detail, interested_
--   discipline_id, status lead_status_enum (new/contacted/trial_scheduled/
--   trial_completed/converted/lost), converted_student_id/_at. UX-2 reused the
--   existing source chips — nothing added there. MISSING for attribution:
--   `campaign_id`. ADDED here (FK → campaigns, the only leads change).
--
-- ANON WRITE PATH: submit_trial_inquiry is the ONLY new anon-executable
-- surface. SECURITY DEFINER + REVOKE FROM PUBLIC + GRANT anon (the landing is
-- logged-out). Guards live INSIDE: honeypot-empty, length/phone shape, active
-- gym by slug, per-phone-per-gym 24h dedup (update the fresh lead, never
-- duplicate), campaign-code → attribution. The lead_new staff notification is
-- emitted IN the RPC (anon can't run the F2 producer — sanctioned ML-1/X1
-- definer exception). Returns only a status string — no row data to anon.
-- campaigns has NO anon policy: the code is resolved inside the definer RPC.
-- ============================================================

-- -----------------------------------------------------------
-- 1. campaigns (gym-scoped; staff-own-gym RLS; NO anon read)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,  -- short URL-safe slug, arrives via ?c=
  source     TEXT NOT NULL DEFAULT 'instagram'
             CHECK (source IN ('instagram','facebook','whatsapp','walk_in','phone','referral','website','other')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gym_id, code)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_gym ON campaigns (gym_id) WHERE is_active;

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaigns_staff_gym ON campaigns;
CREATE POLICY campaigns_staff_gym ON campaigns FOR ALL
  USING (is_staff() AND gym_id = get_user_gym_id())
  WITH CHECK (is_staff() AND gym_id = get_user_gym_id());

-- -----------------------------------------------------------
-- 2. leads.campaign_id (the only leads addition)
-- -----------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads (campaign_id) WHERE campaign_id IS NOT NULL;

-- -----------------------------------------------------------
-- 3. submit_trial_inquiry — the guarded anon capture RPC
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS submit_trial_inquiry(TEXT, TEXT, TEXT, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION submit_trial_inquiry(
  p_gym_slug      TEXT,
  p_name          TEXT,
  p_phone         TEXT,
  p_discipline_id UUID DEFAULT NULL,
  p_campaign_code TEXT DEFAULT NULL,
  p_honeypot      TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id    UUID;
  v_campaign  campaigns;
  v_source    TEXT := 'website';
  v_camp_id   UUID := NULL;
  v_phone     TEXT;
  v_digits    TEXT;
  v_existing  UUID;
  v_lead_id   UUID;
  v_disc      UUID := NULL;
BEGIN
  -- Honeypot: a bot filled the hidden field. Pretend success, write nothing.
  IF COALESCE(btrim(p_honeypot), '') <> '' THEN
    RETURN 'ok';
  END IF;

  -- Basic validation (no data leak — generic 'invalid' on any failure).
  v_phone  := btrim(COALESCE(p_phone, ''));
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100
     OR char_length(v_digits) NOT BETWEEN 6 AND 20 THEN
    RETURN 'invalid';
  END IF;

  -- Active gym by slug (the landing always passes its gym slug).
  SELECT id INTO v_gym_id FROM gyms WHERE slug = p_gym_slug AND is_active = true;
  IF v_gym_id IS NULL THEN
    RETURN 'invalid';
  END IF;

  -- Campaign code → attribution (gym-scoped, active). Unknown code ⇒ 'website'.
  IF COALESCE(btrim(p_campaign_code), '') <> '' THEN
    SELECT * INTO v_campaign FROM campaigns
    WHERE gym_id = v_gym_id AND code = btrim(p_campaign_code) AND is_active = true;
    IF v_campaign.id IS NOT NULL THEN
      v_camp_id := v_campaign.id;
      v_source  := v_campaign.source;
    END IF;
  END IF;

  -- Discipline interest must belong to this gym (else dropped, not trusted).
  IF p_discipline_id IS NOT NULL THEN
    SELECT id INTO v_disc FROM disciplines WHERE id = p_discipline_id AND gym_id = v_gym_id;
  END IF;

  -- Per-phone-per-gym 24h dedup: refresh the existing fresh lead, don't dupe.
  SELECT id INTO v_existing FROM leads
  WHERE gym_id = v_gym_id AND phone = v_phone AND created_at > now() - INTERVAL '24 hours'
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE leads
    SET interested_discipline_id = COALESCE(v_disc, interested_discipline_id),
        campaign_id = COALESCE(v_camp_id, campaign_id),
        source = CASE WHEN v_camp_id IS NOT NULL THEN v_source ELSE source END,
        updated_at = now()
    WHERE id = v_existing;
    RETURN 'duplicate';
  END IF;

  -- Fresh capture.
  INSERT INTO leads (gym_id, first_name, phone, source, interested_discipline_id, campaign_id, status)
  VALUES (v_gym_id, btrim(p_name), v_phone, v_source, v_disc, v_camp_id, 'new')
  RETURNING id INTO v_lead_id;

  -- lead_new → owner + receptionist (in-RPC; anon has no authed producer).
  -- BEST-EFFORT: a notification failure must NEVER roll back the captured lead
  -- (the anon visitor's submit is the product event). notifications.user_id FKs
  -- profiles(id) (000032), so skip any orphan user_role whose user_id has no
  -- profile — that orphan was the only thing that could violate the FK.
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_gym_id, 'lead_new',
           'messages.lead_new.title', 'messages.lead_new.body',
           jsonb_build_object('leadName', btrim(p_name)),
           'lead', v_lead_id, '/leads'
    FROM user_roles ur
    WHERE ur.gym_id = v_gym_id AND ur.role IN ('owner', 'receptionist')
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = ur.user_id);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION submit_trial_inquiry(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_trial_inquiry(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
