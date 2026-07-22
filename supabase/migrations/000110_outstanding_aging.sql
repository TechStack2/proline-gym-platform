-- ════════════════════════════════════════════════════════════════════════════
-- OUTSTANDING-AGING (000110) — make the /money aging grid COMPLETE, gym-scoped,
-- deterministic, and fast, the same way MONEY-OUTSTANDING (000109) fixed the total.
--
-- The old `getOutstandingAging` (src/lib/finances/owner.ts) was a 2-round-trip JS join:
--     invoices  .in('status',[open]).limit(2000)   (no ORDER BY)
--     payments  .in('invoice_id', ids)             (no .limit → PostgREST max_rows=1000)
-- then it bucketed (total − Σ payments) by days-past-due in JS. Same defect as 000109,
-- in per-bucket shape (measured on the gate's own stack, authenticated + staff JWT):
--   · past 2000 open invoices the LIMIT keeps an ARBITRARY 2000 → dropped invoices
--     vanish from their bucket (reads LOW). MEASURED: at 2101 open invoices the app's
--     buckets read current $554.50 / d1_30 $500 / d31_60 $500 / d60_plus $500 vs the
--     complete $580.50 / $525 / $525 / $525 — ~$101 short, every bucket low.
--   · past 1000 payments the unbounded read is capped at max_rows=1000 → dropped
--     payments leave invoices looking unpaid (reads HIGH).
-- And it does not scale: the invoices RLS is the SAME per-row cascade 000109 measured
-- (five permissive policies OR'd, incl. a per-row SECURITY DEFINER is_guardian_of).
-- Measured here at 2105 open invoices: bare 0.9 ms → 437.8 ms with RLS (496x). Candidate
-- bucketed aggregate: AS AUTHENTICATED 322 ms (RLS unchanged → no faster), AS DEFINER
-- 2.7 ms — the win is entirely SECURITY DEFINER taking the cascade off the hot path.
--
-- A SEPARATE function from get_gym_outstanding (000109), not an extension of it: that one
-- groups by is_renewal to feed two total cards; this groups by days-past-due bucket and
-- needs the invoice due_date. Different projection, different GROUP BY — one function per
-- shape keeps each single-purpose (and 000109 ships unchanged).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_gym_outstanding_aging(p_gym_id UUID)
RETURNS TABLE (bucket TEXT, n_invoices BIGINT, usd NUMERIC, lbp NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym UUID;
BEGIN
  -- Scope from the SESSION, never the caller (000108/000109 / BILL-POLICY). p_gym_id is
  -- an assertion of intent; a mismatch is a hard error, never a quiet re-scope.
  v_gym := get_user_gym_id();
  IF v_gym IS NULL OR NOT is_staff() OR (p_gym_id IS NOT NULL AND p_gym_id <> v_gym) THEN
    RAISE EXCEPTION 'not authorized for this gym''s outstanding aging'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH open_inv AS (
    -- COMPLETE: every open invoice for this gym, no LIMIT.
    SELECT i.id, i.total_usd, i.total_lbp, i.due_date
    FROM invoices i
    WHERE i.gym_id = v_gym AND i.status IN ('pending', 'partial', 'overdue')
  ),
  paid AS (
    SELECT p.invoice_id, SUM(p.amount_usd) AS paid_usd, SUM(p.amount_lbp) AS paid_lbp
    FROM payments p JOIN open_inv o ON o.id = p.invoice_id
    GROUP BY p.invoice_id
  ),
  bal AS (
    SELECT
      -- The SAME bucketing getOutstandingAging used: due today-or-later = current;
      -- else by whole days past due (current_date basis). Boundaries ≤30 / ≤60 match.
      CASE WHEN o.due_date >= current_date THEN 'current'
           WHEN current_date - o.due_date <= 30 THEN 'd1_30'
           WHEN current_date - o.due_date <= 60 THEN 'd31_60'
           ELSE 'd60_plus' END AS bk,
      -- The SAME balances: raw (total − Σ payments), NOT per-invoice clamped/rounded
      -- (that is get_gym_outstanding's rule; aging preserved its own to keep the numbers
      -- byte-identical to what the grid showed). An overpaid invoice's negative LBP is
      -- floored at 0 exactly as the JS did; USD is filtered by the > 0.005 guard below.
      (o.total_usd - COALESCE(pd.paid_usd, 0)) AS bal_usd,
      GREATEST(o.total_lbp - COALESCE(pd.paid_lbp, 0), 0) AS bal_lbp
    FROM open_inv o
    LEFT JOIN paid pd ON pd.invoice_id = o.id
  )
  SELECT b.bk, count(*)::BIGINT, SUM(b.bal_usd)::NUMERIC, SUM(b.bal_lbp)::NUMERIC
  FROM bal b
  WHERE b.bal_usd > 0.005        -- the same "settled" skip the JS applied
  GROUP BY b.bk;
END;
$$;

-- PROD DEFAULT-PRIV TRAP: a function CREATE on prod re-acquires EXECUTE for
-- PUBLIC/anon/authenticated from platform default privileges, so REVOKE explicitly and
-- grant exactly the intended set. Staff reach this as `authenticated`; the gate above
-- distinguishes staff from any other authenticated user, so EXECUTE alone grants nothing.
-- anon is REVOKED and never granted — the definer-anon posture count stays 25.
REVOKE ALL ON FUNCTION get_gym_outstanding_aging(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gym_outstanding_aging(UUID) TO authenticated;

-- 000096 POSTURE-SWEEP INTERACTION (same as 000108/000109): not an anon leaf, not an RLS
-- helper, not service-only → a re-sweep files it under the DEFAULT category, which grants
-- `authenticated, service_role` — a SUPERSET of the grant above. A re-sweep ADDS
-- service_role (harmless: the service key already bypasses RLS) and NOT anon, so the anon
-- posture count is unaffected. No allowlist entry is needed; adding one would be the drift.

COMMENT ON FUNCTION get_gym_outstanding_aging(UUID) IS
  'OUTSTANDING-AGING: complete gym-scoped outstanding roll-up bucketed by days-past-due (current / d1_30 / d31_60 / d60_plus). SECURITY DEFINER to keep the per-row invoices/payments RLS cascade off the hot path; re-asserts is_staff() AND get_user_gym_id() = p_gym_id itself. Raises 42501 rather than returning falsely-empty buckets.';
