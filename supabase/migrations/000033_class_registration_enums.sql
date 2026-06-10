-- ============================================================
-- 000033: enums for recurring-class registration (V1 / B2)
-- PRO LINE Gym Platform
--
-- Split from the main B2 migration so the new enum value + type are COMMITTED
-- before 000034 references them (a fresh enum value can't be USED in the same
-- transaction that adds it). Applied as its own run_sql call by the F1 workflow.
-- ============================================================

-- The class_registration invoice type (D1's issue_invoice bills it).
ALTER TYPE invoice_type_enum ADD VALUE IF NOT EXISTS 'class_registration';

-- The registration state machine.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_registration_status_enum') THEN
    CREATE TYPE class_registration_status_enum AS ENUM (
      'requested', 'active', 'waitlisted', 'cancelled', 'rejected', 'expired'
    );
  END IF;
END $$;
