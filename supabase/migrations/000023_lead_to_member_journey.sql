-- ============================================================
-- 000023: LEAD → ACTIVE-MEMBER JOURNEY (Cycle 5 / Phase 1 / Prompt 23-R)
-- PRO LINE Gym Platform
--
-- Makes the Lead → Onboard → Active-Member journey real & L3-Managed. The
-- pre-existing leads board was cosmetic: status strings moved, but no trial row
-- was ever written, "convert" created no student/membership/invoice, and
-- converted_student_id stayed NULL.
--
-- This forward-only, idempotent migration adds:
--   1. trial_classes: scheduled_time + assigned_coach_id; class_id nullable
--      (a free-form trial isn't tied to a published class). Its RLS is re-scoped
--      to the LEAD's gym (the old policy keyed on classes.class_id and would
--      reject every NULL-class trial row).
--   2. leads: an explicit staff-only, same-gym INSERT policy (the board only
--      read/updated before; the new "Add Lead" surface inserts).
--   3. submit_public_lead extended: maps the program → interested_discipline_id,
--      captures last_name/email, and emits lead_new to staff INSIDE the RPC
--      (the anon caller can't run the authed producer — sanctioned F2 exception).
--   4. schedule_trial / record_trial_outcome — atomic, staff-only, gym-scoped
--      (record_trial_outcome also lets the assigned coach record, since coach is
--      is_staff() but is excluded from the leads RLS — the definer bypasses that
--      cleanly without weakening any policy).
--   5. convert_lead_to_member — the critical atomic onboarding txn, extending the
--      proven create_student (000018) pattern: profile(login-less)+student+
--      membership+membership-invoice + lead link, all-or-nothing.
--   6. account_invites + the provisioning seam's storage (a visible
--      "invite pending/sent (simulated)" record — no auth.users, no external send).
--   7. get_coach_trials() — a definer reader for the coach "Trials" surface
--      (same pattern as get_coach_pt_roster / get_gym_coaches).
--   8. member_phone_exists() — supports the soft duplicate-phone warning at convert.
--
-- Notifications follow the sanctioned F2 pattern (RETURNING-free); the only
-- in-RPC emit is lead_new on the anon web path (no authed caller).
-- ============================================================

-- -----------------------------------------------------------
-- 1. trial_classes: free-form trial columns + RLS re-scope
-- -----------------------------------------------------------
ALTER TABLE trial_classes ADD COLUMN IF NOT EXISTS scheduled_time   TIME;
ALTER TABLE trial_classes ADD COLUMN IF NOT EXISTS assigned_coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE trial_classes ALTER COLUMN class_id DROP NOT NULL;

