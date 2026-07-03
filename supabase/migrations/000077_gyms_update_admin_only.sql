-- ============================================================
-- 000077: ERROR-HARDEN — gyms UPDATE is owner/head_coach-only (pre-approved RLS)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / ERROR-HARDEN #4)
--
-- 000004's `gyms_staff_own ON gyms FOR ALL USING (id = get_user_gym_id() AND
-- is_staff())` let ANY staff — including a receptionist — UPDATE gym settings
-- (branding, tax rate, WhatsApp config pointers, renewal windows…). Tighten:
--   · SELECT stays staff-wide (dashboards/settings reads unchanged).
--   · UPDATE becomes owner/head_coach-only.
--   · The FOR ALL INSERT/DELETE grants are dropped entirely (no staff flow
--     creates or deletes gyms; provisioning is service-role).
-- PRE-APPROVED by the auditor (the one RLS change in this slice).
--
-- The role check is a SECURITY DEFINER helper (the is_staff()/get_user_gym_id()
-- 000004 pattern) so it never depends on user_roles' own RLS visibility.
-- ============================================================

CREATE OR REPLACE FUNCTION is_gym_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('owner', 'head_coach')
  );
$$;
REVOKE ALL ON FUNCTION is_gym_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_gym_admin() TO authenticated;

-- Replace the over-broad FOR ALL policy.
DROP POLICY IF EXISTS gyms_staff_own ON gyms;

-- Reads: unchanged breadth — any staff member sees their own gym.
CREATE POLICY gyms_staff_read ON gyms FOR SELECT
  USING (id = get_user_gym_id() AND is_staff());

-- Writes: owner/head_coach only, own gym (USING gates the target row,
-- WITH CHECK the written row — same predicate; the gym id never changes).
CREATE POLICY gyms_admin_update ON gyms FOR UPDATE
  USING (id = get_user_gym_id() AND is_gym_admin())
  WITH CHECK (id = get_user_gym_id() AND is_gym_admin());
