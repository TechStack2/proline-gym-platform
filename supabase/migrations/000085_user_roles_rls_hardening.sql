-- ============================================================
-- 000085: USER-ROLES-RLS-HARDENING (SECURITY) — two RLS gaps
-- PRO LINE Gym Platform
--
-- (1) user_roles — the 000004 `user_roles_staff` policy is `FOR ALL` gated only by
--     `is_staff()`, so ANY staff member (incl. a receptionist) can DIRECTLY write
--     user_roles over PostgREST: it bypasses set_staff_active's deactivate guardrails
--     (000084) AND allows role-escalation (a receptionist self-assigning 'owner').
--     Split it: staff READ their own-gym roles; WRITE (INSERT/UPDATE/DELETE) is
--     restricted to gym admins (`is_gym_admin()` = owner/head_coach, 000084). The
--     invite/onboard/provisioning paths write via the service-role client, which
--     bypasses RLS entirely, so they are unaffected. set_staff_active (SECURITY
--     DEFINER) stays the sanctioned deactivate path. `user_roles_self` is untouched.
--
-- (2) class_schedules — the 000004 `class_schedules_read` policy is blanket
--     `auth.role() = 'authenticated'`, so ANY un-scoped SELECT leaks EVERY gym's
--     schedule (the systemic blanket-RLS leak; ATTENDANCE-GYM-SCOPE only patched one
--     query). Drop it; add a gym-scoped SELECT — a schedule is visible only when its
--     class is in the reader's own gym (staff AND members read their own gym). Anon
--     landing reads via the get_landing_* SECURITY DEFINER RPCs (000080) — untouched.
--     `class_schedules_staff` (the write path) is untouched.
--
-- Additive + idempotent (DROP POLICY IF EXISTS + CREATE POLICY). NO data change.
-- The referenced helpers (get_user_gym_id, is_staff, is_gym_admin) are the CURRENT
-- live SECURITY DEFINER bodies — they bypass RLS, so referencing user_roles inside a
-- user_roles policy does NOT recurse (the same pattern is_staff() already relied on).
-- ============================================================

-- ── (1) user_roles: split FOR ALL/is_staff() → staff READ + admin WRITE ──────
-- Idempotent: drop the old blanket policy AND the two replacements (CREATE POLICY has
-- no IF NOT EXISTS) so a re-run recreates cleanly.
DROP POLICY IF EXISTS user_roles_staff ON user_roles;
DROP POLICY IF EXISTS user_roles_staff_read ON user_roles;
DROP POLICY IF EXISTS user_roles_admin_write ON user_roles;

-- Staff read every role in their OWN gym (the unchanged read scope from 000004).
CREATE POLICY user_roles_staff_read ON user_roles FOR SELECT
  USING (gym_id = get_user_gym_id() AND is_staff());

-- Only gym admins (owner/head_coach) may WRITE roles, and only within their own gym.
-- FOR ALL also (redundantly) covers admin SELECT; non-admin staff have no write
-- policy → PostgREST writes match 0 rows / fail WITH CHECK. Service-role bypasses RLS.
CREATE POLICY user_roles_admin_write ON user_roles FOR ALL
  USING (gym_id = get_user_gym_id() AND is_gym_admin())
  WITH CHECK (gym_id = get_user_gym_id() AND is_gym_admin());

-- ── (2) class_schedules: blanket authenticated read → gym-scoped read ────────
DROP POLICY IF EXISTS class_schedules_read ON class_schedules;
DROP POLICY IF EXISTS class_schedules_gym_read ON class_schedules;

-- Staff + members read ONLY their own gym's schedules (a schedule's gym is its
-- class's gym). Mirrors class_schedules_staff's scoping, minus the is_staff() gate so
-- members read the schedule too. Anon uses get_landing_schedule (000080); an anon /
-- other-gym reader's get_user_gym_id() never matches, so nothing leaks.
CREATE POLICY class_schedules_gym_read ON class_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id AND c.gym_id = get_user_gym_id()
    )
  );