-- Old policy (000011) keyed on classes.class_id → rejects NULL-class trial rows.
-- Re-scope to the lead's gym so a free-form trial is staff-manageable and
-- coach-readable (coach is is_staff()), with no cross-gym leak.
DROP POLICY IF EXISTS trial_classes_staff_gym ON trial_classes;
DROP POLICY IF EXISTS trial_classes_staff ON trial_classes;
CREATE POLICY trial_classes_staff_gym ON trial_classes FOR ALL
  USING (
    is_staff() AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = trial_classes.lead_id AND l.gym_id = get_user_gym_id()
    )
  )
  WITH CHECK (
    is_staff() AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = trial_classes.lead_id AND l.gym_id = get_user_gym_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_trial_classes_coach ON trial_classes(assigned_coach_id);
CREATE INDEX IF NOT EXISTS idx_trial_classes_lead  ON trial_classes(lead_id);

-- -----------------------------------------------------------
-- 2. leads: explicit staff-only, same-gym INSERT policy
--    (database-reviewer: same-gym is enforced in WITH CHECK; no cross-gym write)
-- -----------------------------------------------------------
DROP POLICY IF EXISTS leads_staff_insert ON leads;
CREATE POLICY leads_staff_insert ON leads FOR INSERT
  WITH CHECK (
    gym_id = get_user_gym_id()
    AND get_user_role() IN ('owner', 'head_coach', 'receptionist')
  );

-- -----------------------------------------------------------
-- 3. submit_public_lead — discipline mapping + last_name/email + lead_new
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS submit_public_lead(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION submit_public_lead(
  p_first_name TEXT,
  p_phone      TEXT,
  p_source     TEXT DEFAULT 'website',
  p_notes      TEXT DEFAULT NULL,
  p_last_name  TEXT DEFAULT NULL,
  p_email      TEXT DEFAULT NULL,
  p_program    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gym_id  UUID;
  v_lead_id UUID;
  v_disc    UUID;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No active gym found';
  END IF;

  -- Map the selected program → a real discipline (matched across locales).
  IF p_program IS NOT NULL AND p_program <> '' THEN
    SELECT id INTO v_disc FROM disciplines
    WHERE gym_id = v_gym_id
      AND (name_en = p_program OR name_ar = p_program OR name_fr = p_program)
    LIMIT 1;
  END IF;

  INSERT INTO leads (
    gym_id, first_name, last_name, phone, email,
    source, interested_discipline_id, notes, status
  )
  VALUES (
    v_gym_id, p_first_name, NULLIF(p_last_name, ''), p_phone, NULLIF(p_email, ''),
    p_source, v_disc, p_notes, 'new'
  )
  RETURNING id INTO v_lead_id;

  -- lead_new → owner + receptionist. Emitted IN this SECURITY DEFINER RPC because
  -- the caller is anon (no authed producer possible). Sanctioned F2 exception.
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
  SELECT ur.user_id, v_gym_id, 'lead_new',
         'messages.lead_new.title', 'messages.lead_new.body',
         jsonb_build_object('leadName', p_first_name),
         'lead', v_lead_id, '/leads'
  FROM user_roles ur
  WHERE ur.gym_id = v_gym_id AND ur.role IN ('owner', 'receptionist');

  RETURN v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- -----------------------------------------------------------
-- 4a. schedule_trial — write trial_classes + flip lead, atomic, staff-only
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION schedule_trial(
  p_lead_id        UUID,
  p_scheduled_date DATE,
  p_scheduled_time TIME,
  p_coach_id       UUID
) RETURNS trial_classes
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym   UUID;
  v_trial trial_classes;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may schedule trials';
  END IF;
  v_gym := get_user_gym_id();

  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'Lead % not found in this gym', p_lead_id;
  END IF;

  IF p_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM coaches WHERE id = p_coach_id AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'Coach % not found in this gym', p_coach_id;
  END IF;

  INSERT INTO trial_classes (lead_id, class_id, scheduled_date, scheduled_time, assigned_coach_id, status)
  VALUES (p_lead_id, NULL, p_scheduled_date, p_scheduled_time, p_coach_id, 'scheduled')
  RETURNING * INTO v_trial;

  UPDATE leads SET status = 'trial_scheduled', updated_at = now() WHERE id = p_lead_id;

  RETURN v_trial;
END;
$$;

GRANT EXECUTE ON FUNCTION schedule_trial(UUID, DATE, TIME, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 4b. record_trial_outcome — coach OR reception records result, reflect to lead
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION record_trial_outcome(
  p_trial_id UUID,
  p_status   trial_status_enum,
  p_show_up  BOOLEAN,
  p_feedback TEXT
) RETURNS trial_classes
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym   UUID;
  v_trial trial_classes;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may record trial outcomes';
  END IF;
  v_gym := get_user_gym_id();

  -- Gym scope via the trial's lead (works for reception AND the assigned coach,
  -- both of whom share the gym; coach is is_staff() but excluded from leads RLS,
  -- which this definer bypasses without weakening that policy).
  SELECT t.* INTO v_trial
  FROM trial_classes t
  JOIN leads l ON l.id = t.lead_id
  WHERE t.id = p_trial_id AND l.gym_id = v_gym;

  IF v_trial.id IS NULL THEN
    RAISE EXCEPTION 'Trial % not found in this gym', p_trial_id;
  END IF;

  UPDATE trial_classes
  SET status = p_status, show_up = p_show_up, feedback = NULLIF(p_feedback, ''), updated_at = now()
  WHERE id = p_trial_id
  RETURNING * INTO v_trial;

  -- Reflect to the lead: a completed trial (show) → trial_completed (convert
  -- candidate); a no-show falls back to contacted for re-engagement.
  UPDATE leads
  SET status = CASE
                 WHEN p_status = 'completed' THEN 'trial_completed'::lead_status_enum
                 WHEN p_status = 'no_show'   THEN 'contacted'::lead_status_enum
                 ELSE status
               END,
      updated_at = now()
  WHERE id = v_trial.lead_id;

  RETURN v_trial;
END;
$$;

GRANT EXECUTE ON FUNCTION record_trial_outcome(UUID, trial_status_enum, BOOLEAN, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 5. convert_lead_to_member — the atomic onboarding transaction
--    (extends create_student: profile+student+membership+invoice+lead link)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION convert_lead_to_member(
  p_lead_id UUID,
  p_plan_id UUID
) RETURNS TABLE (
  student_id     UUID,
  profile_id     UUID,
  membership_id  UUID,
  invoice_id     UUID,
  invoice_number TEXT,
  total_usd      NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym          UUID;
  v_lead         leads;
  v_plan         membership_plans;
  v_profile_id   UUID;
  v_student_id   UUID;
  v_membership_id UUID;
  v_invoice_id   UUID;
  v_rate         NUMERIC;
  v_rate_date    DATE;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may convert leads';
  END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'No gym context for caller';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND gym_id = v_gym;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead % not found in this gym', p_lead_id;
  END IF;
  IF v_lead.status = 'converted' OR v_lead.converted_student_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead % is already converted', p_lead_id;
  END IF;

  SELECT * INTO v_plan FROM membership_plans
  WHERE id = p_plan_id AND gym_id = v_gym AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Membership plan % not found or inactive in this gym', p_plan_id;
  END IF;

  -- 1) profile (login-less; the auth.users FK was dropped in 000018). Lead names
  --    are un-localized → seed all three locale columns from the same value.
  INSERT INTO profiles (
    gym_id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, phone
  )
  VALUES (
    v_gym, v_lead.first_name, v_lead.first_name, v_lead.first_name,
    v_lead.last_name, v_lead.last_name, v_lead.last_name, v_lead.phone
  )
  RETURNING id INTO v_profile_id;

  -- 2) student
  INSERT INTO students (profile_id, gym_id, join_date, is_active, current_belt_rank)
  VALUES (v_profile_id, v_gym, CURRENT_DATE, true, 'white')
  RETURNING id INTO v_student_id;

  -- 3) membership (active; end_date = today + plan duration)
  INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
  VALUES (v_student_id, v_plan.id, CURRENT_DATE, CURRENT_DATE + v_plan.duration_days, 'active')
  RETURNING id INTO v_membership_id;

  -- 4) membership invoice. total_usd / tax_amount_usd / invoice_number are filled
  --    by the existing BEFORE-INSERT triggers (000005); we pass the base amount,
  --    tax_rate default (11% TVA), and the latest exchange rate for dual-currency.
  SELECT rate, rate_date INTO v_rate, v_rate_date
  FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;

  INSERT INTO invoices (
    gym_id, student_id, membership_id, invoice_type, invoice_number,
    amount_usd, amount_lbp, exchange_rate, rate_date, total_usd,
    status, due_date, notes_en, notes_ar, notes_fr
  )
  VALUES (
    v_gym, v_student_id, v_membership_id, 'membership', '',
    v_plan.price_usd, COALESCE(v_plan.price_lbp, 0), v_rate, v_rate_date, v_plan.price_usd,
    'pending', CURRENT_DATE + 14,
    'Membership: ' || v_plan.name_en,
    'اشتراك: ' || v_plan.name_ar,
    'Adhésion: ' || v_plan.name_fr
  )
  RETURNING id INTO v_invoice_id;

  -- 5) link the lead
  UPDATE leads
  SET converted_student_id = v_student_id, status = 'converted', converted_at = now(), updated_at = now()
  WHERE id = p_lead_id;

  RETURN QUERY
  SELECT v_student_id, v_profile_id, v_membership_id, v_invoice_id, inv.invoice_number, inv.total_usd
  FROM invoices inv WHERE inv.id = v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION convert_lead_to_member(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 6. account_invites — provisioning seam storage ("invite pending/sent (simulated)")
--    No auth.users row, no external send; just a visible, durable record.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id     UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL DEFAULT 'whatsapp',
  token      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'revoked')),
  provider   TEXT NOT NULL DEFAULT 'simulated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE account_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_invites_staff ON account_invites;
