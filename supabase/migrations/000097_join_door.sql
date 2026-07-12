-- 000097: JOIN-DOOR (MJ-5) — the public landing "Request to join" feeds the leads tab
--
-- Member Journey 2.0 slice 5/5. OWNER GATE (absolute): the public may only REQUEST —
-- NO public registration, NO account creation, NO credential path. Every request is a
-- LEAD in the gym's pipeline. This EXTENDS the existing anon lead-capture posture
-- (submit_trial_inquiry stays the discipline-level TRIAL path, unchanged); it hardens
-- the previously-dead, single-tenant submit_public_lead into the gym-scoped JOIN path.
--
--  1. leads.source CHECK += 'landing' — a first-class source so the leads tab can
--     distinguish a landing "Request to join" from a website trial inquiry.
--  2. leads.interest_categories TEXT[] — the join request's product interests
--     (membership / classes / pt / camp), rendered as chips on the lead card.
--  3. submit_public_lead → ONE canonical, gym-scoped (by slug), hardened RPC modeled
--     on submit_trial_inquiry: honeypot + validation + 24h per-phone dedupe (refresh,
--     never spam a row) + best-effort staff lead_new notify. Its name is already on the
--     AUTH-DEPTH anon allowlist (000096 + assert-definer-posture.sql), so no allowlist
--     edit is needed — but it must keep the posture (no PUBLIC, pinned search_path,
--     anon only via the allowlisted name).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. leads.source CHECK += 'landing' (drop whatever source CHECK exists, re-add)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('instagram','facebook','whatsapp','walk_in','phone','referral','website','other','landing'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. leads.interest_categories — the join request's product interests
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_categories TEXT[];

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. submit_public_lead — the canonical gym-scoped JOIN capture RPC
--    Drop the legacy overloads (000009 4-arg + 000029 8-arg; neither has a live
--    app caller) and create one hardened signature.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS submit_public_lead(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS submit_public_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS submit_public_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION submit_public_lead(
  p_gym_slug  TEXT,
  p_name      TEXT,
  p_phone     TEXT,
  p_interests TEXT[] DEFAULT NULL,
  p_note      TEXT DEFAULT NULL,
  p_honeypot  TEXT DEFAULT NULL
) RETURNS TEXT   -- 'ok' | 'duplicate' | 'invalid' — never row data to anon
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id    UUID;
  v_phone     TEXT;
  v_digits    TEXT;
  v_interests TEXT[];
  v_note      TEXT;
  v_existing  UUID;
  v_lead_id   UUID;
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

  -- Active gym by slug (the landing always passes its gym slug — gym-scoped,
  -- unlike the old "first active gym" behaviour this replaces).
  SELECT id INTO v_gym_id FROM gyms WHERE slug = p_gym_slug AND is_active = true;
  IF v_gym_id IS NULL THEN
    RETURN 'invalid';
  END IF;

  -- Sanitize interests to the allowed product set (untrusted anon input).
  SELECT array_agg(x) INTO v_interests
  FROM unnest(COALESCE(p_interests, ARRAY[]::text[])) AS x
  WHERE x IN ('membership', 'classes', 'pt', 'camp');

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  -- Per-phone-per-gym 24h dedup: refresh the existing fresh lead, don't dupe.
  SELECT id INTO v_existing FROM leads
  WHERE gym_id = v_gym_id AND phone = v_phone AND created_at > now() - INTERVAL '24 hours'
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE leads
    SET interest_categories = COALESCE(v_interests, interest_categories),
        notes  = COALESCE(v_note, notes),
        source = 'landing',
        updated_at = now()
    WHERE id = v_existing;
    RETURN 'duplicate';
  END IF;

  -- Fresh capture — a lead, never a member (owner gate: request only).
  INSERT INTO leads (gym_id, first_name, phone, source, interest_categories, notes, status)
  VALUES (v_gym_id, btrim(p_name), v_phone, 'landing', v_interests, v_note, 'new')
  RETURNING id INTO v_lead_id;

  -- lead_new → owner + receptionist (in-RPC; anon has no authed producer).
  -- BEST-EFFORT: a notification failure must NEVER roll back the captured lead.
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

REVOKE ALL ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO anon, authenticated;
