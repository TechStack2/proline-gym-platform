-- ============================================================
-- 000004: ROW LEVEL SECURITY POLICIES
-- Proline Gym — Supabase RLS policies for all tables
-- All tables have RLS ENABLED. Policies based on get_user_role() helper.
-- ============================================================

-- -----------------------------------------------------------
-- ENABLE RLS ON ALL TABLES
-- -----------------------------------------------------------
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE belt_hierarchies ENABLE ROW LEVEL SECURITY;
ALTER TABLE belt_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------
-- PATTERN: Staff roles (owner, head_coach, coach, receptionist)
--          get full access to gym-scoped tables
-- -----------------------------------------------------------

-- Helper: staff can access records in their own gym
CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT get_user_role() IN ('owner', 'head_coach', 'coach', 'receptionist');
$$;

-- --- POLICIES BY TABLE ---

-- gyms: staff read own gym
CREATE POLICY gyms_staff_own ON gyms FOR ALL
  USING (id = get_user_gym_id() AND is_staff());

-- profiles: staff read all in gym; self read own
CREATE POLICY profiles_staff_gym ON profiles FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY profiles_self ON profiles FOR ALL
  USING (id = auth.uid());

-- user_roles: staff manage; self read own
CREATE POLICY user_roles_staff ON user_roles FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY user_roles_self ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- students: staff all; student sees own; parent sees linked children
CREATE POLICY students_staff ON students FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY students_self ON students FOR SELECT
  USING (profile_id = auth.uid());
CREATE POLICY students_parent ON students FOR SELECT
  USING (
    get_user_role() = 'parent' AND
    id IN (SELECT student_id FROM guardian_students WHERE guardian_id IN
      (SELECT id FROM guardians WHERE profile_id = auth.uid()))
  );

-- coaches: staff all; coach sees own
CREATE POLICY coaches_staff ON coaches FOR ALL
  USING (gym_id = get_user_gym_id() AND get_user_role() IN ('owner', 'head_coach', 'receptionist'));
CREATE POLICY coaches_self ON coaches FOR ALL
  USING (profile_id = auth.uid());

-- guardians: staff all; self
CREATE POLICY guardians_staff ON guardians FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY guardians_self ON guardians FOR ALL
  USING (profile_id = auth.uid());

-- guardian_students: staff all; self guardian sees own links
CREATE POLICY guardian_students_staff ON guardian_students FOR ALL
  USING (EXISTS (SELECT 1 FROM guardians g WHERE g.id = guardian_id AND g.gym_id = get_user_gym_id() AND is_staff()));
CREATE POLICY guardian_students_self ON guardian_students FOR SELECT
  USING (guardian_id IN (SELECT id FROM guardians WHERE profile_id = auth.uid()));

-- disciplines: staff manage; all authenticated read
CREATE POLICY disciplines_staff ON disciplines FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY disciplines_read ON disciplines FOR SELECT
  USING (auth.role() = 'authenticated');

-- belt_hierarchies: staff manage; all authenticated read
CREATE POLICY belt_hierarchies_staff ON belt_hierarchies FOR ALL
  USING (EXISTS (SELECT 1 FROM disciplines d WHERE d.id = discipline_id AND d.gym_id = get_user_gym_id() AND is_staff()));
CREATE POLICY belt_hierarchies_read ON belt_hierarchies FOR SELECT
  USING (auth.role() = 'authenticated');

-- belt_promotions: staff manage; student sees own
CREATE POLICY belt_promotions_staff ON belt_promotions FOR ALL
  USING (is_staff());
CREATE POLICY belt_promotions_student ON belt_promotions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- classes: staff manage; all authenticated read
CREATE POLICY classes_staff ON classes FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY classes_read ON classes FOR SELECT
  USING (auth.role() = 'authenticated');

-- class_schedules: staff manage; all authenticated read
CREATE POLICY class_schedules_staff ON class_schedules FOR ALL
  USING (EXISTS (SELECT 1 FROM classes c WHERE c.id = class_id AND c.gym_id = get_user_gym_id() AND is_staff()));
CREATE POLICY class_schedules_read ON class_schedules FOR SELECT
  USING (auth.role() = 'authenticated');

-- class_enrollments: staff manage; student sees own
CREATE POLICY class_enrollments_staff ON class_enrollments FOR ALL
  USING (is_staff());
CREATE POLICY class_enrollments_self ON class_enrollments FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- attendance_records: staff all; coach sees own classes; student sees own
CREATE POLICY attendance_staff ON attendance_records FOR ALL
  USING (is_staff());
CREATE POLICY attendance_coach ON attendance_records FOR ALL
  USING (
    get_user_role() = 'coach' AND
    class_id IN (SELECT id FROM classes WHERE coach_id IN
      (SELECT id FROM coaches WHERE profile_id = auth.uid()))
  );
