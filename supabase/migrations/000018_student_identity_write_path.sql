-- ============================================================
-- 000018: STUDENT IDENTITY WRITE PATH (Cycle 5 / F1.1 / V1-F2)
-- PRO LINE Gym Platform
--
-- The add-student form was broken: it upserted columns that don't exist on
-- `students` and never created a `profiles` row. Students are normalized
-- (students.profile_id → profiles), and gym-managed members have NO auth login.
-- But profiles.id had a hard FK to auth.users, so a login-less member could not
-- get a profile.
--
-- This migration:
--   1. Lets a profile exist WITHOUT an auth user (drop the auth.users FK on
--      profiles.id; default it to gen_random_uuid()). Login users still get
--      profiles.id = auth.users.id via handle_new_user(); gym-managed members
--      get a fresh uuid. (We lose the ON DELETE CASCADE from auth.users — app
--      manages member lifecycle; acceptable for V1.)
--   2. Adds atomic, gym-scoped, staff-only RPCs to create/update a member
--      (profile + student row together).
-- ============================================================

-- -----------------------------------------------------------
-- 1. Allow login-less profiles
-- -----------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- -----------------------------------------------------------
-- 2. create_student — profile + student, atomic, staff-only, gym-scoped
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION create_student(
  p_first_name_ar         TEXT,
  p_first_name_en         TEXT,
  p_first_name_fr         TEXT,
  p_last_name_ar          TEXT,
  p_last_name_en          TEXT,
  p_last_name_fr          TEXT,
  p_phone                 TEXT,
  p_gender                gender_enum,
  p_date_of_birth         DATE,
  p_emergency_contact_name  TEXT,
  p_emergency_contact_phone TEXT,
  p_medical_notes         TEXT,
  p_join_date             DATE,
  p_current_belt_rank     belt_rank_enum
)
RETURNS students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym        UUID;
  v_profile_id UUID;
  v_student    students;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may add students';
  END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'No gym context for caller';
  END IF;

  INSERT INTO profiles (
    gym_id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, phone, gender, date_of_birth
  )
  VALUES (
    v_gym, p_first_name_ar, p_first_name_en, p_first_name_fr,
    p_last_name_ar, p_last_name_en, p_last_name_fr, p_phone, p_gender, p_date_of_birth
  )
  RETURNING id INTO v_profile_id;

  INSERT INTO students (
    profile_id, gym_id, emergency_contact_name, emergency_contact_phone,
    medical_notes, join_date, is_active, current_belt_rank
  )
  VALUES (
    v_profile_id, v_gym, p_emergency_contact_name, p_emergency_contact_phone,
    p_medical_notes, COALESCE(p_join_date, CURRENT_DATE), true, p_current_belt_rank
  )
  RETURNING * INTO v_student;

  RETURN v_student;
END;
$$;

GRANT EXECUTE ON FUNCTION create_student(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, gender_enum, DATE, TEXT, TEXT, TEXT, DATE, belt_rank_enum) TO authenticated;

-- -----------------------------------------------------------
-- 3. update_student — update both rows, staff-only, same-gym
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_student(
  p_student_id            UUID,
  p_first_name_ar         TEXT,
  p_first_name_en         TEXT,
  p_first_name_fr         TEXT,
  p_last_name_ar          TEXT,
  p_last_name_en          TEXT,
  p_last_name_fr          TEXT,
  p_phone                 TEXT,
  p_gender                gender_enum,
  p_date_of_birth         DATE,
  p_emergency_contact_name  TEXT,
  p_emergency_contact_phone TEXT,
  p_medical_notes         TEXT,
  p_join_date             DATE,
  p_current_belt_rank     belt_rank_enum
)
RETURNS students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym        UUID;
  v_profile_id UUID;
  v_student    students;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may edit students';
  END IF;
  v_gym := get_user_gym_id();

  SELECT profile_id INTO v_profile_id FROM students WHERE id = p_student_id AND gym_id = v_gym;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Student % not found in this gym', p_student_id;
  END IF;

  UPDATE profiles SET
    first_name_ar = p_first_name_ar, first_name_en = p_first_name_en, first_name_fr = p_first_name_fr,
    last_name_ar = p_last_name_ar, last_name_en = p_last_name_en, last_name_fr = p_last_name_fr,
    phone = p_phone, gender = p_gender, date_of_birth = p_date_of_birth, updated_at = NOW()
  WHERE id = v_profile_id;

  UPDATE students SET
    emergency_contact_name = p_emergency_contact_name,
    emergency_contact_phone = p_emergency_contact_phone,
    medical_notes = p_medical_notes,
    join_date = COALESCE(p_join_date, join_date),
    current_belt_rank = p_current_belt_rank,
    updated_at = NOW()
  WHERE id = p_student_id
  RETURNING * INTO v_student;

  RETURN v_student;
END;
$$;

GRANT EXECUTE ON FUNCTION update_student(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, gender_enum, DATE, TEXT, TEXT, TEXT, DATE, belt_rank_enum) TO authenticated;
