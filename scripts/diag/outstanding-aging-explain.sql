-- OUTSTANDING-AGING R1 — prove WHY /money's aging buckets can be wrong, and measure the
-- current read vs the candidate fix. Runs on the GATE'S OWN STACK (supabase start + db
-- reset + API-role grants + seed_e2e_gym as e2e.yml), as `authenticated` with a staff
-- JWT so RLS applies exactly as PostgREST applies it.
--
-- getOutstandingAging (src/lib/finances/owner.ts) is the same truncation class
-- MONEY-OUTSTANDING killed, in per-bucket shape:
--   invoices .in(status,[open]).limit(2000)   (no ORDER BY)
--   payments .in('invoice_id', ids)           (NO limit → PostgREST max_rows=1000, no order)
-- then it buckets (total − Σ payments) by days-past-due in JS. Past 2000 open invoices
-- the buckets drop invoices (read LOW); past 1000 payments they drop payments (read
-- HIGH). And it does not scale: the invoices RLS is the same per-row cascade
-- MONEY-OUTSTANDING measured at 305x.

\set ON_ERROR_STOP on
\timing on

\echo '════════ 0. environment ════════'
SHOW statement_timeout;
\echo '   (config.toml: max_rows = 1000 — modelled as LIMIT 1000 on the payments read)'

\echo '════════ 1. impersonation target ════════'
SELECT u.id AS owner_uid, g.id AS gym_id, g.slug
FROM auth.users u
JOIN user_roles r ON r.user_id = u.id AND r.role = 'owner' AND r.is_active
JOIN gyms g ON g.id = r.gym_id
ORDER BY g.created_at LIMIT 1 \gset
\echo 'impersonating owner :owner_uid of gym :slug'
SELECT id AS student_id FROM public.students WHERE gym_id = :'gym_id' LIMIT 1 \gset

-- Seed n open invoices, $1 each, due dates SPREAD across all four buckets (so the
-- truncation shows up per bucket). Returns the gym's open-invoice count.
CREATE OR REPLACE FUNCTION pg_temp.add_open_invoices(p_gym uuid, p_student uuid, n int)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  INSERT INTO public.invoices
    (gym_id, student_id, invoice_type, invoice_number, amount_usd, amount_lbp,
     total_usd, total_lbp, tax_rate, exchange_rate, status, due_date)
  SELECT p_gym, p_student, 'other', 'AGE-DIAG-' || gs::text,
         1, 0, 1, 0, 0, 89000, 'pending',
         -- spread: current / 1-30 / 31-60 / 60+ by gs mod 4
         current_date - ((gs % 4) * 25)
  FROM generate_series(1, n) gs;
  ANALYZE public.invoices;
  SELECT count(*) INTO total FROM public.invoices
    WHERE gym_id = p_gym AND status IN ('pending','partial','overdue');
  RETURN total;
END $$;

-- The app's per-bucket USD, reproduced EXACTLY (both PostgREST caps modelled), as
-- authenticated. Returns one row per bucket.
CREATE OR REPLACE FUNCTION pg_temp.app_aging(p_uid uuid)
RETURNS TABLE (bucket text, usd numeric) LANGUAGE plpgsql AS $$
DECLARE ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM public.invoices WHERE status IN ('pending','partial','overdue') LIMIT 2000) q;
  RETURN QUERY
  WITH inv AS (SELECT id, total_usd, due_date FROM public.invoices WHERE id = ANY(ids)),
       pay AS (SELECT invoice_id, SUM(amount_usd) paid FROM (
                 SELECT invoice_id, amount_usd FROM public.payments WHERE invoice_id = ANY(ids) LIMIT 1000
               ) c GROUP BY invoice_id),
       bal AS (SELECT (i.total_usd - COALESCE(p.paid,0)) b,
                      CASE WHEN i.due_date >= current_date THEN 'current'
                           WHEN current_date - i.due_date <= 30 THEN 'd1_30'
                           WHEN current_date - i.due_date <= 60 THEN 'd31_60'
                           ELSE 'd60_plus' END bk
               FROM inv i LEFT JOIN pay p ON p.invoice_id = i.id)
  SELECT bk, round(SUM(b),2) FROM bal WHERE b > 0.005 GROUP BY bk ORDER BY bk;
  RESET ROLE;
END $$;

