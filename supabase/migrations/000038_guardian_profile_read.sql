-- ============================================================
-- 000038: B3 follow-up — guardians can read their LINKED KIDS' profiles
-- PRO LINE Gym Platform
--
-- 000037 granted guardians link-based SELECT on the kids' operational rows
-- (students/registrations/attendance/invoices/payments/belts) but NOT on
-- PROFILES — and profiles is where the kid's NAME lives (profiles RLS was
-- staff-gym + self only). Result, caught by the B3 e2e: the guardian portal
-- rendered kid chips with EMPTY names (the nested profiles embed returned
-- null under RLS). Additive fix: a SECURITY DEFINER helper mapping
-- profile → linked-kid, and one SELECT policy. A guardian can read ONLY the
-- profile rows of students they are linked to — no other member, no staff,
-- nothing else on profiles changes.
-- ============================================================

CREATE OR REPLACE FUNCTION is_guardian_of_profile(p_profile_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM students s
    JOIN guardian_students gs ON gs.student_id = s.id
    JOIN guardians g ON g.id = gs.guardian_id
    WHERE s.profile_id = p_profile_id
      AND g.profile_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION is_guardian_of_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_guardian_of_profile(UUID) TO authenticated;

DROP POLICY IF EXISTS profiles_guardian_kid ON profiles;
CREATE POLICY profiles_guardian_kid ON profiles FOR SELECT
  USING (is_guardian_of_profile(id));
