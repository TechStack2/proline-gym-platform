-- ============================================================
-- 000044: PT BOOKING — SCHEMA (V1 / PT-2, part 1 of 2)
-- PRO LINE Gym Platform
--
-- Split rule: ALTER TYPE … ADD VALUE cannot be USED in the same transaction
-- that adds it (PG). This file = enum + tables + columns; 000045 = the
-- partial unique index + RPCs that reference 'proposed'.
--
-- Availability model (journey-pt-360 §4):
--   · coach_availability — recurring weekly windows (coach publishes only
--     what they'll teach; nothing outside is member-bookable).
--   · coach_availability_overrides — per-date exceptions: kind='block'
--     (times NULL ⇒ whole day) or kind='extra' (a one-off window).
--   RLS: coach manages OWN rows · staff manage any in their gym ·
--   authenticated read in-gym (members need slot visibility) · NO anon.
-- Policy columns (C1 pattern, per gym): slot granularity 60' · min notice
-- 12h · booking horizon 14d · buffer 0'.
-- Proposal state: pt_session_status_enum += 'proposed';
-- pt_sessions.proposed_by = whose turn it ISN'T (the last proposer).
-- ============================================================

ALTER TYPE pt_session_status_enum ADD VALUE IF NOT EXISTS 'proposed';

ALTER TABLE pt_sessions
  ADD COLUMN IF NOT EXISTS proposed_by UUID REFERENCES profiles(id);

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS pt_slot_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS pt_min_notice_hours INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS pt_booking_horizon_days INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS pt_buffer_minutes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS coach_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS idx_coach_availability_coach ON coach_availability(coach_id, day_of_week);

CREATE TABLE IF NOT EXISTS coach_availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('block', 'extra')),
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'block' OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time))
);
CREATE INDEX IF NOT EXISTS idx_coach_overrides_coach ON coach_availability_overrides(coach_id, date);

ALTER TABLE coach_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_availability_overrides ENABLE ROW LEVEL SECURITY;

-- Coach manages OWN rows.
DROP POLICY IF EXISTS coach_availability_own ON coach_availability;
CREATE POLICY coach_availability_own ON coach_availability FOR ALL
  USING (coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()));
DROP POLICY IF EXISTS coach_overrides_own ON coach_availability_overrides;
CREATE POLICY coach_overrides_own ON coach_availability_overrides FOR ALL
  USING (coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()));

-- Staff manage any in their gym.
DROP POLICY IF EXISTS coach_availability_staff ON coach_availability;
CREATE POLICY coach_availability_staff ON coach_availability FOR ALL
  USING (is_staff() AND gym_id = get_user_gym_id());
DROP POLICY IF EXISTS coach_overrides_staff ON coach_availability_overrides;
CREATE POLICY coach_overrides_staff ON coach_availability_overrides FOR ALL
  USING (is_staff() AND gym_id = get_user_gym_id());

-- Authenticated read in-gym (slot visibility for members/guardians). NO anon.
DROP POLICY IF EXISTS coach_availability_read ON coach_availability;
CREATE POLICY coach_availability_read ON coach_availability FOR SELECT
  USING (auth.role() = 'authenticated' AND gym_id = get_user_gym_id());
DROP POLICY IF EXISTS coach_overrides_read ON coach_availability_overrides;
CREATE POLICY coach_overrides_read ON coach_availability_overrides FOR SELECT
  USING (auth.role() = 'authenticated' AND gym_id = get_user_gym_id());
