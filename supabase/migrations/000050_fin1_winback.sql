-- ============================================================
-- 000050: FIN-1 — win-back followups + churn timestamps (V1 / FIN-1)
-- PRO LINE Gym Platform
--
-- REAL-COLUMNS AUDIT (done BEFORE this file):
--   · PRODUCT LINKAGE for revenue-by-product is ALREADY on the invoice:
--     invoices.invoice_type is the enum {membership, class_registration (added
--     000033), pt_package, pt_session, camp, rental, event, other}. So revenue
--     buckets = payments → invoice_id → invoices.invoice_type, with PT =
--     pt_package+pt_session and other/legacy = rental/event/other. NO new money
--     table, NO linkage column needed — the prompt's "derive product from the
--     invoice linkage" is a one-hop join.
--   · CHURN TIMESTAMPS were MISSING: neither student_memberships nor
--     class_registrations carried a state-transition timestamp, so churn could
--     not be bucketed per month. ADDED here (the prompt's sanctioned additive
--     migration): lapsed_at/cancelled_at on memberships, suspended_at/
--     cancelled_at on registrations, stamped by a BEFORE-UPDATE trigger on the
--     status edge (catches the ML-1 tick, manual cancel, every path — no RPC
--     edits). Pre-existing churned rows stay NULL (honest: no backfill of a
--     transition time we never recorded); the seed sets them explicitly.
--   · member_followups is the ONE new table (win-back workflow).
-- RLS: gym-scoped staff on member_followups (write+read own gym). Nothing
-- weakened anywhere.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Churn timestamps (additive) + status-edge triggers
-- -----------------------------------------------------------
ALTER TABLE student_memberships
  ADD COLUMN IF NOT EXISTS lapsed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE class_registrations
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Membership: stamp the moment status transitions INTO a churn state.
CREATE OR REPLACE FUNCTION _stamp_membership_churn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- OLD.status is never NULL in an UPDATE trigger; comparing enum directly (a
  -- COALESCE(OLD.status,'') would coerce '' to the enum type and raise on every
  -- status write — '' is not a valid enum member).
  IF NEW.status = 'lapsed' AND OLD.status <> 'lapsed' AND NEW.lapsed_at IS NULL THEN
    NEW.lapsed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_churn_stamp ON student_memberships;
CREATE TRIGGER trg_membership_churn_stamp
  BEFORE UPDATE OF status ON student_memberships
  FOR EACH ROW EXECUTE FUNCTION _stamp_membership_churn();

-- Registration: same idea for suspended/cancelled.
CREATE OR REPLACE FUNCTION _stamp_registration_churn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- (see _stamp_membership_churn: enum-direct compare, no COALESCE-to-text)
  IF NEW.status = 'suspended' AND OLD.status <> 'suspended' AND NEW.suspended_at IS NULL THEN
    NEW.suspended_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registration_churn_stamp ON class_registrations;
CREATE TRIGGER trg_registration_churn_stamp
  BEFORE UPDATE OF status ON class_registrations
  FOR EACH ROW EXECUTE FUNCTION _stamp_registration_churn();

-- -----------------------------------------------------------
-- 2. member_followups — the win-back workflow (the ONLY new table)
-- -----------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE member_followup_outcome_enum AS ENUM (
    'no_answer', 'not_interested', 'thinking', 'promised_visit', 'reactivated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS member_followups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'winback' CHECK (kind IN ('winback')),
  outcome          member_followup_outcome_enum NOT NULL,
  note             TEXT,
  next_action_date DATE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_followups_gym_student
  ON member_followups (gym_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_followups_next_action
  ON member_followups (gym_id, next_action_date) WHERE next_action_date IS NOT NULL;

ALTER TABLE member_followups ENABLE ROW LEVEL SECURITY;

-- Gym-scoped staff read+write (same idiom as trial_classes_staff_gym / 000023).
DROP POLICY IF EXISTS member_followups_staff_gym ON member_followups;
CREATE POLICY member_followups_staff_gym ON member_followups FOR ALL
  USING (is_staff() AND gym_id = get_user_gym_id())
  WITH CHECK (is_staff() AND gym_id = get_user_gym_id());
