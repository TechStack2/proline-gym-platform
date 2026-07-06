-- ============================================================
-- CI GUARD (CATALOG-SCOPE / migration 000088) — no cross-tenant blanket RLS ships again
--
-- Runs against the from-zero replayed DB (.github/workflows/db-replay-check.yml). FAILS
-- the job if any RLS policy on a PUBLIC-schema table that HAS a `gym_id` column exposes
-- reads with a ROLE-ONLY `auth.role() = 'authenticated'` qual and NO gym predicate —
-- the exact blanket-RLS leak class fixed across 000085 (class_schedules) and 000088
-- (the 6 catalog tables). This is occurrence-#5 insurance: a new gym_id-bearing table
-- that copy-pastes the old `<t>_read` blanket policy turns this job RED before merge.
--
-- WHY it will not false-positive on legitimate policies:
--   • Only SELECT / ALL policies are candidates (their USING/qual governs row reads).
--   • Only tables that actually carry a `gym_id` column are candidates.
--   • Gym-scoped policies (qual references gym_id / get_user_gym_id) pass.
--   • Ownership policies (qual references auth.uid — member/coach/parent self-reads)
--     are not role-only, so they pass; they need no allowlist entry.
--   • is_staff()-only policies are not role-only either (qual is `is_staff()`), so they
--     are out of THIS guard's stated scope.
--   • belt_hierarchies / class_schedules have NO gym_id column (they scope via a parent
--     FK → disciplines/classes.gym_id), so they are out of this column-based guard by
--     construction; their scoping is asserted by the e2e catalog-scope specs instead.
--
-- ALLOWLIST (tablename) — each an INTENTIONAL, reviewed exception (none carries a
-- gym_id column TODAY, so each is also excluded by the column filter — listed for
-- documentation + forward-safety):
--   • exchange_rates  — GLOBAL rate table (no gym_id). Listed so that when FX-PER-GYM
--                       adds a gym_id column, a transient window can't wedge CI before
--                       that migration scopes exchange_rates_read itself.
--   • gyms            — the tenant table itself (key is `id`, no gym_id column); its
--                       visibility is by membership, not a gym_id predicate.
--   • platform_admins — the vendor CROSS-gym super-role table (is_platform_admin,
--                       000082); deliberately not gym-scoped, no gym_id column.
-- (profiles-adjacent tables whose predicate is auth.uid ownership need NO allowlist —
--  an auth.uid qual is not role-only, so the guard already passes them.)
-- ============================================================

\echo '── CATALOG-SCOPE guard — SELECT/ALL policies on gym_id-bearing public tables ──'
SELECT p.tablename,
       p.policyname,
       p.cmd,
       CASE
         WHEN p.qual LIKE '%get_user_gym_id%' OR p.qual LIKE '%gym_id%' THEN 'gym-scoped'
         WHEN p.qual LIKE '%auth.uid%'                                    THEN 'ownership-scoped'
         WHEN p.qual LIKE '%auth.role()%'                                 THEN '*** ROLE-ONLY (LEAK) ***'
         ELSE 'other'
       END AS verdict,
       p.qual
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.cmd IN ('SELECT', 'ALL')
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'gym_id'
  )
ORDER BY p.tablename, p.policyname;

DO $$
DECLARE
  v_count int;
  v_list  text;
BEGIN
  SELECT count(*), string_agg(p.tablename || '.' || p.policyname, ', ' ORDER BY p.tablename)
    INTO v_count, v_list
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('SELECT', 'ALL')
    AND p.qual IS NOT NULL
    AND p.qual LIKE '%auth.role()%'          -- role-only blanket (the occurrence #1-5 pattern)
    AND p.qual NOT LIKE '%gym_id%'           -- no direct gym predicate
    AND p.qual NOT LIKE '%get_user_gym_id%'  -- no gym-scoping helper
    AND p.qual NOT LIKE '%auth.uid%'         -- not ownership-scoped
    AND p.tablename NOT IN ('exchange_rates', 'gyms', 'platform_admins')  -- reviewed exceptions
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'gym_id'
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION E'CATALOG-SCOPE guard FAILED: % gym_id-bearing public table(s) expose a role-only authenticated read with no gym predicate:\n  %\nScope each policy USING (gym_id = get_user_gym_id()) — see migrations 000088 / 000085.', v_count, v_list;
  END IF;

  RAISE NOTICE 'CATALOG-SCOPE guard PASSED — no gym_id-bearing public table carries a role-only authenticated read policy.';
END $$;
