-- MONEY-OUTSTANDING R1 — prove WHY /money's outstanding number can be wrong, and
-- measure the current read vs the candidate fix. Runs on the GATE'S OWN STACK (same
-- supabase start + db reset + API-role grants + seed_e2e_gym as e2e.yml), as the
-- `authenticated` role with a staff user's JWT claims so RLS applies exactly as
-- PostgREST applies it.
--
-- Two questions, one script:
--   CORRECTNESS — the app computes outstanding with a 2-round-trip JS join:
--     invoices  .in('status',[open]).limit(500)            (no ORDER BY)
--     payments  .in('invoice_id', ids)                     (NO limit → PostgREST
--                                                            caps at max_rows=1000,
--                                                            no ORDER BY)
--     We reproduce BOTH PostgREST caps in SQL and compare the app's number to the
--     COMPLETE, gym-scoped aggregate. The gap is the bug; its SIGN tells us whether
--     the drawer reads high or low.
--   PERFORMANCE — the same RLS cascade MONEY-TALLY measured lives on invoices AND
--     payments (payments_staff_gym's correlated EXISTS + payments_guardian's per-row
--     SECURITY DEFINER is_guardian_of, OR'd per row). We measure the current reads
--     against the candidate SECURITY DEFINER aggregate (one session-derived tenant
--     check, aggregate in SQL, no row ceiling).

\set ON_ERROR_STOP on
\timing on

\echo '════════ 0. environment ════════'
SHOW statement_timeout;
\echo '── PostgREST db-max-rows (the SILENT cap on the unbounded payments read) ──'
-- config.toml sets max_rows = 1000; PostgREST appends LIMIT 1000 to any read that
-- did not ask for fewer. We model that as an explicit LIMIT below.
\echo '   (config.toml: max_rows = 1000 — modelled as LIMIT 1000 on the payments read)'

\echo '── the policies OR''d on every invoices row for a staff read ──'
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid = 'public.invoices'::regclass ORDER BY polname;
\echo '── the policies OR''d on every payments row for a staff read ──'
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid = 'public.payments'::regclass ORDER BY polname;

-- ── the staff user we impersonate: the owner of the FIRST seeded gym ──
\echo '════════ 1. impersonation target ════════'
SELECT u.id AS owner_uid, g.id AS gym_id, g.slug
FROM auth.users u
JOIN user_roles r ON r.user_id = u.id AND r.role = 'owner' AND r.is_active
JOIN gyms g ON g.id = r.gym_id
ORDER BY g.created_at LIMIT 1 \gset
\echo 'impersonating owner :owner_uid of gym :slug'

-- One student in that gym to hang invoices off.
SELECT id AS student_id FROM public.students WHERE gym_id = :'gym_id' LIMIT 1 \gset
\echo 'student :student_id'

-- ────────────────────────────────────────────────────────────────────────────
-- Seeding helpers. add_open_invoices(n): n pending invoices, each owing exactly
-- $1.00 (total_usd=1, no payments) — so the COMPLETE outstanding grows by exactly
-- $n and any truncation of the invoice list shows up as a clean shortfall.
-- add_partial_payments(): give EACH open invoice one small partial payment, so the
-- payment count crosses max_rows and the unbounded payments read truncates.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.add_open_invoices(p_gym uuid, p_student uuid, n int)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  INSERT INTO public.invoices
    (gym_id, student_id, invoice_type, invoice_number, amount_usd, amount_lbp,
     total_usd, total_lbp, tax_rate, exchange_rate, status, due_date)
  SELECT p_gym, p_student, 'other', 'MO-DIAG-' || gs::text,
         1, 0, 1, 0, 0, 89000, 'pending', current_date
  FROM generate_series(1, n) gs;
  ANALYZE public.invoices;
  SELECT count(*) INTO total FROM public.invoices
    WHERE gym_id = p_gym AND status IN ('pending','partial','overdue');
  RETURN total;
END $$;

-- Give every open MO-DIAG invoice a $0.10 partial payment (does NOT change status,
-- just to inflate the payments row count past max_rows). Returns payment count.
CREATE OR REPLACE FUNCTION pg_temp.add_partial_payments(p_gym uuid, p_student uuid)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  INSERT INTO public.payments (invoice_id, student_id, amount_usd, amount_lbp, payment_method, payment_date)
  SELECT i.id, p_student, 0.10, 0, 'cash_usd', now()
  FROM public.invoices i
  WHERE i.gym_id = p_gym AND i.invoice_number LIKE 'MO-DIAG-%'
    AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id);
  ANALYZE public.payments;
  SELECT count(*) INTO total FROM public.payments p
    JOIN public.invoices i ON i.id = p.invoice_id
   WHERE i.gym_id = p_gym;
  RETURN total;
