-- ============================================================
-- 000003: OPERATIONAL TABLES
-- Proline Gym — Classes, attendance, billing, PT, rentals, camps, leads
-- ============================================================

-- -----------------------------------------------------------
-- CLASSES
-- -----------------------------------------------------------
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    room VARCHAR(100),
    max_capacity INTEGER NOT NULL DEFAULT 20,
    min_age INTEGER,
    max_age INTEGER,
    belt_requirement belt_rank_enum,
    status class_status_enum NOT NULL DEFAULT 'scheduled',
    color VARCHAR(7),       -- hex color for calendar display
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- CLASS SCHEDULES (recurring weekly schedule)
-- -----------------------------------------------------------
CREATE TABLE class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    valid_from DATE,
    valid_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: find all classes on a given day
CREATE INDEX idx_class_schedules_day_time ON class_schedules(day_of_week, start_time);

-- -----------------------------------------------------------
-- CLASS ENROLLMENTS
-- -----------------------------------------------------------
CREATE TABLE class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, student_id)
);

-- -----------------------------------------------------------
-- ATTENDANCE RECORDS
-- -----------------------------------------------------------
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES class_schedules(id) ON DELETE SET NULL,
    marked_by UUID REFERENCES auth.users(id),
    attendance_date DATE NOT NULL,
    status attendance_status_enum NOT NULL DEFAULT 'present',
    check_in_time TIMESTAMPTZ,
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    offline_sync_id UUID,      -- for offline sync deduplication
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, student_id, attendance_date)
);

-- Index: attendance lookup by student + date range
CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, attendance_date DESC);

-- -----------------------------------------------------------
-- MEMBERSHIP PLANS
-- -----------------------------------------------------------
CREATE TABLE membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    duration_days INTEGER NOT NULL,         -- 30 = monthly, 90 = quarterly, 365 = annual
    price_usd NUMERIC(12,2) NOT NULL,
    price_lbp NUMERIC(15,2),
    max_classes_per_week INTEGER,           -- NULL = unlimited
    includes_pt BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- STUDENT MEMBERSHIPS (links student to a plan with dates)
-- -----------------------------------------------------------
CREATE TABLE student_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status membership_status_enum NOT NULL DEFAULT 'active',
    pause_start_date DATE,
    pause_end_date DATE,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: find active memberships
CREATE INDEX idx_student_memberships_active ON student_memberships(student_id) WHERE status = 'active';

-- -----------------------------------------------------------
-- INVOICES
-- -----------------------------------------------------------
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    membership_id UUID REFERENCES student_memberships(id) ON DELETE SET NULL,
    invoice_type invoice_type_enum NOT NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_lbp NUMERIC(15,2) NOT NULL DEFAULT 0,
    exchange_rate NUMERIC(10,2),
    rate_date DATE,
    rate_source VARCHAR(100),
    tax_rate NUMERIC(5,2) DEFAULT 11.00,    -- Lebanese TVA 11%
    tax_amount_usd NUMERIC(12,2) DEFAULT 0,
    total_usd NUMERIC(12,2) NOT NULL,
    total_lbp NUMERIC(15,2),
    status payment_status_enum NOT NULL DEFAULT 'pending',
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Index: find unpaid invoices
CREATE INDEX idx_invoices_unpaid ON invoices(student_id) WHERE status IN ('pending', 'overdue');

-- -----------------------------------------------------------
-- PAYMENTS
-- -----------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    received_by UUID REFERENCES auth.users(id),
    amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_lbp NUMERIC(15,2) NOT NULL DEFAULT 0,
    exchange_rate NUMERIC(10,2),
    rate_date DATE,
    payment_method payment_method_enum NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference_number VARCHAR(255),          -- OMT/Whish reference
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: payment history per student
CREATE INDEX idx_payments_student ON payments(student_id, payment_date DESC);

-- -----------------------------------------------------------
-- EXCHANGE RATES (USD/LBP rate tracker)
-- -----------------------------------------------------------
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate NUMERIC(10,2) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(100) DEFAULT 'manual',   -- 'lira-rate.org', 'sayrafa', 'manual'
    entered_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rate_date, source)
);

