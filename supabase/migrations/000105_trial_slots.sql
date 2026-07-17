-- ============================================================
-- TRIAL-SLOTS — trials book a REAL class occurrence / PT slot (field finding 1)
--
-- Today schedule_trial(lead, date, time, coach) hardcodes class_id = NULL (000023),
-- so a trial is a free-range datetime that pins nothing — staff can book a trial at a
-- moment nothing happens at the gym. Owner decree: a CLASS trial books a real upcoming
-- class occurrence (and lands on THAT day's roster); a PT trial books a coach's real
-- availability. Trials stay FREE, but carry a chargeable-later flag so a PT trial can
-- take a fee someday as a DATA change, not a schema change.
--
-- Two additive changes only (the roster surfacing, occurrence picker and PT-slot picker
-- are all app-side against the EXISTING columns — class_id + scheduled_date/time +
-- assigned_coach_id already exist; the staff RLS policy already lets coaches read +
-- check in trials since is_staff() includes coach):
--   1. trial_classes.fee_usd — the fee-capable flag (DEFAULT 0 = free today).
--   2. schedule_trial gains p_class_id (pin the occurrence's class) + p_fee_usd
--      (default 0). A class trial passes the picked class; a PT trial passes NULL.
--      DROP+recreate because a new parameter changes the signature; the body is the
--      000023 version plus the class-in-gym guard and the two new columns.
-- ============================================================

-- 1. The chargeable-later flag. Free today; a future price is just an UPDATE.
ALTER TABLE trial_classes ADD COLUMN IF NOT EXISTS fee_usd NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Occurrence lookups: a class's trials on a given day (the roster query).
CREATE INDEX IF NOT EXISTS idx_trial_classes_class_date ON trial_classes(class_id, scheduled_date);

-- 2. schedule_trial gains the pinned class + the fee flag.
DROP FUNCTION IF EXISTS schedule_trial(UUID, DATE, TIME, UUID);

CREATE OR REPLACE FUNCTION schedule_trial(
  p_lead_id        UUID,
  p_scheduled_date DATE,
  p_scheduled_time TIME,
  p_coach_id       UUID,
  p_class_id       UUID DEFAULT NULL,
  p_fee_usd        NUMERIC DEFAULT 0
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

  -- A class trial pins a REAL class (its occurrence date/time come from the picker).
  IF p_class_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM classes WHERE id = p_class_id AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'Class % not found in this gym', p_class_id;
  END IF;

  INSERT INTO trial_classes (lead_id, class_id, scheduled_date, scheduled_time, assigned_coach_id, status, fee_usd)
  VALUES (p_lead_id, p_class_id, p_scheduled_date, p_scheduled_time, p_coach_id, 'scheduled', GREATEST(COALESCE(p_fee_usd, 0), 0))
  RETURNING * INTO v_trial;

  UPDATE leads SET status = 'trial_scheduled', updated_at = now() WHERE id = p_lead_id;

  RETURN v_trial;
END;
$$;

-- DEFAULT-PRIV CONTRACT: a recreated function re-acquires Supabase's default execute
-- grant to anon — REVOKE it explicitly (REVOKE FROM PUBLIC alone leaves the anon grant
-- on prod). Staff RPC → authenticated + service_role, never anon.
REVOKE ALL ON FUNCTION schedule_trial(UUID, DATE, TIME, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION schedule_trial(UUID, DATE, TIME, UUID, UUID, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION schedule_trial(UUID, DATE, TIME, UUID, UUID, NUMERIC) TO authenticated, service_role;

-- 3. Roster surfacing (R3): a class occurrence's trials, with lead names, for the
--    attendance sheet. SECURITY DEFINER because a COACH cannot read `leads` directly
--    (the trial_classes RLS EXISTS(leads …) fails for them) — the same reason
--    get_coach_trials exists. Staff-only, gym-scoped via the class.
CREATE OR REPLACE FUNCTION get_class_trials(p_class_id UUID, p_date DATE)
RETURNS TABLE (id UUID, lead_name TEXT, status trial_status_enum, show_up BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id,
         TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')),
         t.status, t.show_up
  FROM trial_classes t
  JOIN leads l   ON l.id = t.lead_id
  JOIN classes c ON c.id = t.class_id
  WHERE t.class_id = p_class_id
    AND t.scheduled_date = p_date
    AND c.gym_id = get_user_gym_id()
  ORDER BY t.created_at;
END;
$$;
REVOKE ALL ON FUNCTION get_class_trials(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_class_trials(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION get_class_trials(UUID, DATE) TO authenticated, service_role;
