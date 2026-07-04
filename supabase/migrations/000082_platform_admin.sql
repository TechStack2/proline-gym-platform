-- ============================================================
-- 000082: PLATFORM ADMIN — the vendor super-role (WL-ONBOARDING-WIZARD)
-- PRO LINE Gym Platform / "Gym 360 Pro"
--
-- Introduces a NEW platform-admin access primitive so the VENDOR (not any gym's
-- staff) can onboard gym #2+. SUPER-ADMIN ONLY — never public self-serve.
--
-- SECURITY MODEL (there is NO path for a user to self-grant):
--   · platform_admins is seeded ONLY by service_role (the auditor in prod, the
--     e2e its own fixture). No anon/authenticated INSERT grant AND no permissive
--     write policy → with RLS on, only the RLS-exempt service_role can write.
--   · is_platform_admin() is the gate — SECURITY DEFINER so it reads the table
--     regardless of that table's own RLS (no recursion; the definer bypasses RLS).
--     Returns FALSE for anon (auth.uid() is null) and every non-admin. Granted to
--     anon+authenticated so the gated route/action can call it and be denied.
--   · The table is readable ONLY by platform admins (self-referential via the
--     gate) — a non-admin/anon sees zero rows.
--
-- ADDITIVE + idempotent; replay-clean. Models is_gym_admin() (000077).
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- The super-role gate. STABLE SECURITY DEFINER SET search_path=public.
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO anon, authenticated;

-- Table privileges. Explicit REVOKE first (cloud auto-grants ALL on new public
-- tables via default privileges; the local stack does not — cover both). anon: no
-- grant at all. authenticated: SELECT only (RLS then narrows to admins). NO
-- INSERT/UPDATE/DELETE to anon/authenticated → no self-grant path. service_role
-- (RLS-exempt) does the privileged seed writes.
REVOKE ALL ON platform_admins FROM anon, authenticated;
GRANT SELECT ON platform_admins TO authenticated;
GRANT ALL ON platform_admins TO service_role;

-- Reads: ONLY platform admins can see the table (self-referential via the gate).
-- There is deliberately NO write policy — RLS is on and no permissive
-- INSERT/UPDATE/DELETE policy exists, so only service_role can write.
DROP POLICY IF EXISTS platform_admins_self_read ON platform_admins;
CREATE POLICY platform_admins_self_read ON platform_admins FOR SELECT
  USING (is_platform_admin());
