-- ============================================================
-- 000036: LANDING PUBLISH SWITCH (V1 / ADM-1)
-- PRO LINE Gym Platform
--
-- Problem: the 000035 anon catalog policies expose EVERY active class of an
-- active gym, so a class becomes publicly visible on the landing the moment
-- staff create it — there is no staging. ADM-1 adds an explicit, staff-flipped
-- publish switch:
--
--   classes.show_on_landing BOOLEAN NOT NULL DEFAULT false
--
-- and TIGHTENS (never widens) the anon read path: `classes_public_read` and
-- `is_public_class()` (which gates `class_schedules_public_read`) additionally
-- require the flag. Logged-in/staff visibility is untouched — the flag controls
-- ONLY the public landing. Disciplines/membership_plans anon policies unchanged.
--
-- The e2e seed gym's class is published (the LP anon test keeps proving the
-- public read path); seed_e2e_gym is RENAMED to seed_e2e_gym_base and wrapped
-- rather than re-created, so the 200-line seed body isn't duplicated here.
-- ============================================================

-- 1) The switch. Default false: new classes are STAGED until staff publish.
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT false;

-- 2) Tighten the anon class read (000035): active + active gym + PUBLISHED.
DROP POLICY IF EXISTS classes_public_read ON classes;
CREATE POLICY classes_public_read ON classes FOR SELECT TO anon
  USING (is_active AND show_on_landing AND is_active_gym(gym_id));

-- 3) Tighten the schedules gate the same way (class_schedules_public_read
--    delegates to this SECURITY DEFINER check).
CREATE OR REPLACE FUNCTION is_public_class(p_class_id UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c
    JOIN gyms g ON g.id = c.gym_id
    WHERE c.id = p_class_id AND c.is_active AND c.show_on_landing AND g.is_active
  );
$$;
REVOKE ALL ON FUNCTION is_public_class(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_public_class(UUID) TO anon, authenticated;

-- 4) e2e seed: publish the seeded class. Wrap the existing seeder instead of
--    duplicating it (idempotent: the base returns the existing gym id on
--    re-run, and the UPDATE is a no-op the second time).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_base') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym UUID;
BEGIN
  v_gym := seed_e2e_gym_base(p_slug, p_password);
  -- ADM-1: the run gym's seeded class is published so the anon landing test
  -- exercises the post-switch public read path.
  UPDATE classes SET show_on_landing = true WHERE gym_id = v_gym AND show_on_landing = false;
  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