-- -----------------------------------------------------------
-- PT PACKAGES
-- -----------------------------------------------------------
CREATE TABLE pt_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    session_count INTEGER NOT NULL,
    price_usd NUMERIC(12,2) NOT NULL,
    price_lbp NUMERIC(15,2),
    validity_days INTEGER,                  -- NULL = no expiry
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- PT SESSIONS
-- -----------------------------------------------------------
CREATE TABLE pt_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    package_id UUID REFERENCES pt_packages(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status pt_session_status_enum NOT NULL DEFAULT 'scheduled',
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: coach schedule lookup
CREATE INDEX idx_pt_sessions_coach_time ON pt_sessions(coach_id, scheduled_at);

-- -----------------------------------------------------------
-- EXTERNAL COACHES (independent coaches renting space)
-- -----------------------------------------------------------
CREATE TABLE external_coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    first_name_ar VARCHAR(100),
    first_name_en VARCHAR(100),
    first_name_fr VARCHAR(100),
    last_name_ar VARCHAR(100),
    last_name_en VARCHAR(100),
    last_name_fr VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    specialization_ar VARCHAR(255),
    specialization_en VARCHAR(255),
    specialization_fr VARCHAR(255),
    belt_rank belt_rank_enum,
    hourly_rate_usd NUMERIC(10,2),
    waiver_signed BOOLEAN NOT NULL DEFAULT false,
    waiver_signed_at TIMESTAMPTZ,
    insurance_verified BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- SPACE RENTALS (rentable rooms/areas in the gym)
-- -----------------------------------------------------------
CREATE TABLE rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    hourly_rate_usd NUMERIC(12,2) NOT NULL,
    hourly_rate_lbp NUMERIC(15,2),
    max_capacity INTEGER,
    status rental_status_enum NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- RENTAL BOOKINGS
-- -----------------------------------------------------------
CREATE TABLE rental_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_id UUID NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    external_coach_id UUID NOT NULL REFERENCES external_coaches(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    total_amount_usd NUMERIC(12,2) NOT NULL,
    total_amount_lbp NUMERIC(15,2),
    status booking_status_enum NOT NULL DEFAULT 'confirmed',
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent double-booking: overlapping time ranges on same rental
CREATE UNIQUE INDEX idx_rental_no_double_book ON rental_bookings(rental_id, start_time, end_time)
    WHERE status != 'cancelled';

-- -----------------------------------------------------------
-- CAMPS & EVENTS
-- -----------------------------------------------------------
CREATE TABLE camps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    max_capacity INTEGER NOT NULL,
    price_usd NUMERIC(12,2) NOT NULL,
    price_lbp NUMERIC(15,2),
    early_bird_price_usd NUMERIC(12,2),
    early_bird_deadline DATE,
    sibling_discount_percent NUMERIC(5,2),
    status camp_status_enum NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- CAMP REGISTRATIONS
-- -----------------------------------------------------------
CREATE TABLE camp_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
    pickup_authorized_persons TEXT,         -- JSON array of authorized names
    medical_notes TEXT,
    dietary_restrictions TEXT,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (camp_id, student_id)
);

-- -----------------------------------------------------------
-- CAMP ATTENDANCE (daily roll-call for camps)
-- -----------------------------------------------------------
CREATE TABLE camp_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status attendance_status_enum NOT NULL DEFAULT 'present',
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    picked_up_by VARCHAR(255),
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (camp_id, student_id, attendance_date)
);

-- -----------------------------------------------------------
-- LEADS (social media inquiry pipeline)
-- -----------------------------------------------------------
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    source VARCHAR(50) NOT NULL DEFAULT 'walk_in' CHECK (source IN ('instagram', 'facebook', 'whatsapp', 'walk_in', 'phone', 'referral', 'website', 'other')),
    source_detail TEXT,                     -- Instagram handle, referral name, etc.
    interested_discipline_id UUID REFERENCES disciplines(id) ON DELETE SET NULL,
    notes TEXT,
    status lead_status_enum NOT NULL DEFAULT 'new',
    assigned_to UUID REFERENCES auth.users(id),
    converted_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- TRIAL CLASSES
-- -----------------------------------------------------------
CREATE TABLE trial_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    status trial_status_enum NOT NULL DEFAULT 'scheduled',
    show_up BOOLEAN,
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- WAIVERS & DOCUMENTS
-- -----------------------------------------------------------
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    external_coach_id UUID REFERENCES external_coaches(id) ON DELETE CASCADE,
    document_type document_type_enum NOT NULL,
    title_ar VARCHAR(255),
    title_en VARCHAR(255),
    title_fr VARCHAR(255),
    file_path TEXT NOT NULL,                -- Supabase Storage path
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    expires_at DATE,                        -- for medical cert expiry
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- MESSAGE LOGS (WhatsApp, SMS, email tracking)
-- -----------------------------------------------------------
CREATE TABLE message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES auth.users(id),
    recipient_phone VARCHAR(50),
    channel message_channel_enum NOT NULL,
    template_name VARCHAR(100),
    message_content TEXT NOT NULL,
    locale VARCHAR(5) DEFAULT 'ar',
    status message_status_enum NOT NULL DEFAULT 'pending',
    provider_message_id VARCHAR(255),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- AUDIT LOGS
-- -----------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    operation audit_action_enum NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: audit trail per table
CREATE INDEX idx_audit_logs_table_time ON audit_logs(table_name, created_at DESC);

-- -----------------------------------------------------------
-- NOTIFICATIONS (in-app notification center)
-- -----------------------------------------------------------
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title_ar VARCHAR(255),
    title_en VARCHAR(255),
    title_fr VARCHAR(255),
    body_ar TEXT,
    body_en TEXT,
    body_fr TEXT,
    action_url VARCHAR(500),
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE NOT is_read;
