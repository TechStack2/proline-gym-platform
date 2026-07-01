-- ============================================================
-- 000070: RLS-ISOLATION — audit_logs gym scoping
-- Gym 360 Platform · tenant-isolation hardening (RLS-ISOLATION slice)
--
-- WHY. audit_logs (000003) has NO gym_id, and its SELECT policy (000004
-- `audit_logs_admin`) checks ROLE only — get_user_role() IN ('owner',
-- 'head_coach') — so a head_coach in gym A could read EVERY gym's audit
-- trail. Add gym_id, backfill it from the actor's profile gym (via
-- changed_by), auto-populate it on new inserts, and require
-- gym_id = get_user_gym_id() in the read policy.
--
-- Populate on insert via a BEFORE INSERT trigger so the many existing audit
-- writers (audit_trigger_fn + explicit INSERTs in 000027/000031/000034/
-- 000063/000064/…) stay UNCHANGED. Additive, idempotent, replay-clean.
-- ============================================================

-- 1) Column (nullable): system rows with no actor (changed_by NULL) stay
--    gym-less and are therefore invisible to tenant admins — the safe default
--    (a gym-less row can never leak across tenants).
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_audit_logs_gym ON audit_logs(gym_id, created_at DESC);

-- 2) Auto-fill gym_id on insert from the actor's (changed_by) profile gym.
--    SECURITY DEFINER so it can read profiles regardless of the writer's context.
CREATE OR REPLACE FUNCTION audit_logs_set_gym() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.gym_id IS NULL AND NEW.changed_by IS NOT NULL THEN
    SELECT gym_id INTO NEW.gym_id FROM profiles WHERE id = NEW.changed_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_set_gym ON audit_logs;
CREATE TRIGGER trg_audit_logs_set_gym
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_set_gym();

-- 3) Backfill existing rows from the actor's profile gym.
UPDATE audit_logs a
SET gym_id = p.gym_id
FROM profiles p
WHERE a.changed_by = p.id
  AND a.gym_id IS NULL;

-- 4) Tenant-scope the read policy: role AND same gym (was role-only).
DROP POLICY IF EXISTS audit_logs_admin ON audit_logs;
CREATE POLICY audit_logs_admin ON audit_logs FOR SELECT
  USING (
    get_user_role() IN ('owner', 'head_coach')
    AND gym_id = get_user_gym_id()
  );
