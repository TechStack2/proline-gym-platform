-- ============================================================
-- 000053: ON-1 — teardown also removes ADOPTED auth users (V1 / ON-1)
-- PRO LINE Gym Platform
--
-- ON-1 invites create GoTrue auth users with id = the member/coach's EXISTING
-- profile id, credentialed by PHONE (no @e2e.local email). The 000030 teardown
-- only deleted run users by the email pattern and dropped the gym FIRST — so an
-- adopted user (phone-only) would survive the gym cascade as an ORPHAN auth row
-- (000018 removed profiles.id → auth.users, so nothing cascades it).
--
-- Fix: capture the run gym's profile ids BEFORE the gym delete, then delete
-- those auth.users by id (covers ON-1 adoptions AND the role logins, whose auth
-- id also equals their profile id). The email-pattern delete stays as belt-and-
-- suspenders. This is the spike §7c rollback applied at teardown: deleting the
-- auth user reverts the member to login-less; here the profile is dropped with
-- the gym anyway. No orphan auth users for the run gym.
-- ============================================================

CREATE OR REPLACE FUNCTION teardown_e2e_gym(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym  UUID;
  v_uids UUID[];
BEGIN
  SELECT id INTO v_gym FROM gyms WHERE slug = p_slug;
  -- Capture adopted auth users (auth.id = run-gym profile id) before the cascade.
  IF v_gym IS NOT NULL THEN
    SELECT array_agg(p.id) INTO v_uids FROM profiles p WHERE p.gym_id = v_gym;
  END IF;

  -- Gym first: CASCADE clears profiles/students/classes/notifications/leads/
  -- campaigns/... and the gym-scoped user_roles.
  DELETE FROM gyms WHERE slug = p_slug;

  -- audit_logs has no gym_id and FKs auth.users(changed_by) NO ACTION.
  IF v_uids IS NOT NULL AND array_length(v_uids, 1) IS NOT NULL THEN
    DELETE FROM audit_logs WHERE changed_by = ANY(v_uids);
    DELETE FROM auth.users WHERE id = ANY(v_uids); -- ON-1 adoptions + role logins
  END IF;
  DELETE FROM audit_logs WHERE changed_by IN (
    SELECT id FROM auth.users WHERE email LIKE '%+' || p_slug || '@e2e.local'
  );
  DELETE FROM auth.users WHERE email LIKE '%+' || p_slug || '@e2e.local';

  PERFORM sweep_stale_e2e_gyms(2);
END;
$$;
