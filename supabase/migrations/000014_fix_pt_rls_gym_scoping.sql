-- ============================================================
-- 000014: FIX PT_SESSIONS + PT_ASSIGNMENTS RLS GYM-SCOPING
-- PRO LINE Gym — Phase C Refinements (Prompt 17)
-- 
-- Fixes MEDIUM severity items: pt_sessions and pt_assignments
-- staff policies used bare is_staff() without gym_id verification
-- via the pt_packages FK chain. Pattern follows 000013 which fixed
-- rental_bookings, and 000011 which fixed 8 junction tables.
-- ============================================================

-- ─── pt_sessions: Drop bare staff policy, recreate with gym scoping ───
-- Original (000004): USING (is_staff()) — no gym verification
-- New: validate gym_id via pt_packages FK chain
DROP POLICY IF EXISTS pt_sessions_staff ON pt_sessions;

CREATE POLICY pt_sessions_staff_gym ON pt_sessions
  FOR ALL
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM pt_packages
      WHERE pt_packages.id = pt_sessions.package_id
      AND pt_packages.gym_id = get_user_gym_id()
    )
  );

-- ─── pt_assignments: Drop existing staff policy, recreate with gym scoping ───
-- Original (000012): already had gym scoping via pt_packages FK chain
-- Recreated here for audit consistency with the exact pattern used in 000013
DROP POLICY IF EXISTS pt_assignments_staff ON pt_assignments;

CREATE POLICY pt_assignments_staff_gym ON pt_assignments
  FOR ALL
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM pt_packages
      WHERE pt_packages.id = pt_assignments.package_id
      AND pt_packages.gym_id = get_user_gym_id()
    )
  );

-- NOTE: Coach and student policies on both tables are left unchanged;
-- they were already correctly scoped to the individual's identity.
