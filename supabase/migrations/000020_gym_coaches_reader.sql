-- ============================================================
-- 000020: GYM COACHES READER (Cycle 5 / Phase 1 / Prompt 22-R)
-- PRO LINE Gym Platform
--
-- 22-R re-validation exposed: on the student PT page, the "preferred coach"
-- dropdown was EMPTY. Confirmed cause (V1-F3 discipline): `coaches` RLS is
-- staff-all + coach-self only (000004) — a STUDENT has no read on coaches, and
-- also can't read coaches' profiles. So the student-facing request UI could
-- never show a coach to choose.
--
-- Fix (PT-slice-scoped, same pattern as get_coach_pt_roster — a definer reader,
-- NOT a broad RLS policy): expose only id + first names of ACTIVE coaches in the
-- caller's own gym. Read-only; gym-scoped via get_user_gym_id().
-- Forward-only, idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION get_gym_coaches()
RETURNS TABLE (
  id              UUID,
  first_name_ar   TEXT,
  first_name_en   TEXT,
  first_name_fr   TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, p.first_name_ar, p.first_name_en, p.first_name_fr
  FROM coaches c
  JOIN profiles p ON p.id = c.profile_id
  WHERE c.is_active = true
    AND c.gym_id = get_user_gym_id()
  ORDER BY p.first_name_en;
$$;

GRANT EXECUTE ON FUNCTION get_gym_coaches() TO authenticated;
