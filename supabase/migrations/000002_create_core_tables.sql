-- ============================================================
-- 000002: CORE TABLES
-- Proline Gym — Foundation tables (gyms, profiles, disciplines, belts)
-- Supabase Auth handles users — we store extended profiles here
-- ============================================================

-- -----------------------------------------------------------
-- GYMS
-- -----------------------------------------------------------
CREATE TABLE gyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    address_ar TEXT,
    address_en TEXT,
    address_fr TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Lebanon',
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'Asia/Beirut',
    currency_preference VARCHAR(4) NOT NULL DEFAULT 'BOTH' CHECK (currency_preference IN ('USD', 'LBP', 'BOTH')),
    tvA_registration_number VARCHAR(50),
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- PROFILES (extends Supabase auth.users)
-- One profile per auth user. Role stored in user_roles junction table.
-- -----------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    first_name_ar VARCHAR(100),
    first_name_en VARCHAR(100),
    first_name_fr VARCHAR(100),
    last_name_ar VARCHAR(100),
    last_name_en VARCHAR(100),
    last_name_fr VARCHAR(100),
    phone VARCHAR(50),
    gender gender_enum,
    date_of_birth DATE,
    avatar_url TEXT,
    locale VARCHAR(5) DEFAULT 'ar' CHECK (locale IN ('ar', 'en', 'fr')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- USER ROLES (junction table — one user can have multiple roles)
-- -----------------------------------------------------------
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role, gym_id)
);

-- Helper function: get current user's role within their gym context
CREATE OR REPLACE FUNCTION get_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role::TEXT FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper function: get current user's gym_id
CREATE OR REPLACE FUNCTION get_user_gym_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT gym_id FROM profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------
-- STUDENTS (members)
-- -----------------------------------------------------------
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    medical_notes TEXT,
    join_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- COACHES
-- -----------------------------------------------------------
CREATE TABLE coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    specialization_ar VARCHAR(255),
    specialization_en VARCHAR(255),
    specialization_fr VARCHAR(255),
    bio_ar TEXT,
    bio_en TEXT,
    bio_fr TEXT,
    belt_rank belt_rank_enum,
    hourly_rate_usd NUMERIC(10,2),
    hourly_rate_lbp NUMERIC(15,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- GUARDIANS (parent-child relationship)
-- -----------------------------------------------------------
CREATE TABLE guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    relationship_ar VARCHAR(100),
    relationship_en VARCHAR(100),
    relationship_fr VARCHAR(100),
    is_primary_contact BOOLEAN NOT NULL DEFAULT false,
    can_pickup BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Junction table: guardian → student links
CREATE TABLE guardian_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (guardian_id, student_id)
);

-- -----------------------------------------------------------
-- DISCIPLINES (martial arts styles offered by a gym)
-- -----------------------------------------------------------
CREATE TABLE disciplines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    description_fr TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------
-- BELT HIERARCHIES (rank system per discipline)
-- -----------------------------------------------------------
CREATE TABLE belt_hierarchies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    rank belt_rank_enum NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL,
    stripe_count INTEGER DEFAULT 0,
    min_months_in_rank INTEGER,
    min_classes_attended INTEGER,
    is_black_belt BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (discipline_id, rank)
);

-- -----------------------------------------------------------
-- BELT PROMOTIONS (rank testing history)
-- -----------------------------------------------------------
CREATE TABLE belt_promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE SET NULL,
    discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
    belt_hierarchy_id UUID NOT NULL REFERENCES belt_hierarchies(id) ON DELETE RESTRICT,
    from_rank belt_rank_enum,
    to_rank belt_rank_enum NOT NULL,
    promotion_date DATE NOT NULL,
    notes_ar TEXT,
    notes_en TEXT,
    notes_fr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: quickly find a student's current belt
CREATE INDEX idx_belt_promotions_student_discipline ON belt_promotions(student_id, discipline_id, promotion_date DESC);
