-- ============================================================
-- 000001: ENUM TYPES
-- Proline Gym — All enum types for the platform
-- ============================================================

-- User roles (aligned with Supabase Auth + custom roles)
CREATE TYPE user_role_enum AS ENUM (
  'owner',         -- Gym owner — full access
  'head_coach',    -- Head coach — manages coaches + curriculum
  'coach',         -- Coach — teaches classes, marks attendance
  'receptionist',  -- Front desk — walk-ins, payments, scheduling
  'student',       -- Student/member — self-service portal
  'parent',        -- Parent/guardian — views child progress
  'external_coach' -- External coach — rents space, trains clients
);

CREATE TYPE gender_enum AS ENUM ('male', 'female', 'other');

-- Belt ranks (unified for all disciplines — BJJ uses stripes for granularity)
CREATE TYPE belt_rank_enum AS ENUM (
  'white', 'white_yellow', 'yellow', 'yellow_orange',
  'orange', 'orange_green', 'green', 'green_blue',
  'blue', 'blue_purple', 'purple', 'purple_brown',
  'brown', 'brown_black', 'red',
  'black_1', 'black_2', 'black_3', 'black_4', 'black_5'
);

-- Membership statuses
CREATE TYPE membership_status_enum AS ENUM (
  'active', 'expired', 'cancelled', 'paused', 'pending'
);

-- Payment methods (Lebanese context)
CREATE TYPE payment_method_enum AS ENUM (
  'cash_usd', 'cash_lbp', 'omt', 'whish', 'bank_transfer', 'bob_finance'
);

-- Payment status
CREATE TYPE payment_status_enum AS ENUM (
  'pending', 'paid', 'overdue', 'cancelled', 'refunded', 'partial'
);

-- Invoice types
CREATE TYPE invoice_type_enum AS ENUM (
  'membership', 'pt_package', 'pt_session', 'camp', 'rental', 'event', 'other'
);

-- Class status
CREATE TYPE class_status_enum AS ENUM (
  'scheduled', 'in_progress', 'completed', 'cancelled'
);

-- Attendance status
CREATE TYPE attendance_status_enum AS ENUM (
  'present', 'absent', 'late', 'excused'
);

-- PT session status
CREATE TYPE pt_session_status_enum AS ENUM (
  'scheduled', 'completed', 'cancelled', 'no_show'
);

-- Rental status
CREATE TYPE rental_status_enum AS ENUM (
  'available', 'booked', 'maintenance'
);

-- Rental booking status
CREATE TYPE booking_status_enum AS ENUM (
  'confirmed', 'in_use', 'completed', 'cancelled'
);

-- Camp/event status
CREATE TYPE camp_status_enum AS ENUM (
  'draft', 'open', 'full', 'in_progress', 'completed', 'cancelled'
);

-- Lead status (social inquiry pipeline)
CREATE TYPE lead_status_enum AS ENUM (
  'new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost'
);

-- Trial class status
CREATE TYPE trial_status_enum AS ENUM (
  'scheduled', 'completed', 'no_show', 'cancelled'
);

-- Document types
CREATE TYPE document_type_enum AS ENUM (
  'waiver', 'medical', 'id_card', 'certificate', 'contract', 'other'
);

-- Audit log action type
CREATE TYPE audit_action_enum AS ENUM (
  'create', 'update', 'delete', 'login', 'logout', 'payment', 'refund', 'export'
);

-- Messaging channels
CREATE TYPE message_channel_enum AS ENUM (
  'whatsapp', 'sms', 'email', 'push'
);

-- Message delivery status
CREATE TYPE message_status_enum AS ENUM (
  'pending', 'sent', 'delivered', 'read', 'failed'
);
