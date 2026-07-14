-- ============================================================
-- CI PROOF (AUDIT-TRIGGERS / migration 000099) — the four newly-covered tables
-- each write a create + update + delete audit row.
--
-- Runs against the from-zero replayed DB (.github/workflows/db-replay-check.yml).
-- For each of coaches / classes / camps / user_roles it INSERTs a throwaway row,
-- UPDATEs it, then DELETEs it, and asserts audit_trigger_fn() (000005) wrote an
-- audit_logs row for EACH operation (create/update/delete) keyed by the row's id
-- (= audit_logs.record_id, both UUID). Per-table evidence, not one sample.
--
-- Runs as the superuser session (psql on the local stack) → bypasses RLS, so the
-- probe inserts and the audit_logs reads both succeed. Everything is inside a
-- transaction that is ROLLBACK'd — no probe rows and no probe audit rows persist
-- (and on any RAISE, ON_ERROR_STOP=1 aborts + the aborted txn is discarded).
-- RAISE EXCEPTION on any missing audit row → the db-replay job goes red, making
-- the trail a PERMANENT guard: dropping any of these triggers turns this step red.
--
-- Reused seed IDs come from the from-zero migration seed (000006 gym/disciplines/
-- coaches/profiles, 000008 user_roles). camps is not seeded from zero, so its
-- probe row is fully synthetic (only gym_id + the NOT NULL columns).
-- ============================================================

\echo '── AUDIT-TRIGGERS proof — coaches/classes/camps/user_roles each log create+update+delete ──'

BEGIN;

DO $$
DECLARE
  v_gym     uuid;
  v_disc    uuid;
  v_coach   uuid;
  v_profile uuid;
  v_user    uuid;
  v_id      uuid;
  v_c int; v_u int; v_d int;
  fails text := '';
BEGIN
  SELECT id INTO v_gym     FROM gyms        WHERE slug = 'proline-gym';
  IF v_gym IS NULL THEN RAISE EXCEPTION 'AUDIT-TRIGGERS setup FAIL: base seed gym proline-gym absent'; END IF;
  SELECT id      INTO v_disc    FROM disciplines WHERE gym_id = v_gym LIMIT 1;
  SELECT id      INTO v_coach   FROM coaches     WHERE gym_id = v_gym LIMIT 1;
  SELECT id      INTO v_profile FROM profiles    WHERE gym_id = v_gym LIMIT 1;
  SELECT user_id INTO v_user    FROM user_roles  WHERE gym_id = v_gym AND role = 'owner' LIMIT 1;
  IF v_disc IS NULL OR v_coach IS NULL OR v_profile IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'AUDIT-TRIGGERS setup FAIL: missing seed prereq (disc=% coach=% profile=% user=%)',
      v_disc, v_coach, v_profile, v_user;
  END IF;

  -- ===== coaches (soft-delete table; probe still exercises a hard DELETE path) =====
  INSERT INTO coaches (profile_id, gym_id, specialization_en, is_active)
    VALUES (v_profile, v_gym, 'AUDIT-PROBE', true) RETURNING id INTO v_id;
  UPDATE coaches SET specialization_en = 'AUDIT-PROBE-2' WHERE id = v_id;
  DELETE FROM coaches WHERE id = v_id;
  SELECT count(*) FILTER (WHERE operation = 'create'),
         count(*) FILTER (WHERE operation = 'update'),
         count(*) FILTER (WHERE operation = 'delete')
    INTO v_c, v_u, v_d FROM audit_logs WHERE table_name = 'coaches' AND record_id = v_id;
  IF v_c < 1 OR v_u < 1 OR v_d < 1 THEN fails := fails || format(' coaches(c=%s,u=%s,d=%s)', v_c, v_u, v_d); END IF;

  -- ===== classes =====
  INSERT INTO classes (gym_id, discipline_id, coach_id, name_ar, name_en, name_fr)
    VALUES (v_gym, v_disc, v_coach, 'AUDIT-PROBE', 'AUDIT-PROBE', 'AUDIT-PROBE') RETURNING id INTO v_id;
  UPDATE classes SET name_en = 'AUDIT-PROBE-2' WHERE id = v_id;
  DELETE FROM classes WHERE id = v_id;
  SELECT count(*) FILTER (WHERE operation = 'create'),
         count(*) FILTER (WHERE operation = 'update'),
         count(*) FILTER (WHERE operation = 'delete')
    INTO v_c, v_u, v_d FROM audit_logs WHERE table_name = 'classes' AND record_id = v_id;
  IF v_c < 1 OR v_u < 1 OR v_d < 1 THEN fails := fails || format(' classes(c=%s,u=%s,d=%s)', v_c, v_u, v_d); END IF;

  -- ===== camps (not seeded from zero → fully synthetic probe row) =====
  INSERT INTO camps (gym_id, name_ar, name_en, name_fr, start_date, end_date, max_capacity, price_usd)
    VALUES (v_gym, 'AUDIT-PROBE', 'AUDIT-PROBE', 'AUDIT-PROBE', CURRENT_DATE, CURRENT_DATE + 1, 10, 100)
    RETURNING id INTO v_id;
  UPDATE camps SET name_en = 'AUDIT-PROBE-2' WHERE id = v_id;
  DELETE FROM camps WHERE id = v_id;
  SELECT count(*) FILTER (WHERE operation = 'create'),
         count(*) FILTER (WHERE operation = 'update'),
         count(*) FILTER (WHERE operation = 'delete')
    INTO v_c, v_u, v_d FROM audit_logs WHERE table_name = 'camps' AND record_id = v_id;
  IF v_c < 1 OR v_u < 1 OR v_d < 1 THEN fails := fails || format(' camps(c=%s,u=%s,d=%s)', v_c, v_u, v_d); END IF;

  -- ===== user_roles (the security-relevant gap; hard DELETE = a revoke) =====
  -- role='head_coach' on the seeded owner → free of the UNIQUE(user_id,role,gym_id).
  INSERT INTO user_roles (user_id, gym_id, role) VALUES (v_user, v_gym, 'head_coach') RETURNING id INTO v_id;
  UPDATE user_roles SET is_primary = true WHERE id = v_id;
  DELETE FROM user_roles WHERE id = v_id;
  SELECT count(*) FILTER (WHERE operation = 'create'),
         count(*) FILTER (WHERE operation = 'update'),
         count(*) FILTER (WHERE operation = 'delete')
    INTO v_c, v_u, v_d FROM audit_logs WHERE table_name = 'user_roles' AND record_id = v_id;
  IF v_c < 1 OR v_u < 1 OR v_d < 1 THEN fails := fails || format(' user_roles(c=%s,u=%s,d=%s)', v_c, v_u, v_d); END IF;

  IF length(fails) > 0 THEN
    RAISE EXCEPTION 'AUDIT-TRIGGERS proof FAILED — missing audit rows for:%', fails;
  END IF;
  RAISE NOTICE 'AUDIT-TRIGGERS proof PASSED — coaches/classes/camps/user_roles each log create+update+delete.';
END $$;

ROLLBACK;

\echo '✅ AUDIT-TRIGGERS proof PASSED — the four tables are on the audit trail (create+update+delete each).'
