-- ============================================================
-- 000089: AUTH-PRIMITIVES (SECURITY) — gym-scope the role helpers
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / AUTH-PRIMITIVES)
--
-- get_user_role() and is_gym_admin() resolve a caller's role from user_roles by
-- user_id ONLY — no gym predicate. So an identity holding roles in 2+ gyms bleeds
-- privileges across them: get_user_role() (LIMIT 1, no ORDER BY) returns an
-- ARBITRARY gym's role, and is_gym_admin() returns true if the user is owner/
-- head_coach in ANY gym. is_staff() calls get_user_role(), so dozens of staff-gated
-- RLS policies inherit the leak.
--
-- FIX: scope each to the caller's CURRENT gym — user_roles.gym_id = get_user_gym_id()
-- (= profiles.gym_id, SECURITY DEFINER, bypasses RLS → no recursion). The change is
-- the WHERE clause ONLY; signature / LANGUAGE / STABLE / SECURITY DEFINER /
-- search_path are byte-identical to the CURRENT live bodies (000084). CREATE OR
-- REPLACE preserves grants, so is_gym_admin keeps 000077's REVOKE PUBLIC / GRANT
-- authenticated and get_user_role keeps its default EXECUTE (000084 relied on the
-- same preservation — [[byte-exact-function-rewrite]] / [[function-rewrite-reverts-later-migrations]]).
--
-- Single-gym identities (the vast majority) are UNCHANGED: their one user_roles row
-- already has gym_id = profiles.gym_id, so the added predicate is always satisfied.
-- Only a multi-gym identity's cross-gym role bleed is closed. Additive + idempotent.
-- ============================================================

-- get_user_role() — 000084 body (SELECT role … WHERE user_id = auth.uid() AND
-- is_active LIMIT 1) + the gym predicate. is_staff() (get_user_role() IN (...))
-- inherits the scope automatically.
CREATE OR REPLACE FUNCTION get_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role::TEXT FROM user_roles
  WHERE user_id = auth.uid() AND is_active AND gym_id = get_user_gym_id()
  LIMIT 1;
$$;

-- is_gym_admin() — 000084 body (EXISTS … role IN ('owner','head_coach') AND
-- is_active) + the gym predicate → admin only in the caller's OWN gym.
CREATE OR REPLACE FUNCTION is_gym_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('owner', 'head_coach') AND is_active AND gym_id = get_user_gym_id()
  );
$$;
