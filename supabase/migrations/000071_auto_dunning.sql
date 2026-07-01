-- ============================================================
-- 000071: DUNNING-AUTO — auto-send WhatsApp renewal reminders (opt-in, deduped)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / DUNNING-AUTO)
--
-- Turns one-tap-manual dunning into an automatic WhatsApp reminder for upcoming
-- renewals (within renewal_lead_days) + overdue ones (past dunning_grace_days),
-- for BOTH recurring products (class-registration + membership-if-enabled).
--
-- SAFETY RAIL — a real customer with real phones. gyms.auto_dunning_enabled
-- DEFAULTS FALSE: NO gym auto-messages anyone until an owner explicitly opts in.
-- The opt-in is enforced SERVER-SIDE inside due_dunning_reminders (an opted-out
-- gym returns zero rows), so no caller can bypass it.
--
-- This migration is DATA/LOGIC ONLY — it does NOT enable a scheduler (that stays
-- for the auditor: see the scheduler recommendation in the DUNNING-AUTO report /
-- docs). The reminder sender is Node (dispatchWhatsApp); this SQL provides the
-- opt-in flag, the send-dedup key, and the due-reminders reader the Node function
-- calls. No RLS change (a config column + a service_role-only reader/seed).
-- ============================================================

-- 1. SAFETY RAIL: per-gym opt-in, DEFAULT OFF. A dedicated boolean (NOT an
--    enabled_products key, whose absent-=-ON semantics would default it unsafe).
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS auto_dunning_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Send-dedup: a stable key per (invoice, nudge) on the outbound queue, so the
--    same reminder is never sent twice (idempotent across ticks). Partial-unique
--    (only when set) so the existing manual/wa.me sends — dedup_key NULL — are
--    untouched.
ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_dedup_key_uq
  ON outbound_messages (dedup_key) WHERE dedup_key IS NOT NULL;

-- 3. The due-reminders reader — the single source of "who to remind". Returns
--    rows ONLY for an OPTED-IN gym (safety), for open renewal invoices in the
--    UPCOMING (due within renewal_lead_days) or OVERDUE (due past
--    dunning_grace_days) window, for members WITH a phone, EXCLUDING reminders
--    already sent (the dedup_key already on outbound_messages). Membership rows
--    are dropped when the gym doesn't sell membership (enabled_products). Covers
--    BOTH products (renewal_invoices.product_type ∈ membership|class_registration).
--    SECURITY DEFINER + service_role only — the Node sender (admin client) reads it.
CREATE OR REPLACE FUNCTION due_dunning_reminders(p_gym_id UUID)
RETURNS TABLE (
  invoice_id   UUID,
  to_phone     TEXT,
  member_name  TEXT,
  member_locale TEXT,
  nudge        TEXT,      -- 'upcoming' | 'overdue'
  dedup_key    TEXT,      -- 'dun_<invoice>_<nudge>'
  amount_usd   NUMERIC,
  due_date     DATE,
  product_type TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_opted   BOOLEAN;
  v_lead    INTEGER;
  v_grace   INTEGER;
  v_memb_on BOOLEAN;
BEGIN
  SELECT g.auto_dunning_enabled, g.renewal_lead_days, g.dunning_grace_days,
         COALESCE((g.enabled_products->>'membership')::boolean, true)
    INTO v_opted, v_lead, v_grace, v_memb_on
  FROM gyms g WHERE g.id = p_gym_id;

  -- SAFETY RAIL: no opt-in → nothing due (an opted-out gym can never auto-message).
  IF NOT COALESCE(v_opted, false) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    i.id,
    p.phone::text,                                              -- phone is VARCHAR(50); RETURN QUERY is strict → cast to TEXT
    NULLIF(trim(COALESCE(p.first_name_en, '') || ' ' || COALESCE(p.last_name_en, '')), ''),
    COALESCE(p.locale, 'en')::text,                             -- locale is VARCHAR(5) → cast to TEXT
    nd.nudge,
    'dun_' || i.id::text || '_' || nd.nudge,
    i.total_usd,
    i.due_date,
    ri.product_type::text
  FROM renewal_invoices ri
  JOIN invoices  i ON i.id = ri.invoice_id
  JOIN students  s ON s.id = i.student_id
  JOIN profiles  p ON p.id = s.profile_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN i.due_date < CURRENT_DATE - v_grace THEN 'overdue'
      WHEN i.due_date >= CURRENT_DATE AND i.due_date <= CURRENT_DATE + v_lead THEN 'upcoming'
      ELSE NULL
    END AS nudge
  ) nd
  WHERE i.gym_id = p_gym_id
    AND i.status IN ('pending', 'partial', 'overdue')
    AND nd.nudge IS NOT NULL
    AND p.phone IS NOT NULL AND p.phone <> ''
    AND (ri.product_type <> 'membership' OR v_memb_on)          -- membership-if-enabled
    AND NOT EXISTS (                                            -- dedup: not already sent
      SELECT 1 FROM outbound_messages om
      WHERE om.gym_id = p_gym_id
        AND om.dedup_key = 'dun_' || i.id::text || '_' || nd.nudge
    );
