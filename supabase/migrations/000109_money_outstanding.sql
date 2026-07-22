-- ════════════════════════════════════════════════════════════════════════════
-- MONEY-OUTSTANDING (000109) — make the /money outstanding number COMPLETE,
-- gym-scoped, deterministic, and fast enough to answer.
--
-- The old computation was a 2-round-trip JS join in the page:
--     invoices  .in('status',[open]).limit(500)      (no ORDER BY)
--     payments  .in('invoice_id', ids)               (no .limit → PostgREST caps
--                                                      at max_rows = 1000, no ORDER BY)
-- then it summed (total − Σ payments) per invoice in JavaScript. It could be silently
-- wrong three ways, all reproduced on the gate's own stack as `authenticated` with a
-- staff JWT (RLS applied) — see the MONEY-OUTSTANDING evidence:
--
--   · INVOICES truncation. Past 500 open invoices the LIMIT keeps an ARBITRARY 500
--     (no ORDER BY). Every open invoice owes a positive amount, so a dropped invoice
--     makes the drawer read LOW. Measured: 521 open $1 invoices → the page summed
--     $554.50 where the truth was $575.50 (−$21).
--   · PAYMENTS truncation. The unbounded payments read is capped at max_rows = 1000
--     with no ORDER BY, so past 1000 payments on the open set an ARBITRARY subset of
--     PAYMENTS is subtracted — a dropped payment leaves its invoice looking unpaid, so
--     the drawer reads HIGH. This is the shape of the $20-partial flake that first
--     surfaced the bug (pinned as a permanent regression in e2e/money-lbp.spec.ts).
--   · No gym predicate in SQL (RLS-only), and the two reads ran in separate snapshots,
--     so a concurrent write could straddle them.
--
-- Even setting correctness aside, the read does not scale. The invoices RLS is five
-- permissive policies OR'd per row (invoices_staff / _student / _parent / _guardian,
-- the guardian one a SECURITY DEFINER is_guardian_of(student_id) taking a per-row arg,
-- plus correlated student/guardian subplans) — the SAME cascade MONEY-TALLY measured
-- on payments. Measured here:
--
--   the invoices read (525 rows)                       bare 0.4 ms → 127.5 ms  (305x)
--   candidate aggregate, AS AUTHENTICATED (RLS on)                    129.3 ms
--   candidate aggregate, AS DEFINER (RLS off, one gym check)            0.5 ms
--
-- The aggregate is NOT faster while RLS is applied (129 ms) — the win is entirely from
-- SECURITY DEFINER taking the per-row cascade off the hot path, exactly as in 000108.
-- A bounded/ordered query (the R1 alternative) was rejected on the numbers: it would
-- still pay the 305x tax AND still be incomplete past its bound. So the fix is the
-- MONEY-TALLY idiom applied to the obligation side of the ledger.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_gym_outstanding(p_gym_id UUID)
RETURNS TABLE (is_renewal BOOLEAN, n_invoices BIGINT, usd NUMERIC, lbp NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym UUID;
BEGIN
  -- THE SCOPE COMES FROM THE SESSION, NEVER FROM THE CALLER (000108 / BILL-POLICY).
  -- `p_gym_id` is an assertion of intent; a mismatch is a hard error, never a quiet
  -- re-scope, because a client-sent argument shadowing this filter would be shadowing
  -- a TENANT BOUNDARY.
  v_gym := get_user_gym_id();

  -- Fails CLOSED: non-staff, no gym, or a caller naming someone else's gym all raise.
  -- Stricter than the invoices RLS it replaces (which also lets a member/guardian read
  -- their own invoices) — but the outstanding roll-up is a staff-only cash surface.
  IF v_gym IS NULL OR NOT is_staff() OR (p_gym_id IS NOT NULL AND p_gym_id <> v_gym) THEN
    RAISE EXCEPTION 'not authorized for this gym''s outstanding balance'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH open_inv AS (
    -- COMPLETE: every open invoice for this gym, no LIMIT, no ORDER-BY dependence.
    SELECT i.id, i.total_usd, i.total_lbp
    FROM invoices i
    WHERE i.gym_id = v_gym
      AND i.status IN ('pending', 'partial', 'overdue')
  ),
  paid AS (
    -- Σ payments per open invoice, scoped to this gym's open set only (so the definer
    -- never sums the whole payments table). amount_usd/amount_lbp are recorded
    -- together, so a refund's negative row and a discount's net both fall out here for
    -- free — nothing is signed or converted (MONEY-LBP).
    SELECT p.invoice_id,
           SUM(p.amount_usd) AS paid_usd,
           SUM(p.amount_lbp) AS paid_lbp
    FROM payments p
    JOIN open_inv o ON o.id = p.invoice_id
    GROUP BY p.invoice_id
  )
  SELECT
    EXISTS (SELECT 1 FROM renewal_invoices ri WHERE ri.invoice_id = o.id) AS is_renewal,
    count(*)::BIGINT AS n_invoices,
    -- Per-invoice balance, clamped and rounded EXACTLY as reconcile.ts does
    -- (balanceUsd: < 0.01 → 0, else round to cents; balanceLbp: < 1 → 0, else round),
    -- then summed. Clamping BEFORE the sum means an overpaid invoice contributes 0,
    -- never a negative that would mask another invoice's balance.
    COALESCE(SUM(
      CASE WHEN (o.total_usd - COALESCE(pd.paid_usd, 0)) < 0.01 THEN 0
           ELSE round((o.total_usd - COALESCE(pd.paid_usd, 0))::NUMERIC, 2) END
    ), 0) AS usd,
    COALESCE(SUM(
      CASE WHEN (o.total_lbp - COALESCE(pd.paid_lbp, 0)) < 1 THEN 0
           ELSE round((o.total_lbp - COALESCE(pd.paid_lbp, 0))::NUMERIC) END
    ), 0) AS lbp
  FROM open_inv o
  LEFT JOIN paid pd ON pd.invoice_id = o.id
  GROUP BY is_renewal;
END;
$$;

-- PROD DEFAULT-PRIV TRAP: a function CREATE on prod re-acquires EXECUTE for
-- PUBLIC/anon/authenticated from platform default privileges, so REVOKE explicitly and
-- grant exactly the intended set. Staff reach this as `authenticated`; the gate above
-- distinguishes staff from any other authenticated user, so EXECUTE alone grants
-- nothing. anon is REVOKED and never granted — the definer-anon posture count stays 25.
REVOKE ALL ON FUNCTION get_gym_outstanding(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gym_outstanding(UUID) TO authenticated;

-- 000096 POSTURE-SWEEP INTERACTION (same as 000108's get_daily_tally): not an anon
-- leaf, not an RLS helper, not service-only → a re-sweep files it under the DEFAULT
-- category, which grants `authenticated, service_role` — a SUPERSET of the grant above.
-- A re-sweep would ADD service_role (harmless: the service key already bypasses RLS)
-- and would NOT add anon, so the anon posture count is unaffected. No allowlist entry
-- is needed, and adding one would itself be the drift.

COMMENT ON FUNCTION get_gym_outstanding(UUID) IS
  'MONEY-OUTSTANDING: complete gym-scoped outstanding roll-up (USD+LBP, and the renewal-invoice subset), grouped by is_renewal. SECURITY DEFINER to keep the per-row invoices/payments RLS cascade off the hot path; re-asserts is_staff() AND get_user_gym_id() = p_gym_id itself. Raises 42501 rather than returning a falsely-small number.';
