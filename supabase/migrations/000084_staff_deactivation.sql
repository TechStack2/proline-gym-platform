-- ============================================================
-- 000084: STAFF-MGMT — deactivate staff access (retire without deleting history)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / STAFF-MGMT)
--
-- A retired staff member must lose LOGIN/ACCESS without deleting their record (and
-- its history / FKs). Add a per-role active flag on user_roles and gate the access
-- primitives on it, so a deactivated staffer fails EVERY staff-gated RLS policy.
--
-- AUTH GATE (auditor-approved): get_user_role() returns the role only for an ACTIVE
-- user_roles row → is_staff() (which calls get_user_role) inherits it automatically.
-- is_gym_admin() reads user_roles DIRECTLY (not via get_user_role), so it gets the
-- same `AND is_active` gate here. get_user_gym_id() reads profiles (unchanged) — so
-- member-side policies are untouched; only the STAFF gate flips.
--
-- Both CREATE OR REPLACEs are based on the CURRENT live bodies (get_user_role:
-- 000002; is_gym_admin: 000077) + only the `AND is_active` predicate —
-- [[function-rewrite-reverts-later-migrations]]. Additive + idempotent; replay-clean.
-- ============================================================

-- 1. The flag — per (user, role, gym). DEFAULT true → every existing staff stays
--    active; only an explicit deactivate flips it. NOT NULL.
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Gate get_user_role() on is_active (000002 body + the predicate). is_staff()
--    (000004: get_user_role() IN (...)) inherits this → deactivated = not staff.
CREATE OR REPLACE FUNCTION get_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role::TEXT FROM user_roles
  WHERE user_id = auth.uid() AND is_active
  LIMIT 1;
$$;

-- 3. is_gym_admin() reads user_roles directly → gate it too (000077 body + predicate),
--    else a deactivated owner/head_coach would keep admin write power.
CREATE OR REPLACE FUNCTION is_gym_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('owner', 'head_coach') AND is_active
  );
$$;

-- 4. The sanctioned deactivate/reactivate control. SECURITY DEFINER so the guardrails
--    live in ONE place (not spread across RLS). GUARDS:
--      · caller must be owner/head_coach (is_gym_admin) — a receptionist/coach cannot;
--      · target must be a STAFF member in the caller's OWN gym (no cross-tenant);
--      · you cannot deactivate YOURSELF;
--      · you cannot deactivate the LAST active owner (the gym must keep an owner).
--    Reactivation (p_active = true) skips the last-owner check. RAISEs (not silent).
CREATE OR REPLACE FUNCTION set_staff_active(p_user_id UUID, p_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_gym    UUID;
  v_target_gym    UUID;
  v_target_owner  BOOLEAN;
  v_active_owners INT;
BEGIN
  IF NOT is_gym_admin() THEN
    RAISE EXCEPTION 'forbidden: only owner/head_coach may manage staff access' USING ERRCODE = '42501';
  END IF;
  v_caller_gym := get_user_gym_id();

  -- Target must be a staff member in the caller's gym.
  SELECT gym_id, bool_or(role = 'owner')
    INTO v_target_gym, v_target_owner
  FROM user_roles
  WHERE user_id = p_user_id AND gym_id = v_caller_gym
    AND role IN ('owner', 'head_coach', 'coach', 'receptionist')
  GROUP BY gym_id;

  IF v_target_gym IS NULL THEN
    RAISE EXCEPTION 'target is not a staff member of your gym' USING ERRCODE = '42501';
  END IF;

  IF p_active = false AND p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot deactivate yourself' USING ERRCODE = '42501';
  END IF;

  IF p_active = false AND v_target_owner THEN
    SELECT count(*) INTO v_active_owners
    FROM user_roles
    WHERE gym_id = v_caller_gym AND role = 'owner' AND is_active;
    IF v_active_owners <= 1 THEN
      RAISE EXCEPTION 'you cannot deactivate the last active owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE user_roles SET is_active = p_active
  WHERE user_id = p_user_id AND gym_id = v_caller_gym
    AND role IN ('owner', 'head_coach', 'coach', 'receptionist');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION set_staff_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_staff_active(UUID, BOOLEAN) TO authenticated;
