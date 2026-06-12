-- ============================================================
-- 000046: MEMBERSHIP LIFECYCLE — SCHEMA (V1 / ML-1, part 1 of 3)
-- PRO LINE Gym Platform
--
-- Split rule (PT-2 lesson): enum ADD VALUE cannot be USED in its own
-- transaction → this file adds values/tables/columns; 000047 holds every RPC
-- that references them; 000048 is seed-only.
--
-- REAL-COLUMNS AUDIT (the rule — both product tables verified first):
--   · student_memberships: id, student_id, plan_id, start_date, end_date,
--     status membership_status_enum (active|expired|cancelled|paused|pending),
--     auto_renew, pause_start_date, pause_end_date (DORMANT — freeze
--     precursors that 000003 shipped and nothing ever wrote!). NO gym_id
--     (scope via students). MISSING: 'lapsed' status + pending_plan_id.
--   · class_registrations: id, class_id, student_id, gym_id, status
--     class_registration_status_enum (requested|active|waitlisted|cancelled|
--     rejected|expired), waitlist_position, monthly_fee_usd/lbp,
--     discount_pct/amount_usd, start_date, end_date, invoice_id,
--     requested_at, approved_*. MISSING: 'suspended' status + paid_until
--     (the billing anchor).
--   · membership_plans.duration_days = the period length (30/90/365 seeded).
--
-- Additions (each named):
--   1. membership_status_enum += 'lapsed'. FREEZE reuses the EXISTING
--      'paused' value + pause_start/end_date columns (idiomatic — the enum
--      and columns were built for this; membership_freezes adds the history
--      and the yearly-bounds ledger).
--   2. class_registration_status_enum += 'suspended'; class_registrations
--      .paid_until DATE (backfilled for active rows: end of the month the
--      B2 approval invoice covered).
--   3. student_memberships.pending_plan_id (next-cycle plan change; applied
--      when the renewal is ISSUED (price) and PAID (switch)).
--   4. membership_freezes: history + bounds ledger.
--   5. Gym policy columns: renewal_lead_days 7 · dunning_grace_days 7 ·
--      freeze_max_days_year 30 · freeze_min_chunk_days 7.
--   6. renewal_invoices link (invoice → product + period) with
--      UNIQUE(product_type, product_id, period_start) — renewal idempotency
--      is a CONSTRAINT, not a convention; payment activation reads it.
--   7. notifications.dedup_key + partial unique — tick notifications insert
--      ON CONFLICT DO NOTHING (reminder dedup is also a constraint).
-- ============================================================

ALTER TYPE membership_status_enum ADD VALUE IF NOT EXISTS 'lapsed';
ALTER TYPE class_registration_status_enum ADD VALUE IF NOT EXISTS 'suspended';

ALTER TABLE student_memberships
  ADD COLUMN IF NOT EXISTS pending_plan_id UUID REFERENCES membership_plans(id);

ALTER TABLE class_registrations
  ADD COLUMN IF NOT EXISTS paid_until DATE;

-- Backfill the billing anchor for live registrations: the B2 approval invoice
-- covered the first month from activation.
UPDATE class_registrations
SET paid_until = COALESCE(start_date, approved_at::date, requested_at::date) + 30
WHERE status = 'active' AND paid_until IS NULL;

CREATE TABLE IF NOT EXISTS membership_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES student_memberships(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  planned_end_date DATE NOT NULL,
  actual_end_date DATE,
  days_frozen INTEGER NOT NULL, -- planned at creation; corrected on early unfreeze
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (planned_end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_membership_freezes_membership ON membership_freezes(membership_id);

ALTER TABLE membership_freezes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_freezes_staff ON membership_freezes;
CREATE POLICY membership_freezes_staff ON membership_freezes FOR ALL
  USING (
    is_staff() AND EXISTS (
      SELECT 1 FROM student_memberships m JOIN students s ON s.id = m.student_id
      WHERE m.id = membership_id AND s.gym_id = get_user_gym_id()
    )
  );
DROP POLICY IF EXISTS membership_freezes_self ON membership_freezes;
CREATE POLICY membership_freezes_self ON membership_freezes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM student_memberships m JOIN students s ON s.id = m.student_id
      WHERE m.id = membership_id AND (s.profile_id = auth.uid() OR is_guardian_of(s.id))
    )
  );

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS renewal_lead_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS dunning_grace_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS freeze_max_days_year INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS freeze_min_chunk_days INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS renewal_invoices (
  invoice_id UUID PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('membership', 'class_registration')),
  product_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_type, product_id, period_start)
);
ALTER TABLE renewal_invoices ENABLE ROW LEVEL SECURITY;
-- Readable wherever the underlying invoice is readable (member/guardian/staff
-- RLS already gates invoices); writes happen ONLY inside SECURITY DEFINER.
DROP POLICY IF EXISTS renewal_invoices_read ON renewal_invoices;
CREATE POLICY renewal_invoices_read ON renewal_invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup
  ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;
