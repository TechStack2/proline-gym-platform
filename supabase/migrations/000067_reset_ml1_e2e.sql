-- ============================================================
-- 000067: ML-1 RETRY-SAFE RESEED — e2e-only, service-role (test stability)
-- PRO LINE Gym Platform
--
-- WHY. ml1.spec's first test is SINGLE-SHOT STATEFUL: it consumes Karim's
-- "ending-today" seed (renews → +30d), lapses Omar, promotes Lina. Under the full
-- 54-project gate the single `next start` app server saturates and a post-tick
-- read can render >180s, so attempt 1 occasionally fails — and `retries:2` cannot
-- recover, because by then the seed is gone (Karim renewed, Omar reinstated).
--
-- FIX. This RPC restores the three ML-1 actors to their seed state. ml1.spec calls
-- it from a beforeEach (the flaky tick test only) via the SERVICE ROLE — a direct
-- DB write that bypasses the saturated app server, so it is fast under load. Each
-- attempt (incl. retries) then starts clean → `retries:2` recover any flake.
--
-- IMPORTANT — never DELETE invoices. `generate_invoice_number` (000005) is
-- COUNT(*)+1, so deleting an invoice makes the NEXT issuance re-use a number and
-- collide (23505). The reset instead CANCELS the actors' invoices (count
-- preserved) + drops their `renewal_invoices` LINKS (so the tick re-issues) +
-- restores memberships/registrations via UPDATE.
--
-- e2e-ONLY + SAFE: SECURITY DEFINER, REVOKE FROM PUBLIC, GRANT service_role ONLY
-- (never anon/authenticated → not reachable from the app or a user token); scoped
-- to one gym slug. Additive — no schema change, no product surface.
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
  SELECT id INTO v_cls FROM classes WHERE gym_id = v_gym AND name_en = 'Lifecycle Class' LIMIT 1;
  v_three := ARRAY[v_karim, v_omar, v_lina];

  -- ── Undo what the spec wrote (NO invoice deletes — see header) ──
  -- Drop the renewal LINKS so the tick re-issues; void the invoices + payments.
  DELETE FROM renewal_invoices ri USING invoices i
   WHERE ri.invoice_id = i.id AND i.student_id = ANY(v_three);
  DELETE FROM payments WHERE student_id = ANY(v_three);
  UPDATE invoices SET status = 'cancelled', updated_at = now()
   WHERE student_id = ANY(v_three) AND status <> 'cancelled';
  DELETE FROM membership_freezes mf USING student_memberships sm
   WHERE mf.membership_id = sm.id AND sm.student_id = ANY(v_three);
  DELETE FROM notifications
   WHERE user_id IN (SELECT profile_id FROM students WHERE id = ANY(v_three));

  -- ── Restore the fixture state via UPDATE (insert only if somehow absent) ──
  -- Karim: membership ENDING TODAY, active, no pending plan / freeze.
  IF v_karim IS NOT NULL AND v_plan IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM student_memberships WHERE student_id = v_karim) THEN
      UPDATE student_memberships
      SET plan_id = v_plan, start_date = CURRENT_DATE - 30, end_date = CURRENT_DATE,
          status = 'active', pending_plan_id = NULL,
          pause_start_date = NULL, pause_end_date = NULL, updated_at = now()
      WHERE student_id = v_karim;
    ELSE
      INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
      VALUES (v_karim, v_plan, CURRENT_DATE - 30, CURRENT_DATE, 'active');
    END IF;
  END IF;

  -- Omar: membership ENDED -15d, still active → the tick's lapse fixture.
  IF v_omar IS NOT NULL AND v_plan IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM student_memberships WHERE student_id = v_omar) THEN
      UPDATE student_memberships
      SET plan_id = v_plan, start_date = CURRENT_DATE - 45, end_date = CURRENT_DATE - 15,
          status = 'active', pending_plan_id = NULL,
          pause_start_date = NULL, pause_end_date = NULL, updated_at = now()
      WHERE student_id = v_omar;
    ELSE
      INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
      VALUES (v_omar, v_plan, CURRENT_DATE - 45, CURRENT_DATE - 15, 'active');
    END IF;
  END IF;

  -- Lifecycle Class (kept): Omar active unpaid (paid_until -15d) + enrolled; Lina
  -- waitlisted #1 + NOT enrolled.
  IF v_cls IS NOT NULL THEN
    IF v_omar IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM class_registrations WHERE class_id = v_cls AND student_id = v_omar) THEN
        UPDATE class_registrations
        SET status = 'active', start_date = CURRENT_DATE - 45, paid_until = CURRENT_DATE - 15,
            waitlist_position = NULL, updated_at = now()
        WHERE class_id = v_cls AND student_id = v_omar;
      ELSE
        INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, start_date, paid_until, requested_at, approved_at)
        VALUES (v_cls, v_omar, v_gym, 'active', 40.00, CURRENT_DATE - 45, CURRENT_DATE - 15, now() - INTERVAL '45 days', now() - INTERVAL '45 days');
      END IF;
      INSERT INTO class_enrollments (class_id, student_id, is_active)
      VALUES (v_cls, v_omar, true)
      ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;
    END IF;
    IF v_lina IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM class_registrations WHERE class_id = v_cls AND student_id = v_lina) THEN
        UPDATE class_registrations
        SET status = 'waitlisted', waitlist_position = 1, paid_until = NULL, updated_at = now()
        WHERE class_id = v_cls AND student_id = v_lina;
      ELSE
        INSERT INTO class_registrations (class_id, student_id, gym_id, status, waitlist_position, monthly_fee_usd, requested_at)
        VALUES (v_cls, v_lina, v_gym, 'waitlisted', 1, 40.00, now() - INTERVAL '40 days');
      END IF;
      DELETE FROM class_enrollments WHERE class_id = v_cls AND student_id = v_lina;
    END IF;
  END IF;
END;
$$;

-- e2e-only: never reachable from the app or a user token.
REVOKE ALL ON FUNCTION reset_ml1_e2e(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_ml1_e2e(TEXT) TO service_role;