CREATE POLICY attendance_student ON attendance_records FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));
CREATE POLICY attendance_parent ON attendance_records FOR SELECT
  USING (
    get_user_role() = 'parent' AND
    student_id IN (SELECT student_id FROM guardian_students WHERE guardian_id IN
      (SELECT id FROM guardians WHERE profile_id = auth.uid()))
  );

-- membership_plans: staff manage; all authenticated read
CREATE POLICY membership_plans_staff ON membership_plans FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY membership_plans_read ON membership_plans FOR SELECT
  USING (auth.role() = 'authenticated');

-- student_memberships: staff all; student sees own
CREATE POLICY student_memberships_staff ON student_memberships FOR ALL
  USING (is_staff());
CREATE POLICY student_memberships_self ON student_memberships FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- invoices: staff all; student sees own; parent sees children's
CREATE POLICY invoices_staff ON invoices FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY invoices_student ON invoices FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));
CREATE POLICY invoices_parent ON invoices FOR SELECT
  USING (
    get_user_role() = 'parent' AND
    student_id IN (SELECT student_id FROM guardian_students WHERE guardian_id IN
      (SELECT id FROM guardians WHERE profile_id = auth.uid()))
  );

-- payments: staff all; student sees own
CREATE POLICY payments_staff ON payments FOR ALL
  USING (is_staff());
CREATE POLICY payments_student ON payments FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- exchange_rates: staff manage; all authenticated read
CREATE POLICY exchange_rates_staff ON exchange_rates FOR ALL
  USING (is_staff());
CREATE POLICY exchange_rates_read ON exchange_rates FOR SELECT
  USING (auth.role() = 'authenticated');

-- pt_packages: staff manage; all authenticated read
CREATE POLICY pt_packages_staff ON pt_packages FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY pt_packages_read ON pt_packages FOR SELECT
  USING (auth.role() = 'authenticated');

-- pt_sessions: staff all; coach sees own; student sees own
CREATE POLICY pt_sessions_staff ON pt_sessions FOR ALL
  USING (is_staff());
CREATE POLICY pt_sessions_coach ON pt_sessions FOR ALL
  USING (coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()));
CREATE POLICY pt_sessions_student ON pt_sessions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- external_coaches: staff manage; external sees own
CREATE POLICY external_coaches_staff ON external_coaches FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY external_coaches_self ON external_coaches FOR ALL
  USING (profile_id = auth.uid());

-- rentals: staff manage; all authenticated read
CREATE POLICY rentals_staff ON rentals FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY rentals_read ON rentals FOR SELECT
  USING (auth.role() = 'authenticated');

-- rental_bookings: staff all; external coach sees own
CREATE POLICY rental_bookings_staff ON rental_bookings FOR ALL
  USING (is_staff());
CREATE POLICY rental_bookings_external ON rental_bookings FOR ALL
  USING (external_coach_id IN (SELECT id FROM external_coaches WHERE profile_id = auth.uid()));

-- camps: staff manage; all authenticated read
CREATE POLICY camps_staff ON camps FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY camps_read ON camps FOR SELECT
  USING (auth.role() = 'authenticated');

-- camp_registrations: staff all; student sees own
CREATE POLICY camp_registrations_staff ON camp_registrations FOR ALL
  USING (is_staff());
CREATE POLICY camp_registrations_student ON camp_registrations FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- camp_attendance: staff all; student sees own
CREATE POLICY camp_attendance_staff ON camp_attendance FOR ALL
  USING (is_staff());
CREATE POLICY camp_attendance_student ON camp_attendance FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- leads: staff (owner, head_coach, receptionist) manage
CREATE POLICY leads_staff ON leads FOR ALL
  USING (gym_id = get_user_gym_id() AND get_user_role() IN ('owner', 'head_coach', 'receptionist'));

-- trial_classes: staff manage
CREATE POLICY trial_classes_staff ON trial_classes FOR ALL
  USING (is_staff());

-- documents: staff all; student sees own uploads; external coach sees own
CREATE POLICY documents_staff ON documents FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());
CREATE POLICY documents_student ON documents FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));
CREATE POLICY documents_external ON documents FOR SELECT
  USING (external_coach_id IN (SELECT id FROM external_coaches WHERE profile_id = auth.uid()));

-- message_logs: staff only
CREATE POLICY message_logs_staff ON message_logs FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());

-- audit_logs: owner + head_coach only
CREATE POLICY audit_logs_admin ON audit_logs FOR SELECT
  USING (get_user_role() IN ('owner', 'head_coach'));

-- notifications: self only
CREATE POLICY notifications_self ON notifications FOR ALL
  USING (user_id = auth.uid());
