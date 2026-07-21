-- MONEY-TALLY R1 — prove WHY the cash-drawer read times out.
--
-- Runs on the GATE'S OWN STACK (same `supabase start` + `db reset` + API-role grants
-- + seed_e2e_gym as .github/workflows/e2e.yml), as the `authenticated` role with a
-- staff user's JWT claims so RLS is applied exactly as PostgREST applies it.
--
-- The question: a few hundred rows cannot time out from a sequential scan alone.
-- Candidates — (a) the per-row RLS cost, (b) the OR of three permissive policies,
-- (c) the stack's statement_timeout being tiny. This script measures all three, and
-- sweeps the row count so the answer is a CURVE, not a single anecdote.

\set ON_ERROR_STOP on
\timing on

\echo '════════ 0. the environment ════════'
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated','anon','service_role');
SHOW statement_timeout;

\echo '── the policies that will be OR''d on every payments row ──'
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid = 'public.payments'::regclass ORDER BY polname;

\echo '── volatility of the helpers those policies call ──'
SELECT p.proname,
       CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility,
       p.prosecdef AS security_definer,
       p.pronargs  AS n_args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('is_staff','get_user_gym_id','is_guardian_of','get_user_role')
ORDER BY p.proname;

\echo '── indexes on payments ──'
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payments';

-- ── the staff user we impersonate: the owner of the FIRST seeded gym ──
\echo '════════ 1. impersonation target ════════'
SELECT u.id AS owner_uid, g.id AS gym_id, g.slug
FROM auth.users u
JOIN user_roles r ON r.user_id = u.id AND r.role = 'owner' AND r.is_active
JOIN gyms g ON g.id = r.gym_id
ORDER BY g.created_at LIMIT 1 \gset

\echo 'impersonating owner :owner_uid of gym :slug'

-- ────────────────────────────────────────────────────────────────────────────
-- A helper that runs the EXACT read PostgREST issues for
--   .from('payments').select('amount_usd, amount_lbp, payment_method')
--                    .gte('payment_date', day).lt('payment_date', dayAfter)
-- as `authenticated`, and reports the wall time + the plan.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.explain_tally(p_uid uuid, p_label text)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record; day text := to_char(now(), 'YYYY-MM-DD');
BEGIN
  RETURN NEXT '───────── ' || p_label || ' ─────────';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOR r IN
    EXECUTE format($q$
      EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
      SELECT amount_usd, amount_lbp, payment_method
      FROM public.payments
      WHERE payment_date >= %L AND payment_date < (%L::date + 1)
    $q$, day, day)
  LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  RESET ROLE;
END $$;

-- Same read, but with the GYM SCOPE pushed into SQL (the R3 candidate) — what
-- PostgREST emits for `.select('…, students!inner(gym_id)').eq('students.gym_id', X)`.
CREATE OR REPLACE FUNCTION pg_temp.explain_tally_scoped(p_uid uuid, p_gym uuid, p_label text)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record; day text := to_char(now(), 'YYYY-MM-DD');
BEGIN
  RETURN NEXT '───────── ' || p_label || ' ─────────';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOR r IN
    EXECUTE format($q$
      EXPLAIN (ANALYZE, BUFFERS, TIMING ON)
      SELECT p.amount_usd, p.amount_lbp, p.payment_method
      FROM public.payments p
      JOIN public.students s ON s.id = p.student_id
      WHERE p.payment_date >= %L AND p.payment_date < (%L::date + 1)
        AND s.gym_id = %L
    $q$, day, day, p_gym)
  LOOP RETURN NEXT r."QUERY PLAN"; END LOOP;
  RESET ROLE;
END $$;