CREATE POLICY account_invites_staff ON account_invites FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff())
  WITH CHECK (gym_id = get_user_gym_id() AND is_staff());

CREATE INDEX IF NOT EXISTS idx_account_invites_student ON account_invites(student_id);

-- -----------------------------------------------------------
-- 7. get_coach_trials — definer reader for the coach "Trials" surface
--    (coach is excluded from the leads RLS; this reads the lead name safely)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_trials()
RETURNS TABLE (
  id             UUID,
  lead_id        UUID,
  lead_name      TEXT,
  lead_phone     TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  status         trial_status_enum,
  show_up        BOOLEAN,
  feedback       TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.lead_id,
    TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')),
    l.phone, t.scheduled_date, t.scheduled_time, t.status, t.show_up, t.feedback
  FROM trial_classes t
  JOIN leads l   ON l.id = t.lead_id
  JOIN coaches c ON c.id = t.assigned_coach_id
  WHERE c.profile_id = auth.uid()
    AND l.gym_id = get_user_gym_id()
  ORDER BY t.scheduled_date DESC, t.scheduled_time DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_coach_trials() TO authenticated;

-- -----------------------------------------------------------
-- 8. member_phone_exists — supports the soft duplicate-phone warning at convert
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION member_phone_exists(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM students s
    JOIN profiles p ON p.id = s.profile_id
    WHERE p.gym_id = get_user_gym_id()
      AND p_phone IS NOT NULL AND p_phone <> ''
      AND p.phone = p_phone
  );
$$;

GRANT EXECUTE ON FUNCTION member_phone_exists(TEXT) TO authenticated;