-- The COMPLETE, gym-scoped truth — no limits.
CREATE OR REPLACE FUNCTION pg_temp.true_aging(p_gym uuid)
RETURNS TABLE (bucket text, usd numeric) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH inv AS (SELECT id, total_usd, due_date FROM public.invoices
               WHERE gym_id = p_gym AND status IN ('pending','partial','overdue')),
       pay AS (SELECT p.invoice_id, SUM(p.amount_usd) paid FROM public.payments p
               JOIN inv ON inv.id = p.invoice_id GROUP BY p.invoice_id),
       bal AS (SELECT (i.total_usd - COALESCE(p.paid,0)) b,
                      CASE WHEN i.due_date >= current_date THEN 'current'
                           WHEN current_date - i.due_date <= 30 THEN 'd1_30'
                           WHEN current_date - i.due_date <= 60 THEN 'd31_60'
                           ELSE 'd60_plus' END bk
               FROM inv i LEFT JOIN pay p ON p.invoice_id = i.id)
  SELECT bk, round(SUM(b),2) FROM bal WHERE b > 0.005 GROUP BY bk ORDER BY bk;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.rls_cost(p_uid uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; bare numeric; rls numeric; n bigint;
BEGIN
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.invoices WHERE status IN ('pending','partial','overdue');
  bare := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  BEGIN PERFORM count(*) FROM public.invoices WHERE status IN ('pending','partial','overdue');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; RETURN format('invoices: rows=%s bare=%s ms WITH RLS: %s', n, round(bare,1), SQLERRM); END;
  rls := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;
  RESET ROLE;
  RETURN format('invoices: rows=%s | bare=%s ms | with RLS=%s ms | multiplier=%sx', n, round(bare,1), round(rls,1), round(rls/GREATEST(bare,0.001)));
END $$;

-- The candidate bucketed aggregate. Run (a) as authenticated (RLS on — the cost the RPC
-- AVOIDS) and (b) as the definer sees it (no RLS, one gym check — the cost the RPC PAYS).
CREATE OR REPLACE FUNCTION pg_temp.explain_aging(p_uid uuid, p_gym uuid, p_as_auth bool)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  IF p_as_auth THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    RETURN NEXT '─── candidate bucketed aggregate — AS AUTHENTICATED (RLS on) ───';
  ELSE
    RETURN NEXT '─── candidate bucketed aggregate — AS DEFINER (no RLS, one gym check) ───';
  END IF;
  FOR r IN EXECUTE format($q$
    EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
    WITH inv AS (SELECT id, total_usd, total_lbp, due_date FROM public.invoices
                 WHERE gym_id = %L AND status IN ('pending','partial','overdue')),
         pay AS (SELECT p.invoice_id, SUM(p.amount_usd) pu FROM public.payments p
                 JOIN inv ON inv.id = p.invoice_id GROUP BY p.invoice_id)
    SELECT CASE WHEN i.due_date >= current_date THEN 'current'
                WHEN current_date - i.due_date <= 30 THEN 'd1_30'
                WHEN current_date - i.due_date <= 60 THEN 'd31_60'
                ELSE 'd60_plus' END bk,
           count(*), SUM(i.total_usd - COALESCE(p.pu,0))
    FROM inv i LEFT JOIN pay p ON p.invoice_id = i.id
    WHERE (i.total_usd - COALESCE(p.pu,0)) > 0.005
    GROUP BY bk
  $q$, p_gym) LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  IF p_as_auth THEN RESET ROLE; END IF;
END $$;

\echo '════════ 2. CORRECTNESS — app buckets vs the complete truth ════════'
\echo '── add 2100 open invoices ($1 each, spread across buckets) → invoices LIMIT 2000 truncates ──'
SELECT pg_temp.add_open_invoices(:'gym_id', :'student_id', 2100) AS open_invoices;
\echo '── APP (limit 2000, payments capped 1000): ──'
SELECT * FROM pg_temp.app_aging(:'owner_uid');
\echo '── TRUE (complete): ──'
SELECT * FROM pg_temp.true_aging(:'gym_id');
\echo '   (any per-bucket difference is the silent truncation — the app reads LOW on the dropped invoices)'

\echo '════════ 3. PERFORMANCE — the RLS cascade on invoices ════════'
SELECT pg_temp.rls_cost(:'owner_uid');

\echo '════════ 4. PLANS — the candidate aggregate, authenticated vs definer ════════'
SELECT * FROM pg_temp.explain_aging(:'owner_uid', :'gym_id', true);
SELECT * FROM pg_temp.explain_aging(:'owner_uid', :'gym_id', false);

\echo '════════ done ════════'
