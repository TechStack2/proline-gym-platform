-- ============================================================
-- 000069: RLS-ISOLATION — pt_sessions gym-scoping via the coaches FK chain
-- Gym 360 Platform · tenant-isolation hardening (RLS-ISOLATION slice)
--
-- WHY. pt_sessions' staff policy was gym-scoped through the pt_packages FK
-- chain (000014). But package_id is NULLABLE (`ON DELETE SET NULL`, and
-- booking-created sessions may carry none), so that chain cannot gym-govern
-- every row — a hole in cross-tenant isolation. coach_id is NOT NULL (every
-- session has a coach), so scope through coaches.gym_id instead: always
-- resolvable, and the same *_staff_gym pattern 000011/000013/000014 use.
--
-- The coach- and student-self policies (000004) are already correctly
-- self-scoped (own coach_id / own student_id) and are left untouched.
-- Additive, idempotent, replay-clean.
-- ============================================================

-- Drop BOTH historical staff-policy names defensively (000004's bare is_staff()
-- and 000014's pt_packages-chain), then recreate a single coaches-chain scope.
DROP POLICY IF EXISTS pt_sessions_staff_gym ON pt_sessions;
DROP POLICY IF EXISTS pt_sessions_staff ON pt_sessions;

CREATE POLICY pt_sessions_staff_gym ON pt_sessions
  FOR ALL
  USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = pt_sessions.coach_id
        AND c.gym_id = get_user_gym_id()
    )
  );
