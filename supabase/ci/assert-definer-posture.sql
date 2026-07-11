-- ============================================================
-- CI GUARD (AUTH-DEPTH / migration 000096) — SECURITY DEFINER posture never regresses
--
-- Runs against the from-zero replayed DB (.github/workflows/db-replay-check.yml).
-- A SECURITY DEFINER function runs with its owner's rights and BYPASSES RLS, so who
-- may EXECUTE it is an access-control decision. This guard makes the 000096 sweep
-- PERMANENT — it FAILS the job (RAISE EXCEPTION under ON_ERROR_STOP=1) if ANY public
-- SECURITY DEFINER function ever ships that:
--
--   V1  is PUBLIC-executable        (proacl carries the `=X` / empty-grantee entry), or
--   V2  has NO pinned search_path   (no proconfig entry `search_path=…`), or
--   V3  grants EXECUTE to `anon`    while NOT on the reviewed anon allowlist below.
--
-- V3 is the teeth: Supabase default-privileges GRANT EXECUTE ON FUNCTIONS TO anon, so
-- a NEW definer function is anon-executable unless its migration revokes anon. Since
-- definer functions bypass RLS, an un-revoked new staff RPC would be anon-callable —
-- exactly the exposure 000096 closed. Any such new function turns this job RED.
--
-- ANON ALLOWLIST (the ONLY functions that may keep anon EXECUTE) — two reviewed sets:
--   • ANON_LEAF  — the public landing + lead-capture surface (anon genuinely calls it).
--   • RLS_HELPER — role/gym/guardianship predicates referenced by CREATE POLICY. A
--                  policy predicate is evaluated with the caller's privileges, so any
--                  role reaching a governed table (incl. an anon SELECT on a public-read
--                  table that also has a staff FOR ALL policy) must be able to execute
--                  them; for anon they return null/false and expose nothing.
--   To add a genuinely-public new function, add it here IN THE SAME PR that grants anon —
--   that is the reviewed, intentional exception, and it is visible in the diff.
--
-- WHY it will not false-positive:
--   • Only SECURITY DEFINER functions in schema `public` are candidates (prosecdef).
--   • V1/V2 apply to every candidate uniformly (no exceptions — nothing public should be
--     PUBLIC-executable or unpinned).
--   • V3's allowlist is explicit; authenticated/service_role grants are never flagged.
-- ============================================================

\echo '── DEFINER-POSTURE guard — every public SECURITY DEFINER function: no PUBLIC, pinned search_path, anon only on the allowlist ──'

-- The reviewed anon allowlist (keep in lockstep with migration 000096 Part B).
WITH anon_allow(fn) AS (
  VALUES
    -- ANON_LEAF (public landing + lead capture)
    ('get_landing_disciplines'),('get_landing_coaches'),('get_landing_camps'),
    ('get_landing_class_fees'),('get_landing_plans'),('get_landing_pt'),
    ('get_landing_schedule'),('get_landing_images'),('get_public_gym'),
    ('get_gym_slug_by_domain'),('get_camp_spots_left'),('submit_trial_inquiry'),
    ('submit_public_lead'),
    -- RLS_HELPER (referenced by CREATE POLICY predicates; anon → null/false)
    ('is_staff'),('get_user_role'),('get_user_gym_id'),('is_gym_admin'),
    ('is_platform_admin'),('is_active_gym'),('is_public_class'),('is_guardian_of'),
    ('is_guardian_of_profile'),('recipient_in_gym')
)
SELECT p.proname,
       CASE WHEN EXISTS (SELECT 1 FROM unnest(coalesce(p.proacl,'{}')) a WHERE a::text LIKE '=%')
            THEN '*** PUBLIC (V1) ***' ELSE 'no-public' END AS public_exec,
       CASE WHEN EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
            THEN 'pinned' ELSE '*** UNPINNED (V2) ***' END AS search_path,
       CASE WHEN EXISTS (SELECT 1 FROM unnest(coalesce(p.proacl,'{}')) a WHERE a::text LIKE 'anon=%')
            THEN (CASE WHEN p.proname IN (SELECT fn FROM anon_allow) THEN 'anon (allowlisted)'
                       ELSE '*** anon NOT allowlisted (V3) ***' END)
            ELSE '-' END AS anon_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;

DO $$
DECLARE
  v_pub   int; v_pub_list   text;
  v_unpin int; v_unpin_list text;
  v_anon  int; v_anon_list  text;
  anon_allow text[] := ARRAY[
    'get_landing_disciplines','get_landing_coaches','get_landing_camps',
    'get_landing_class_fees','get_landing_plans','get_landing_pt',
    'get_landing_schedule','get_landing_images','get_public_gym',
    'get_gym_slug_by_domain','get_camp_spots_left','submit_trial_inquiry',
    'submit_public_lead',
    'is_staff','get_user_role','get_user_gym_id','is_gym_admin','is_platform_admin',
    'is_active_gym','is_public_class','is_guardian_of','is_guardian_of_profile',
    'recipient_in_gym'
  ];
BEGIN
  -- V1 — PUBLIC-executable definer functions.
  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_pub, v_pub_list
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proacl,'{}')) a WHERE a::text LIKE '=%');

  -- V2 — definer functions with no pinned search_path.
  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_unpin, v_unpin_list
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');

  -- V3 — definer functions granted to anon that are not on the reviewed allowlist.
  SELECT count(*), string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO v_anon, v_anon_list
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proacl,'{}')) a WHERE a::text LIKE 'anon=%')
    AND NOT (p.proname = ANY(anon_allow));

  IF v_pub > 0 THEN
    RAISE EXCEPTION E'DEFINER-POSTURE V1 FAILED: % SECURITY DEFINER function(s) are PUBLIC-executable:\n  %\nAdd  REVOKE ALL ON FUNCTION <fn>(<args>) FROM PUBLIC;  — see migration 000096.', v_pub, v_pub_list;
  END IF;
  IF v_unpin > 0 THEN
    RAISE EXCEPTION E'DEFINER-POSTURE V2 FAILED: % SECURITY DEFINER function(s) have no pinned search_path:\n  %\nAdd  SET search_path = public  (or ALTER FUNCTION … SET search_path) — see migration 000096.', v_unpin, v_unpin_list;
  END IF;
  IF v_anon > 0 THEN
    RAISE EXCEPTION E'DEFINER-POSTURE V3 FAILED: % SECURITY DEFINER function(s) grant EXECUTE to anon but are not on the reviewed allowlist:\n  %\nEither  REVOKE ALL ON FUNCTION <fn>(<args>) FROM anon;  (staff/member/internal RPC) or, if genuinely public, add it to the ANON allowlist in this guard AND migration 000096.', v_anon, v_anon_list;
  END IF;

  RAISE NOTICE 'DEFINER-POSTURE guard PASSED — no PUBLIC execute, every definer function has a pinned search_path, and anon EXECUTE is confined to the reviewed landing + RLS-helper allowlist.';
END $$;
