-- ============================================================
-- AUTH-DEPTH (REQ1) — SECURITY DEFINER posture ratchet
--
-- WHY THIS EXISTS
-- Every SECURITY DEFINER function runs with its OWNER's rights and BYPASSES RLS.
-- So the set of roles that may EXECUTE such a function is a first-class access
-- control — as important as an RLS policy. Two systemic gaps exist in the live
-- schema (proven from a from-zero replay via pg_proc, 2026-07-11):
--
--   (1) PUBLIC EXECUTE — 41 of the 114 public SECURITY DEFINER functions still
--       carry the SQL-default `=X` (PUBLIC) grant (a GRANT ... TO <role> was issued
--       without a prior REVOKE ... FROM PUBLIC, so PostgreSQL materialised the
--       default PUBLIC entry alongside the named grant).
--
--   (2) anon EXECUTE — Supabase configures, on this project,
--         ALTER DEFAULT PRIVILEGES IN SCHEMA public
--           GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
--       so on CREATE every function is granted to `anon`. Result: an ANONYMOUS
--       caller can invoke privileged, RLS-bypassing staff RPCs directly over
--       PostgREST — record_payment, void_invoice, refund_invoice, promote_student,
--       create_student, issue_invoice, … — regardless of any RLS on the tables
--       they mutate. This is the real exposure this migration closes.
--
--   (3) search_path — 5 definer functions ship WITHOUT a pinned search_path
--       (get_user_role, get_user_gym_id, is_staff, audit_trigger_fn,
--       get_active_assignment), leaving them open to search_path-shadowing.
--
-- THE TARGET POSTURE (asserted for EVERY public SECURITY DEFINER function)
--   (a) REVOKE ALL FROM PUBLIC                     — no function is PUBLIC-executable
--   (b) an EXPLICIT, NARROW EXECUTE grant          — see the five categories below
--   (c) SET search_path pinned                     — Part A
--   (d) an internal gym-scope / role gate where the function reads cross-tenant data
--       — VERIFIED, no change needed (see the note at the end).
--
-- CATEGORIES (the membership arrays in Part B ARE the access policy)
--   ANON_LEAF   the public landing + lead-capture surface. Anon genuinely needs it,
--               so: anon + authenticated + service_role.
--   RLS_HELPER  role / gym-scope / guardianship PREDICATES that RLS policies call.
--               A policy predicate is evaluated with the CALLER's privileges, so any
--               role that can reach a table whose policy set references one of these
--               (including an anon SELECT on a public-read table that ALSO carries a
--               staff `FOR ALL` policy) MUST be able to execute it — else the query
--               errors "permission denied for function". For anon these return
--               null/false and expose nothing, so keeping them anon-executable grants
--               no privilege. This set is EXACTLY the functions referenced in any
--               CREATE POLICY predicate in the chain (verified): is_staff,
--               get_user_role, get_user_gym_id, is_gym_admin, is_platform_admin,
--               is_active_gym, is_public_class, is_guardian_of, is_guardian_of_profile,
--               recipient_in_gym. Grant: anon + authenticated + service_role.
--   SERVICE_ONLY seed / e2e / cron / batch functions, only ever called with the
--               service-role key (e2e seeds via SUPABASE_SERVICE_ROLE_KEY; dunning /
--               lifecycle via the admin client / pg_cron). Grant: service_role only.
--   TRIGGER     functions invoked by a trigger — the EXECUTE privilege check is
--               bypassed for trigger invocation, and they are never called as an RPC.
--               Grant: service_role only (defensive; no role needs it).
--   (default)   every other RPC — staff / member / coach actions + internal `_`
--               helpers (called by their DEFINER parents, which run as the owner).
--               Grant: authenticated + service_role, NO anon.  ← the fix for gap (2).
--
-- METHOD NOTES
--   • Part A uses ALTER FUNCTION ... SET search_path (NOT CREATE OR REPLACE): it is
--     strictly posture-only — it never touches the body, so it cannot revert a later
--     amendment (the rename-chain lesson) and cannot introduce a behavior edit. The
--     bodies schema-qualify auth.uid() and touch only public tables + pg_catalog
--     built-ins, so `public` (the 95-function dominant convention) is sufficient.
--   • Part B iterates the LIVE definer set from pg_proc and, per function, REVOKEs the
--     three data-plane roles then GRANTs exactly the category's set — so each ACL ends
--     as precisely the declared grant (fully deterministic on replay; idempotent).
--   • ZERO behavior edits: no function body is rewritten. Only EXECUTE ACLs and
--     search_path config change.
-- ============================================================