END;
$$;
REVOKE ALL ON FUNCTION due_dunning_reminders(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION due_dunning_reminders(UUID) TO service_role;

-- 4. E2E-ONLY seed for the DUNNING-AUTO guard: an isolated gym with WhatsApp
--    ACTIVE (dummy token → record-mode still RECORDS the outbound row) + a member
--    with a phone + an OVERDUE open renewal invoice, opted in or out per the arg.
--    SECURITY DEFINER / REVOKE PUBLIC / GRANT service_role ONLY (reset_ml1_e2e
--    pattern). Test slugs only; never touches a real gym.
CREATE OR REPLACE FUNCTION seed_e2e_dunning(p_slug TEXT, p_opt_in BOOLEAN, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym  UUID;
  v_prof UUID;
  v_stu  UUID;
  v_inv  invoices;
BEGIN
  v_gym := seed_e2e_gym(p_slug, p_password);
  UPDATE gyms SET auto_dunning_enabled = p_opt_in WHERE id = v_gym;

  -- WhatsApp ACTIVE (dummy ciphertext: the send "fails" to decrypt but the
  -- dispatch still RECORDS the outbound_messages row — enough to prove record +
  -- dedup + opt-out without needing a Node-encrypted token in SQL).
  INSERT INTO gym_whatsapp_config (gym_id, status, phone_number_id, access_token, default_country_code)
  VALUES (v_gym, 'active', '100000000000001', 'e2e-dummy-ciphertext', '961')
  ON CONFLICT (gym_id) DO UPDATE
    SET status = 'active', phone_number_id = EXCLUDED.phone_number_id, access_token = EXCLUDED.access_token;

  -- A member WITH a phone.
  INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, phone, gender, locale)
  VALUES (v_gym, 'دن', 'Dun', 'Dun', 'تارغت', 'Target', 'Target', '+96170555001', 'male', 'en')
  RETURNING id INTO v_prof;
  INSERT INTO students (profile_id, gym_id, is_active) VALUES (v_prof, v_gym, true) RETURNING id INTO v_stu;

  -- An OVERDUE, open class-registration renewal invoice (past due+grace → 'overdue'
  -- window). product_id is a placeholder (the reader keys off the invoice, not it).
  v_inv := _system_issue_invoice(v_gym, v_stu, 'class_registration', 40, 0, NULL, NULL, NULL, CURRENT_DATE - 30, 'Renewal overdue');
  UPDATE invoices SET status = 'overdue', due_date = CURRENT_DATE - 30 WHERE id = v_inv.id;
  INSERT INTO renewal_invoices (invoice_id, product_type, product_id, period_start, period_end)
  VALUES (v_inv.id, 'class_registration', gen_random_uuid(), CURRENT_DATE - 30, CURRENT_DATE)
  ON CONFLICT DO NOTHING;

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_dunning(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_e2e_dunning(TEXT, BOOLEAN, TEXT) TO service_role;
