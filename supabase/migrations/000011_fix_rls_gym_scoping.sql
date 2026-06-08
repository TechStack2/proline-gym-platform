-- ============================================================
-- 000011: FIX RLS GYM-SCOPING FOR JUNCTION TABLES + INDEXES
-- PRO LINE Gym — Phase C Refinements
-- 
-- Fixes MEDIUM severity issue: 8 junction tables had is_staff()
-- policies without gym ownership verification via FK chains.
-- Also adds 7 recommended composite indexes for performance.
-- ============================================================

-- Enable pg_trgm extension for text-search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- RLS GYM-SCOPING FIXES
-- 
-- Pattern: Drop existing broad staff policy, recreate with
-- gym verification through the appropriate FK chain.
-- Student/self policies are untouched — only staff policies
-- need gym scoping added.
-- get_user_gym_id() and is_staff() both defined in prior migrations.
-- ============================================================

-- -----------------------------------------------------------
-- 1. belt_promotions → disciplines.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS belt_promotions_staff ON belt_promotions;
CREATE POLICY belt_promotions_staff_gym ON belt_promotions FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM disciplines d
      WHERE d.id = discipline_id AND d.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 2. class_enrollments → classes.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS class_enrollments_staff ON class_enrollments;
CREATE POLICY class_enrollments_staff_gym ON class_enrollments FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id AND c.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 3. attendance_records → classes.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS attendance_staff ON attendance_records;
CREATE POLICY attendance_staff_gym ON attendance_records FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id AND c.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 4. student_memberships → students.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS student_memberships_staff ON student_memberships;
CREATE POLICY student_memberships_staff_gym ON student_memberships FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = student_id AND s.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 5. payments → invoices → students.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS payments_staff ON payments;
CREATE POLICY payments_staff_gym ON payments FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN students s ON s.id = i.student_id
      WHERE i.id = invoice_id AND s.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 6. camp_registrations → camps.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS camp_registrations_staff ON camp_registrations;
CREATE POLICY camp_registrations_staff_gym ON camp_registrations FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM camps c
      WHERE c.id = camp_id AND c.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 7. camp_attendance → camps.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS camp_attendance_staff ON camp_attendance;
CREATE POLICY camp_attendance_staff_gym ON camp_attendance FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM camps c
      WHERE c.id = camp_id AND c.gym_id = get_user_gym_id()
    )
  );

-- -----------------------------------------------------------
-- 8. trial_classes → classes.gym_id
-- -----------------------------------------------------------
DROP POLICY IF EXISTS trial_classes_staff ON trial_classes;
CREATE POLICY trial_classes_staff_gym ON trial_classes FOR ALL
  USING (
    is_staff() AND
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id AND c.gym_id = get_user_gym_id()
    )
  );

-- ============================================================
-- PERFORMANCE INDEXES FOR PHASE C MODULES
-- ============================================================

-- Lead pipeline: filter by gym + status
CREATE INDEX IF NOT EXISTS idx_leads_gym_status ON leads(gym_id, status);

-- Lead search: text-search on first_name for walk-in / inquiry lookup
CREATE INDEX IF NOT EXISTS idx_leads_name_search ON leads USING gin(first_name gin_trgm_ops);

-- Student roster: active members per gym
CREATE INDEX IF NOT EXISTS idx_students_gym_active ON students(gym_id, is_active);

-- Belt promotions: chronological history
CREATE INDEX IF NOT EXISTS idx_belt_promotions_date ON belt_promotions(promotion_date DESC);

-- Camps: date-range scan per gym
CREATE INDEX IF NOT EXISTS idx_camps_gym_dates ON camps(gym_id, start_date);

-- PT packages: per-gym lookup
CREATE INDEX IF NOT EXISTS idx_pt_packages_gym ON pt_packages(gym_id);

-- Rentals: per-gym lookup
CREATE INDEX IF NOT EXISTS idx_rentals_gym ON rentals(gym_id);

-- Rental booking conflict detection (complements existing unique partial index)
CREATE INDEX IF NOT EXISTS idx_rental_bookings_conflict ON rental_bookings(rental_id, start_time);