-- Cost of RLS alone: the same row set counted as postgres (no RLS) vs authenticated.
CREATE OR REPLACE FUNCTION pg_temp.rls_cost(p_uid uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; bare numeric; rls numeric; n bigint;
        day text := to_char(now(), 'YYYY-MM-DD');
BEGIN
  t0 := clock_timestamp();
  EXECUTE format('SELECT count(*) FROM public.payments WHERE payment_date >= %L AND payment_date < (%L::date + 1)', day, day) INTO n;
  bare := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  BEGIN
    EXECUTE format('SELECT count(*) FROM public.payments WHERE payment_date >= %L AND payment_date < (%L::date + 1)', day, day);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RETURN format('rows(no RLS)=%s | bare=%.1f ms | WITH RLS: %s', n, bare, SQLERRM);
  END;
  rls := EXTRACT(epoch FROM clock_timestamp() - t0) * 1000;
  RESET ROLE;
  RETURN format('rows(no RLS)=%s | bare=%.1f ms | with RLS=%.1f ms | RLS multiplier=%.0fx',
                n, bare, rls, rls / GREATEST(bare, 0.001));
END $$;

-- Populate `payments` the way the gate does: spread across EVERY seeded gym (the
-- union runs one gym per worker slot in ONE database), all dated TODAY.
CREATE OR REPLACE FUNCTION pg_temp.add_payments(n int)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  INSERT INTO public.payments (invoice_id, student_id, amount_usd, amount_lbp, payment_method, payment_date)
  SELECT i.id, i.student_id, 10, 900000, 'cash_lbp', now()
  FROM (SELECT id, student_id FROM public.invoices WHERE student_id IS NOT NULL) i,
       generate_series(1, GREATEST(1, (n / GREATEST((SELECT count(*) FROM public.invoices WHERE student_id IS NOT NULL), 1))::int)) g
  LIMIT n;
  ANALYZE public.payments;
  SELECT count(*) INTO total FROM public.payments;
  RETURN total;
END $$;

\echo '════════ 2. BEFORE — no payment_date index ════════'
SELECT pg_temp.add_payments(200)  AS payments_now \gset
\echo '· volume: :payments_now rows'
SELECT pg_temp.rls_cost(:'owner_uid');
SELECT * FROM pg_temp.explain_tally(:'owner_uid', 'BEFORE @ 200 rows — unscoped (today''s code)');

SELECT pg_temp.add_payments(1000) AS payments_now \gset
\echo '· volume: :payments_now rows'
SELECT pg_temp.rls_cost(:'owner_uid');
SELECT * FROM pg_temp.explain_tally(:'owner_uid', 'BEFORE @ ~1.2k rows — unscoped (today''s code)');

SELECT pg_temp.add_payments(5000) AS payments_now \gset
\echo '· volume: :payments_now rows'
SELECT pg_temp.rls_cost(:'owner_uid');
SELECT * FROM pg_temp.explain_tally(:'owner_uid', 'BEFORE @ ~6k rows — unscoped (today''s code)');
SELECT * FROM pg_temp.explain_tally_scoped(:'owner_uid', :'gym_id', 'BEFORE @ ~6k rows — GYM-SCOPED in SQL, still no index');

\echo '════════ 3. the candidate index ════════'
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments (payment_date);
ANALYZE public.payments;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payments';

\echo '════════ 4. AFTER — same volume, same reads ════════'
SELECT pg_temp.rls_cost(:'owner_uid');
SELECT * FROM pg_temp.explain_tally(:'owner_uid', 'AFTER — unscoped + payment_date index');
SELECT * FROM pg_temp.explain_tally_scoped(:'owner_uid', :'gym_id', 'AFTER — GYM-SCOPED + payment_date index');

\echo '════════ 5. a HISTORICAL day (the index''s real win: today is a small slice) ════════'
-- Backdate most rows so "today" is a minority of the table — the shape a live gym
-- reaches after a month. Without an index the scan still reads every row.
UPDATE public.payments SET payment_date = now() - (random() * 400 || ' days')::interval
WHERE id IN (SELECT id FROM public.payments ORDER BY id LIMIT (SELECT (count(*) * 0.97)::int FROM public.payments));
ANALYZE public.payments;
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE payment_date >= current_date) AS todays_rows FROM public.payments;
SELECT pg_temp.rls_cost(:'owner_uid');
SELECT * FROM pg_temp.explain_tally(:'owner_uid', 'AFTER (aged table) — unscoped + index');
SELECT * FROM pg_temp.explain_tally_scoped(:'owner_uid', :'gym_id', 'AFTER (aged table) — gym-scoped + index');

\echo '════════ done ════════'
