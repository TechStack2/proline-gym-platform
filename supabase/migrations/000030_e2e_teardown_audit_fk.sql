-- ============================================================
-- 000030: FIX e2e teardown ordering (Cycle 5 / Test-Infra hardening)
-- PRO LINE Gym Platform
--
-- 000029's teardown deleted the run-scoped auth.users BEFORE the gym, and the
-- delete was blocked by audit_logs.changed_by_fkey: the suite's writes create
-- audit_logs rows referencing those users, and audit_logs has no gym_id so the
-- gym CASCADE doesn't clear them. Reorder: drop the GYM first (CASCADE clears
-- notifications/leads/students/classes/… and gym-scoped user_roles), then clear
-- the run users' remaining audit_logs rows (the only non-gym-scoped FK to them),
-- then delete the users. Same fix in the stale-sweep.
-- ============================================================

CREATE OR REPLACE FUNCTION sweep_stale_e2e_gyms(p_hours INTEGER DEFAULT 2)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, slug FROM gyms
    WHERE slug LIKE 'e2e-%' AND created_at < now() - make_interval(hours => p_hours)
  LOOP
    DELETE FROM gyms WHERE id = r.id; -- CASCADE clears profiles/students/classes/notifications/...
    DELETE FROM audit_logs WHERE changed_by IN (
      SELECT id FROM auth.users WHERE email LIKE '%+' || r.slug || '@e2e.local'
    );
    DELETE FROM auth.users WHERE email LIKE '%+' || r.slug || '@e2e.local';
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sweep_stale_e2e_gyms(INTEGER) FROM PUBLIC;

CREATE OR REPLACE FUNCTION teardown_e2e_gym(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Gym first: CASCADE clears profiles/students/classes/notifications/leads/...
  -- and the gym-scoped user_roles.
  DELETE FROM gyms WHERE slug = p_slug;
  -- audit_logs has no gym_id and FKs auth.users(changed_by) with NO ACTION — it
  -- is the only thing still referencing the run users after the gym is gone.
  DELETE FROM audit_logs WHERE changed_by IN (
    SELECT id FROM auth.users WHERE email LIKE '%+' || p_slug || '@e2e.local'
  );
  DELETE FROM auth.users WHERE email LIKE '%+' || p_slug || '@e2e.local';
  PERFORM sweep_stale_e2e_gyms(2);
END;
$$;
REVOKE ALL ON FUNCTION teardown_e2e_gym(TEXT) FROM PUBLIC;
