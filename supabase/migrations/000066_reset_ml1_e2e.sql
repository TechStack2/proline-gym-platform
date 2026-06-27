-- ============================================================
-- 000066: ML-1 RETRY-SAFE RESEED — e2e-only, service-role (test stability)
-- PRO LINE Gym Platform
--
-- WHY. ml1.spec's first test is SINGLE-SHOT STATEFUL: it consumes Karim's
-- "ending-today" seed (renews → +30d), lapses Omar, promotes Lina. Under the full
-- 54-project gate the single `next start` app server saturates and a post-tick
-- read can render >180s, so attempt 1 occasionally fails — and `retries:2` cannot
-- recover, because by then the seed is gone (Karim renewed, Omar reinstated). The
-- spec must therefore pass FIRST-TRY 100%, which is impossible against the
-- app-server saturation ceiling.
--
-- FIX. This RPC restores the three ML-1 actors to their EXACT seed state
-- (mirrors 000040 FD-1 + 000048 ML-1). ml1.spec calls it from a beforeEach (the
-- flaky test only) via the SERVICE ROLE — a direct DB write that bypasses the
-- saturated app server, so it is fast under load. Each attempt (incl. retries)
-- then starts clean → `retries:2` recover any single-attempt saturation flake.
--
-- e2e-ONLY + SAFE: SECURITY DEFINER, REVOKE FROM PUBLIC, GRANT to service_role
-- ONLY (never anon/authenticated → not reachable from the app or a user token);
-- scoped to one gym slug. Additive — no schema change, no product surface.
-- ============================================================

CREATE OR REPLACE FUNCTION reset_ml1_e2e(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym   UUID;
  v_karim UUID;
  v_omar  UUID;
  v_lina  UUID;
  v_plan  UUID;
  v_cls   UUID;
  v_three UUID[];
BEGIN
  SELECT id INTO v_gym FROM gyms WHERE slug = p_slug;
  IF v_gym IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_karim FROM students s JOIN profiles p ON p.id = s.profile_id
   WHERE s.gym_id = v_gym AND p.first_name_en = 'Karim' LIMIT 1;
  SELECT s.id INTO v_omar  FROM students s JOIN profiles p ON p.id = s.profile_id
   WHERE s.gym_id = v_gym AND p.first_name_en = 'Omar'  LIMIT 1;
  SELECT s.id INTO v_lina  FROM students s JOIN profiles p ON p.id = s.profile_id
   WHERE s.gym_id = v_gym AND p.first_name_en = 'Lina'  LIMIT 1;
  SELECT id INTO v_plan FROM membership_plans
   WHERE gym_id = v_gym AND is_active = true ORDER BY price_usd ASC LIMIT 1;
  v_three := ARRAY[v_karim, v_omar, v_lina];

  -- ── Wipe what the seed + the spec created for the three actors (FK-safe order) ──
  DELETE FROM notifications
   WHERE user_id IN (SELECT profile_id FROM students WHERE id = ANY(v_three));
  DELETE FROM membership_freezes mf USING student_memberships sm
   WHERE mf.membership_id = sm.id AND sm.student_id = ANY(v_three);
  DELETE FROM payments WHERE student_id = ANY(v_three);
  DELETE FROM invoices WHERE student_id = ANY(v_three);
  DELETE FROM student_memberships WHERE student_id = ANY(v_three);

  SELECT id INTO v_cls FROM classes
   WHERE gym_id = v_gym AND name_en = 'Lifecycle Class' LIMIT 1;
  IF v_cls IS NOT NULL THEN
    DELETE FROM class_enrollments   WHERE class_id = v_cls;
    DELETE FROM class_registrations WHERE class_id = v_cls;
  END IF;

  -- ── Re-seed (forceful, NOT idempotent-skip) — exactly 000040 + 000048 ──
  -- Karim: membership ENDING TODAY (the clean renewal/idempotency fixture) + the
  -- FD-1 open invoice DUE TODAY (canonical issuance, for seed fidelity).
  IF v_karim IS NOT NULL AND v_plan IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
    VALUES (v_karim, v_plan, CURRENT_DATE - 30, CURRENT_DATE, 'active');
    PERFORM _system_issue_invoice(
      v_gym, v_karim, 'membership'::invoice_type_enum,
      45, 0, NULL, NULL, NULL, CURRENT_DATE,
      'FD-1 seed — due today', 'بذرة FD-1 — تستحق اليوم', 'Seed FD-1 — échéance aujourd''hui',
      NULL);
  END IF;

  -- Omar: membership ENDED -15d, still active → the tick's lapse fixture.
  IF v_omar IS NOT NULL AND v_plan IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
    VALUES (v_omar, v_plan, CURRENT_DATE - 45, CURRENT_DATE - 15, 'active');
  END IF;

  -- Lifecycle Class (kept): Omar active unpaid (paid_until -15d), Lina waitlisted #1.
  IF v_cls IS NOT NULL THEN
    IF v_omar IS NOT NULL THEN
      INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, start_date, paid_until, requested_at, approved_at)
      VALUES (v_cls, v_omar, v_gym, 'active', 40.00, CURRENT_DATE - 45, CURRENT_DATE - 15, now() - INTERVAL '45 days', now() - INTERVAL '45 days');
      INSERT INTO class_enrollments (class_id, student_id, is_active)
      VALUES (v_cls, v_omar, true)
      ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;
    END IF;
    IF v_lina IS NOT NULL THEN
      INSERT INTO class_registrations (class_id, student_id, gym_id, status, waitlist_position, monthly_fee_usd, requested_at)
      VALUES (v_cls, v_lina, v_gym, 'waitlisted', 1, 40.00, now() - INTERVAL '40 days');
    END IF;
  END IF;
END;
$$;

-- e2e-only: never reachable from the app or a user token.
REVOKE ALL ON FUNCTION reset_ml1_e2e(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_ml1_e2e(TEXT) TO service_role;