END $$;

-- The app's number, reproduced EXACTLY (both PostgREST caps modelled), as authenticated.
CREATE OR REPLACE FUNCTION pg_temp.app_outstanding(p_uid uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; out_usd numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- invoices .in(status).limit(500), no ORDER BY
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM public.invoices
    WHERE status IN ('pending','partial','overdue')
    LIMIT 500
  ) q;
  -- payments .in(invoice_id, ids) — NO limit in the app → PostgREST LIMIT 1000, no order
  -- Sum per invoice, then balance, exactly like reconcile.ts.
  SELECT COALESCE(SUM(GREATEST(inv.total_usd - COALESCE(pay.paid,0), 0)), 0) INTO out_usd
  FROM (SELECT id, total_usd FROM public.invoices WHERE id = ANY(ids)) inv
  LEFT JOIN (
    SELECT invoice_id, SUM(amount_usd) AS paid FROM (
      SELECT invoice_id, amount_usd FROM public.payments
      WHERE invoice_id = ANY(ids)
      LIMIT 1000
    ) capped GROUP BY invoice_id
  ) pay ON pay.invoice_id = inv.id;
  RESET ROLE;
  RETURN round(out_usd, 2);
END $$;

-- The COMPLETE, gym-scoped truth — what the definer RPC will return. No limits.
CREATE OR REPLACE FUNCTION pg_temp.true_outstanding(p_gym uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE out_usd numeric;
BEGIN
  SELECT COALESCE(SUM(GREATEST(inv.total_usd - COALESCE(pay.paid,0), 0)), 0) INTO out_usd
  FROM (SELECT id, total_usd FROM public.invoices
        WHERE gym_id = p_gym AND status IN ('pending','partial','overdue')) inv
  LEFT JOIN (SELECT invoice_id, SUM(amount_usd) AS paid FROM public.payments GROUP BY invoice_id) pay
    ON pay.invoice_id = inv.id;
  RETURN round(out_usd, 2);
END $$;

-- RLS multiplier on a table (bare postgres count vs authenticated count), same idiom
-- as MONEY-TALLY.
CREATE OR REPLACE FUNCTION pg_temp.rls_cost(p_uid uuid, p_tbl text, p_where text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; bare numeric; rls numeric; n bigint;
BEGIN
  t0 := clock_timestamp();
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', p_tbl, p_where) INTO n;
  bare := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  BEGIN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', p_tbl, p_where);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN format('%s: rows=%s | bare=%s ms | WITH RLS: %s', p_tbl, n, round(bare,1), SQLERRM);
  END;
  rls := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;
  RESET ROLE;
  RETURN format('%s: rows=%s | bare=%s ms | with RLS=%s ms | multiplier=%sx',
                p_tbl, n, round(bare,1), round(rls,1), round(rls / GREATEST(bare,0.001)));
END $$;

CREATE OR REPLACE FUNCTION pg_temp.explain_app_reads(p_uid uuid)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record; ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  RETURN NEXT '─── app read #1: invoices .in(status).limit(500) ───';
  FOR r IN EXECUTE $q$
    EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
    SELECT id, total_usd, total_lbp, status FROM public.invoices
    WHERE status IN ('pending','partial','overdue') LIMIT 500
  $q$ LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM public.invoices WHERE status IN ('pending','partial','overdue') LIMIT 500) q;
  RETURN NEXT '─── app read #2: payments .in(invoice_id, ids) [capped 1000] ───';
  FOR r IN EXECUTE format($q$
    EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
    SELECT invoice_id, amount_usd, amount_lbp FROM public.payments
    WHERE invoice_id = ANY(%L::uuid[]) LIMIT 1000
  $q$, ids) LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  RESET ROLE;
END $$;

-- The candidate: ONE aggregate join. Run it (a) as authenticated (RLS on both
-- tables — the cost the RPC AVOIDS) and (b) as the definer sees it (no RLS, one gym
-- check — the cost the RPC PAYS).
CREATE OR REPLACE FUNCTION pg_temp.explain_aggregate(p_uid uuid, p_gym uuid, p_as_auth bool)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  IF p_as_auth THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    RETURN NEXT '─── candidate aggregate — AS AUTHENTICATED (RLS on invoices+payments) ───';
  ELSE
    RETURN NEXT '─── candidate aggregate — AS DEFINER (no RLS, one gym check) ───';
  END IF;
  FOR r IN EXECUTE format($q$
    EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
    SELECT i.status,
           SUM(GREATEST(i.total_usd - COALESCE(p.paid,0),0)) AS usd
    FROM public.invoices i
    LEFT JOIN (SELECT invoice_id, SUM(amount_usd) AS paid FROM public.payments GROUP BY invoice_id) p
      ON p.invoice_id = i.id
    WHERE i.gym_id = %L AND i.status IN ('pending','partial','overdue')
    GROUP BY i.status
  $q$, p_gym) LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  IF p_as_auth THEN RESET ROLE; END IF;
END $$;

\echo '════════ 2. CORRECTNESS — app number vs the complete truth ════════'

\echo '── baseline (seed only, no MO-DIAG rows) ──'
SELECT pg_temp.app_outstanding(:'owner_uid')  AS app_usd,
       pg_temp.true_outstanding(:'gym_id')     AS true_usd;

\echo '── add 520 open invoices ($1 each) → the invoices LIMIT 500 must truncate ──'
SELECT pg_temp.add_open_invoices(:'gym_id', :'student_id', 520) AS open_invoices;
SELECT pg_temp.app_outstanding(:'owner_uid')  AS app_usd,
       pg_temp.true_outstanding(:'gym_id')     AS true_usd,
       pg_temp.true_outstanding(:'gym_id') - pg_temp.app_outstanding(:'owner_uid') AS app_undercount_usd;
\echo '   (positive app_undercount = the drawer reads LOW: dropped invoices vanish from what is owed)'

\echo '── now give every open invoice a $0.10 partial → payments cross max_rows=1000 ──'
SELECT pg_temp.add_partial_payments(:'gym_id', :'student_id') AS gym_payments;
SELECT pg_temp.app_outstanding(:'owner_uid')  AS app_usd,
       pg_temp.true_outstanding(:'gym_id')     AS true_usd,
       pg_temp.app_outstanding(:'owner_uid') - pg_temp.true_outstanding(:'gym_id') AS app_overcount_usd;
\echo '   (positive app_overcount = the drawer reads HIGH: dropped PAYMENTS leave invoices looking unpaid — the i5-partial signature)'

\echo '════════ 3. PERFORMANCE — the RLS cascade on both tables ════════'
SELECT pg_temp.rls_cost(:'owner_uid', 'invoices', $$status IN ('pending','partial','overdue')$$);
SELECT pg_temp.rls_cost(:'owner_uid', 'payments', 'true');

\echo '════════ 4. PLANS — current app reads vs the candidate aggregate ════════'
SELECT * FROM pg_temp.explain_app_reads(:'owner_uid');
SELECT * FROM pg_temp.explain_aggregate(:'owner_uid', :'gym_id', true);
SELECT * FROM pg_temp.explain_aggregate(:'owner_uid', :'gym_id', false);

\echo '════════ done ════════'
