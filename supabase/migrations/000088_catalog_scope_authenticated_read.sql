-- ============================================================
-- 000088: CATALOG-SCOPE (SECURITY, P0) — close the cross-tenant catalog read leak
-- PRO LINE Gym Platform
--
-- The 000004 `<table>_read` SELECT policies on the shared catalog tables are blanket
-- `auth.role() = 'authenticated'` with NO gym predicate, so ANY authenticated user's
-- un-scoped SELECT (a query without an explicit `.eq('gym_id', …)`) leaks EVERY gym's
-- catalog — the same systemic blanket-RLS class 000085 fixed for class_schedules.
-- This closes the last batch: the 6 direct catalog tables + belt_hierarchies.
--
-- Fix (mirrors 000085's class_schedules_gym_read): drop each blanket read policy and
-- recreate it FOR SELECT scoped to the reader's OWN gym. get_user_gym_id() is
-- `SELECT gym_id FROM profiles WHERE id = auth.uid()`, so staff AND members read only
-- their own gym's catalog; a reader whose get_user_gym_id() ≠ the row's gym (incl. a
-- cross-gym user or anon, whose get_user_gym_id() is NULL) matches 0 rows.
--
-- UNTOUCHED: the `<table>_staff` (FOR ALL) WRITE policies; anon landing reads, which
-- go through the get_landing_* SECURITY DEFINER RPCs (000080/000081) that bypass RLS.
-- OUT OF SCOPE: exchange_rates_read (GLOBAL, no gym_id — FX-PER-GYM will scope it) and
-- class_schedules_read (already fixed by 000085 → class_schedules_gym_read).
--
-- belt_hierarchies has no gym_id column; it scopes through discipline_id →
-- disciplines.gym_id (the same shape as its existing `_staff` policy, minus is_staff()
-- so members read the belt ladder too).
--
-- Additive + idempotent (DROP POLICY IF EXISTS + CREATE POLICY; the recreated name
-- equals the dropped name, so a re-run recreates cleanly). NO data change. The
-- referenced helper get_user_gym_id() is the CURRENT live SECURITY DEFINER body — it
-- bypasses RLS, so it does not recurse.
-- NOTE: 000080's header comment claiming these authenticated reads are already
-- gym-scoped is INCORRECT — 000080 only dropped the ANON `_public_read` policies; the
-- authenticated `_read` policies below were still blanket until this migration.
-- ============================================================

-- ── disciplines: blanket authenticated read → own-gym read ──────────────────
DROP POLICY IF EXISTS disciplines_read ON disciplines;
CREATE POLICY disciplines_read ON disciplines FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── classes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS classes_read ON classes;
CREATE POLICY classes_read ON classes FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── membership_plans ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS membership_plans_read ON membership_plans;
CREATE POLICY membership_plans_read ON membership_plans FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── pt_packages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pt_packages_read ON pt_packages;
CREATE POLICY pt_packages_read ON pt_packages FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── rentals ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rentals_read ON rentals;
CREATE POLICY rentals_read ON rentals FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── camps ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS camps_read ON camps;
CREATE POLICY camps_read ON camps FOR SELECT
  USING (gym_id = get_user_gym_id());

-- ── belt_hierarchies: no gym_id column → scope via discipline_id → disciplines.gym_id
DROP POLICY IF EXISTS belt_hierarchies_read ON belt_hierarchies;
CREATE POLICY belt_hierarchies_read ON belt_hierarchies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM disciplines d
      WHERE d.id = discipline_id AND d.gym_id = get_user_gym_id()
    )
  );
