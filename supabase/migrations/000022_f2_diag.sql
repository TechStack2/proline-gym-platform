-- ============================================================
-- 000022: F2-A TEMP DIAGNOSTIC — capture auth-context values
-- PRO LINE Gym Platform — Cycle 5 / Phase 0 / Prompt F2 (Workstream A)
--
-- TEMPORARY. SECURITY INVOKER so the body runs as the *caller's* role
-- (`authenticated`) inside the live Server-Action session — this is the only
-- way to observe auth.uid()/is_staff()/get_user_gym_id() AS THE REQUEST SEES
-- THEM (the Management API admin context has auth.uid()=NULL).
-- Removed before the final commit.
-- ============================================================
CREATE OR REPLACE FUNCTION f2_diag(p_user_id UUID, p_gym UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT json_build_object(
    'auth_uid',           auth.uid(),
    'is_staff',           is_staff(),
    'get_user_gym_id',    get_user_gym_id(),
    'arg_user_id',        p_user_id,
    'arg_gym_id',         p_gym,
    'recipient_in_gym',   recipient_in_gym(p_user_id, p_gym),
    'profile_exists',     EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id),
    'profile_gym_id',     (SELECT gym_id FROM profiles WHERE id = p_user_id),
    'gym_matches',        (SELECT gym_id FROM profiles WHERE id = p_user_id) = p_gym
  );
$$;

GRANT EXECUTE ON FUNCTION f2_diag(UUID, UUID) TO authenticated;
