-- ════════════════════════════════════════════════════════════════════════════
-- MONEY-TALLY (000108) — make the cash-drawer read fast enough to answer.
--
-- WHY (measured on the gate's own stack, as `authenticated` with a staff JWT, RLS
-- applied — see the MONEY-TALLY evidence for the full EXPLAIN plans):
--
--   rows   bare count   same count WITH RLS   multiplier
--   189      0.7 ms          69.3 ms             97x
--   1,176    0.8 ms         422.0 ms            555x
--   6,174    1.5 ms       1,577.7 ms          1,078x
--
-- The cost is NOT the sequential scan (0.7–1.5 ms of actual row reading) and NOT a
-- stingy timeout (`authenticated` gets 8s here). It is the RLS predicate on
-- `payments`, which is three permissive policies OR'd per row:
--
--   payments_staff_gym  is_staff() AND EXISTS (invoices i JOIN students s
--                       WHERE i.id = payments.invoice_id AND s.gym_id = get_user_gym_id())
--   payments_guardian   is_guardian_of(student_id)      -- SECURITY DEFINER, per-row arg
--   payments_student    student_id IN (SELECT … FROM students WHERE profile_id = auth.uid())
--
-- The correlated EXISTS re-runs per candidate row, and the tables inside it carry
-- their OWN RLS, which expands into a nested cascade (payments → invoices ⋈ students
-- → students' guardian policy → guardians ⋈ guardian_students, each with subplans).
-- The planner's own estimate for the 6k-row case is cost=…4,313,395.
--
-- Two things that did NOT work, both measured rather than assumed:
--   · A date index alone. It prunes only when "today" is a small slice; the e2e gate
--     dates every payment `now()`, so today IS the table and the scan stays. (It is
--     still created below — for a live gym after a month of history it is the
--     difference between 1,565 ms and 56 ms, a 28x win, measured.)
--   · An explicit gym predicate in the SELECT. RLS quals are security-barrier quals:
--     Postgres evaluates them BEFORE a non-leakproof user qual such as a join, so the
--     join cannot cut the row set first. Measured 1,692 ms vs 1,541 ms — slightly
--     WORSE, never better.
--
-- So the fix has to remove the per-row cascade from the hot path, which is what a
-- definer aggregate does: ONE explicit tenant check instead of N per-row policy
-- evaluations, and the summation happens in SQL instead of shipping every row.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. the date index ────────────────────────────────────────────────────────
-- Plain CREATE INDEX (no CONCURRENTLY): the migration runner is transactional.
-- Serves the [day, day+1) range read; also the only index that helps ANY
-- date-bounded payments read (idx_payments_student leads with student_id, so it
-- cannot serve a pure date range).
--
-- HONEST NOTE ON ITS EVIDENCE: this index is NOT what makes the e2e gate green, and
-- CI cannot even measure it — every spec records payments dated `now()`, so "today"
-- is ~100% of the table there and no date predicate prunes anything. It is kept
-- because a real gym is not all-today: on an aged table (6,174 rows, ~187 of them
-- today) it took the same read from 1,565 ms to 56 ms. It also serves the RPC's own
-- internal scan below, whose selectivity improves as a tenant accumulates history —
-- so the index earns its place in production even though its CI reading is flat.
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

-- ── 2. the tally itself ──────────────────────────────────────────────────────
-- SECURITY DEFINER, so the per-row RLS cascade above is not in the hot path. That
-- makes the tenant boundary THIS FUNCTION'S responsibility, so it is re-asserted
-- explicitly and FIRST, in the same terms the policy it replaces used:
-- `is_staff() AND get_user_gym_id() = p_gym_id`. A caller who is not staff of the
-- named gym gets an exception, never a silent empty result — the whole point of the
-- slice is that "no data" and "not allowed" must never look alike.
CREATE OR REPLACE FUNCTION get_daily_tally(p_gym_id UUID, p_date DATE)
RETURNS TABLE (payment_method TEXT, usd NUMERIC, lbp NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym UUID;
BEGIN
  -- THE SCOPE COMES FROM THE SESSION, NEVER FROM THE CALLER.
  -- `p_gym_id` is an assertion of intent, not the filter: BILL-POLICY was the lesson
  -- that a client-sent argument silently shadows a server-derived default, and here
  -- the argument would be shadowing a TENANT BOUNDARY. So the gym this function reads
  -- is whatever the caller's own session resolves to, and a mismatched p_gym_id is a
  -- hard error rather than a quiet re-scope.
  v_gym := get_user_gym_id();

  -- Fails CLOSED: a non-staff caller, a caller with no gym, or a caller naming
  -- someone else's gym all raise. Note this is STRICTER than the RLS it replaces —
  -- the payments policies also let a guardian or the member themselves read their own
  -- rows, but the cash drawer is a staff surface with no member consumer.
  IF v_gym IS NULL OR NOT is_staff() OR (p_gym_id IS NOT NULL AND p_gym_id <> v_gym) THEN
    RAISE EXCEPTION 'not authorized for this gym''s cash drawer'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.payment_method::TEXT,
         SUM(p.amount_usd)::NUMERIC,
         SUM(p.amount_lbp)::NUMERIC
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE i.gym_id = v_gym            -- session-derived, never the parameter
    -- The SAME half-open window the application computed before (QUICK-WINS #1: a
    -- bare >= had no upper bound and swept in post-dated cheques). Cast in the
    -- session timezone exactly as the PostgREST filter did, so the day boundary
    -- this returns is byte-for-byte the one it replaces.
    AND p.payment_date >= p_date::timestamptz
    AND p.payment_date <  (p_date + 1)::timestamptz
  GROUP BY p.payment_method;
END;
$$;

-- PROD DEFAULT-PRIV TRAP: every function CREATE on prod re-acquires EXECUTE for
-- PUBLIC/anon/authenticated from the platform's default privileges, so REVOKE
-- explicitly and then grant exactly the intended set. Staff reach this as
-- `authenticated`; the gate above is what distinguishes staff from any other
-- authenticated user, so EXECUTE alone grants nothing. anon is REVOKED and never
-- granted — the definer-anon posture count stays 25.
REVOKE ALL ON FUNCTION get_daily_tally(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_daily_tally(UUID, DATE) TO authenticated;

-- 000096 POSTURE-SWEEP INTERACTION — stated honestly rather than assumed away.
-- `get_daily_tally` is not an anon leaf, not an RLS helper and not service-only, so a
-- future re-invocation of the 000096 sweep files it under the DEFAULT category, which
-- grants `authenticated, service_role`. That is a SUPERSET of the grant above: a
-- re-sweep would ADD service_role (harmless — the service-role key already bypasses
-- RLS entirely, so it gains nothing) and would NOT add anon, so the anon posture
-- count is unaffected either way. No allowlist entry is required, and adding one
-- would itself be the drift.

COMMENT ON FUNCTION get_daily_tally(UUID, DATE) IS
  'MONEY-TALLY: per-method cash-drawer tally for one gym on one day. SECURITY DEFINER to keep the per-row payments RLS cascade off the hot path; re-asserts is_staff() AND get_user_gym_id() = p_gym_id itself. Raises 42501 rather than returning empty.';