-- ---------- PART A — pin search_path on the 5 unpinned definer functions ----------
ALTER FUNCTION public.get_user_role()                     SET search_path = public;
ALTER FUNCTION public.get_user_gym_id()                   SET search_path = public;
ALTER FUNCTION public.is_staff()                          SET search_path = public;
ALTER FUNCTION public.audit_trigger_fn()                  SET search_path = public;
ALTER FUNCTION public.get_active_assignment(uuid, uuid)   SET search_path = public;

-- ---------- PART B — EXECUTE posture sweep over every public definer function ----------
DO $$
DECLARE
  r record;
  -- Public landing + lead capture — anon reaches these by design.
  anon_leaf text[] := ARRAY[
    'get_landing_disciplines','get_landing_coaches','get_landing_camps',
    'get_landing_class_fees','get_landing_plans','get_landing_pt',
    'get_landing_schedule','get_landing_images','get_public_gym',
    'get_gym_slug_by_domain','get_camp_spots_left','submit_trial_inquiry',
    'submit_public_lead'
  ];
  -- RLS policy predicates (must stay executable by whatever role reaches the policy).
  rls_helper text[] := ARRAY[
    'is_staff','get_user_role','get_user_gym_id','is_gym_admin','is_platform_admin',
    'is_active_gym','is_public_class','is_guardian_of','is_guardian_of_profile',
    'recipient_in_gym'
  ];
  -- Seed / e2e / cron / batch — service-role key or pg_cron only.
  service_only text[] := ARRAY[
    'seed_e2e_gym','seed_e2e_gym_adm1','seed_e2e_gym_b3','seed_e2e_gym_base',
    'seed_e2e_gym_e1','seed_e2e_gym_fd1','seed_e2e_gym_fin1','seed_e2e_gym_g1',
    'seed_e2e_gym_ml1','seed_e2e_gym_no_membership','seed_e2e_gym_on1',
    'seed_e2e_gym_pre_coachlp','seed_e2e_gym_pt1','seed_e2e_wl_gym',
    'seed_e2e_dunning','reseed_proline_demo','reset_ml1_e2e','teardown_e2e_gym',
    'sweep_stale_e2e_gyms','due_dunning_reminders','run_lifecycle_tick'
  ];
  v_leaf int := 0; v_helper int := 0; v_service int := 0; v_default int := 0; v_total int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           p.oid::regprocedure::text AS sig,
           (p.prorettype = 'trigger'::regtype) AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    v_total := v_total + 1;
    -- (a) strip the SQL-default PUBLIC EXECUTE on every definer function.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    -- normalise the three data-plane roles, then grant exactly the category set.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);

    IF r.proname = ANY(anon_leaf) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
      v_leaf := v_leaf + 1;
    ELSIF r.proname = ANY(rls_helper) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
      v_helper := v_helper + 1;
    ELSIF r.is_trigger OR r.proname = ANY(service_only) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      v_service := v_service + 1;
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
      v_default := v_default + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'DEFINER-POSTURE sweep: % functions (% anon-leaf, % rls-helper, % service/trigger-only, % authenticated-default).',
    v_total, v_leaf, v_helper, v_service, v_default;
END $$;

-- ---------- (d) internal gym-scope / role gate — VERIFIED, no change ----------
-- Every function that reads cross-tenant data already carries an internal gate:
--   • the privileged ACTION RPCs (record_payment, promote_student, …) check
--     is_staff()/is_gym_admin()/get_user_gym_id()/auth.uid() in their bodies;
--   • the landing get_* functions take an explicit p_gym_id and return only that
--     gym's PUBLISHED (public-by-design) rows;
--   • the `_`-prefixed helpers are called only by their gated DEFINER parents;
--   • seed/e2e/cron functions are now service-role only.
-- This migration therefore changes ACLs + search_path ONLY — no behavior edit.
