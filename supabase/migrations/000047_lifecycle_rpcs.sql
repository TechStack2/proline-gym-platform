-- ============================================================
-- 000047: MEMBERSHIP LIFECYCLE — RPCS + TICK + SCHEDULER (V1 / ML-1, part 2 of 3)
-- PRO LINE Gym Platform
--
-- ARCHITECTURE (the locked rule): all UI states are computed at read time;
-- this ONE idempotent tick materializes side-effects only —
--   1. auto-unfreeze (planned date reached)
--   2. issue renewal invoices (BOTH products) via _system_issue_invoice
--      (payer auto-resolves per B3) — idempotent via renewal_invoices'
--      UNIQUE(product, period_start)
--   3. dunning reminders at due and due+3d — idempotent via
--      notifications.dedup_key
--   4. flip LAPSED (memberships) / SUSPENDED (registrations, seat frees →
--      B2 _promote_next_waitlisted fires) — idempotent by current-state guard
--
-- ACTIVATION ON PAYMENT (the named D1-canon decision, database-reviewer):
-- an AFTER UPDATE trigger on invoices (pending→paid edge) applies the linked
-- renewal — record_payment stays BYTE-IDENTICAL; D1's overpayment/status
-- logic untouched. The trigger is additive and fires for ANY paid path.
--
-- SCHEDULER: pg_cron — chosen because the project is Supabase cloud where
-- pg_cron ships natively (zero external moving parts, no token in CI, fires
-- even if GitHub is down). Guarded DO block: if the extension is unavailable
-- the migration still applies and the documented fallback is a GH-Actions
-- cron through the existing run_sql plumbing. The staff wrapper
-- (process_renewals_now) is gym-scoped and drives the e2e deterministically.
-- ============================================================

-- ------------------------------------------------------------
-- Internal issuers (idempotent: the renewal_invoices UNIQUE is the guard)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _issue_membership_renewal(p_membership_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m      student_memberships;
  v_s      students;
  v_plan   membership_plans;
  v_start  DATE;
  v_end    DATE;
  v_inv    invoices;
  v_rate   NUMERIC;
  v_rdate  DATE;
  v_lbp    NUMERIC;
BEGIN
  SELECT * INTO v_m FROM student_memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_m.id IS NULL OR v_m.status NOT IN ('active', 'lapsed', 'expired') THEN RETURN NULL; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_m.student_id;
  -- Price/duration honor a pending NEXT-CYCLE plan change at ISSUE time.
  SELECT * INTO v_plan FROM membership_plans WHERE id = COALESCE(v_m.pending_plan_id, v_m.plan_id);

  v_start := v_m.end_date;
  v_end   := v_m.end_date + v_plan.duration_days;
  -- Idempotency: one renewal per period, enforced by the unique link.
  IF EXISTS (SELECT 1 FROM renewal_invoices
             WHERE product_type = 'membership' AND product_id = v_m.id AND period_start = v_start) THEN
    RETURN NULL;
  END IF;

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;
  v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_plan.price_usd * v_rate) ELSE COALESCE(v_plan.price_lbp, 0) END;
  v_inv := _system_issue_invoice(
    v_s.gym_id, v_m.student_id, 'membership', v_plan.price_usd, v_lbp, v_rate, v_rdate,
    v_m.id, v_start,
    'Renewal: ' || COALESCE(v_plan.name_en, '') || ' (' || v_start || ' → ' || v_end || ')',
    'تجديد: ' || COALESCE(v_plan.name_ar, ''),
    'Renouvellement : ' || COALESCE(v_plan.name_fr, ''),
    NULL);

  INSERT INTO renewal_invoices (invoice_id, product_type, product_id, period_start, period_end)
  VALUES (v_inv.id, 'membership', v_m.id, v_start, v_end);

  -- Member nudge (dedup-guarded; login-less members have no auth row).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
    VALUES (v_s.profile_id, v_s.gym_id, 'renewal_due',
            'messages.renewal_due.title', 'messages.renewal_due.body',
            jsonb_build_object('amount', v_inv.total_usd, 'date', v_start),
            'invoice', v_inv.id, '/portal/billing',
            'renewal_membership_' || v_m.id || '_' || v_start)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_inv.id;
END;
$$;
REVOKE ALL ON FUNCTION _issue_membership_renewal(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION _issue_registration_renewal(p_reg_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r     class_registrations;
  v_s     students;
  v_cls   classes;
  v_net   NUMERIC;
  v_start DATE;
  v_end   DATE;
  v_inv   invoices;
  v_rate  NUMERIC;
  v_rdate DATE;
  v_lbp   NUMERIC;
BEGIN
  SELECT * INTO v_r FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_r.id IS NULL OR v_r.status NOT IN ('active', 'suspended') THEN RETURN NULL; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_r.student_id;
  SELECT * INTO v_cls FROM classes WHERE id = v_r.class_id;

  v_start := COALESCE(v_r.paid_until, COALESCE(v_r.start_date, v_r.requested_at::date) + 30);
  v_end   := v_start + 30;
  IF EXISTS (SELECT 1 FROM renewal_invoices
             WHERE product_type = 'class_registration' AND product_id = v_r.id AND period_start = v_start) THEN
    RETURN NULL;
  END IF;

  -- The B2 net-fee discipline (same formula approve used: % then fixed, floor 0).
  v_net := GREATEST(0, round(COALESCE(v_r.monthly_fee_usd, v_cls.monthly_fee_usd, 0)
                             * (1 - COALESCE(v_r.discount_pct, 0) / 100), 2)
                       - COALESCE(v_r.discount_amount_usd, 0));
  IF v_net <= 0.005 THEN RETURN NULL; END IF; -- fully discounted: nothing to bill

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;
  v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE 0 END;
  v_inv := _system_issue_invoice(
    v_s.gym_id, v_r.student_id, 'class_registration', v_net, v_lbp, v_rate, v_rdate,
    NULL, v_start,
    'Class renewal: ' || COALESCE(v_cls.name_en, '') || ' (' || v_start || ' → ' || v_end || ')',
    'تجديد حصة: ' || COALESCE(v_cls.name_ar, ''),
    'Renouvellement cours : ' || COALESCE(v_cls.name_fr, ''),
    NULL);

  INSERT INTO renewal_invoices (invoice_id, product_type, product_id, period_start, period_end)
  VALUES (v_inv.id, 'class_registration', v_r.id, v_start, v_end);

  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
    VALUES (v_s.profile_id, v_s.gym_id, 'renewal_due',
            'messages.renewal_due.title', 'messages.renewal_due.body',
            jsonb_build_object('amount', v_inv.total_usd, 'date', v_start),
            'invoice', v_inv.id, '/portal/billing',
            'renewal_registration_' || v_r.id || '_' || v_start)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_inv.id;
END;
$$;
REVOKE ALL ON FUNCTION _issue_registration_renewal(UUID) FROM PUBLIC;

-- ------------------------------------------------------------
-- THE TICK — global (cron, p_gym_id NULL) or gym-scoped (staff wrapper).
-- Idempotent by construction: unique link (issues), dedup_key (reminders),
-- current-state guards (flips). Returns a summary for the staff toast.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_lifecycle_tick(p_gym_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unfrozen  INTEGER := 0;
  v_issued    INTEGER := 0;
  v_reminded  INTEGER := 0;
  v_lapsed    INTEGER := 0;
  v_suspended INTEGER := 0;
  r RECORD;
BEGIN
  -- 1. AUTO-UNFREEZE: planned date reached → active (end_date was already
  --    extended at freeze time; the freeze row closes at its planned value).
  FOR r IN
    SELECT m.id FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    WHERE m.status = 'paused' AND m.pause_end_date IS NOT NULL AND m.pause_end_date <= CURRENT_DATE
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    UPDATE membership_freezes SET actual_end_date = planned_end_date
    WHERE membership_id = r.id AND actual_end_date IS NULL;
    UPDATE student_memberships
    SET status = 'active', pause_start_date = NULL, pause_end_date = NULL, updated_at = now()
    WHERE id = r.id;
    v_unfrozen := v_unfrozen + 1;
  END LOOP;

  -- 2a. MEMBERSHIP RENEWALS inside lead time (frozen excluded by status guard).
  FOR r IN
    SELECT m.id FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    JOIN gyms g ON g.id = s.gym_id
    WHERE m.status = 'active'
      AND m.end_date <= CURRENT_DATE + g.renewal_lead_days
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    IF _issue_membership_renewal(r.id) IS NOT NULL THEN v_issued := v_issued + 1; END IF;
  END LOOP;

  -- 2b. REGISTRATION RENEWALS inside lead time.
  FOR r IN
    SELECT cr.id FROM class_registrations cr
    JOIN gyms g ON g.id = cr.gym_id
    WHERE cr.status = 'active'
      AND COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          <= CURRENT_DATE + g.renewal_lead_days
      AND (p_gym_id IS NULL OR cr.gym_id = p_gym_id)
  LOOP
    IF _issue_registration_renewal(r.id) IS NOT NULL THEN v_issued := v_issued + 1; END IF;
  END LOOP;

  -- 3. DUNNING REMINDERS on open renewal invoices: at due, and at due+3d.
  FOR r IN
    SELECT i.id AS invoice_id, i.due_date, i.total_usd, s.profile_id, s.gym_id AS gid,
           (CURRENT_DATE >= i.due_date + 3) AS second_nudge
    FROM renewal_invoices ri
    JOIN invoices i ON i.id = ri.invoice_id
    JOIN students s ON s.id = i.student_id
    WHERE i.status IN ('pending', 'partial')
      AND i.due_date <= CURRENT_DATE
      AND (p_gym_id IS NULL OR i.gym_id = p_gym_id)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'renewal_reminder',
              'messages.renewal_reminder.title', 'messages.renewal_reminder.body',
              jsonb_build_object('amount', r.total_usd),
              'invoice', r.invoice_id, '/portal/billing',
              'remind_' || (CASE WHEN r.second_nudge THEN '3_' ELSE '0_' END) || r.invoice_id)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      IF FOUND THEN v_reminded := v_reminded + 1; END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- 4a. LAPSE memberships past end+grace with NO PAID renewal for the period.
  FOR r IN
    SELECT m.id, m.end_date, s.profile_id, s.gym_id AS gid
    FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    JOIN gyms g ON g.id = s.gym_id
    WHERE m.status = 'active'
      AND m.end_date + g.dunning_grace_days < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM renewal_invoices ri JOIN invoices i ON i.id = ri.invoice_id
        WHERE ri.product_type = 'membership' AND ri.product_id = m.id
          AND ri.period_start = m.end_date AND i.status = 'paid'
      )
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    UPDATE student_memberships SET status = 'lapsed', updated_at = now() WHERE id = r.id;
    v_lapsed := v_lapsed + 1;
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'membership_lapsed',
              'messages.membership_lapsed.title', 'messages.membership_lapsed.body',
              '{}'::jsonb, 'student_membership', r.id, '/portal/billing',
              'lapsed_' || r.id || '_' || r.end_date)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- 4b. SUSPEND registrations past paid_until+grace (seat frees → B2 promote).
  FOR r IN
    SELECT cr.id, cr.class_id, cr.student_id, cr.gym_id AS gid, s.profile_id,
           COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30) AS anchor
    FROM class_registrations cr
    JOIN gyms g ON g.id = cr.gym_id
    JOIN students s ON s.id = cr.student_id
    WHERE cr.status = 'active'
      AND COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          + g.dunning_grace_days < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM renewal_invoices ri JOIN invoices i ON i.id = ri.invoice_id
        WHERE ri.product_type = 'class_registration' AND ri.product_id = cr.id
          AND ri.period_start = COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          AND i.status = 'paid'
      )
      AND (p_gym_id IS NULL OR cr.gym_id = p_gym_id)
  LOOP
    -- B2 contract: the promote helper expects the caller to hold the class lock.
    PERFORM 1 FROM classes WHERE id = r.class_id FOR UPDATE;
    UPDATE class_registrations SET status = 'suspended', waitlist_position = NULL, updated_at = now()
    WHERE id = r.id;
    UPDATE class_enrollments SET is_active = false
    WHERE class_id = r.class_id AND student_id = r.student_id;
    -- The seat is free — B2's waitlist machinery decides what happens next.
    -- A promotion's first invoice covers a month from TODAY: anchor it so the
    -- next tick doesn't instantly re-bill/suspend the promoted member.
    DECLARE v_promoted UUID;
    BEGIN
      v_promoted := _promote_next_waitlisted(r.class_id);
      IF v_promoted IS NOT NULL THEN
        UPDATE class_registrations
        SET paid_until = CURRENT_DATE + 30, start_date = COALESCE(start_date, CURRENT_DATE)
        WHERE id = v_promoted;
      END IF;
    END;
    v_suspended := v_suspended + 1;
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'registration_suspended',
              'messages.registration_suspended.title', 'messages.registration_suspended.body',
              '{}'::jsonb, 'class_registration', r.id, '/portal/billing',
              'suspended_' || r.id || '_' || r.anchor)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN jsonb_build_object(
    'unfrozen', v_unfrozen, 'issued', v_issued, 'reminded', v_reminded,
    'lapsed', v_lapsed, 'suspended', v_suspended);
END;
$$;
REVOKE ALL ON FUNCTION run_lifecycle_tick(UUID) FROM PUBLIC;

-- Staff wrapper: own gym only — the "Process renewals now" action + e2e driver.
CREATE OR REPLACE FUNCTION process_renewals_now()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may run the lifecycle tick'; END IF;
  RETURN run_lifecycle_tick(get_user_gym_id());
END;
$$;
REVOKE ALL ON FUNCTION process_renewals_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_renewals_now() TO authenticated;

-- ------------------------------------------------------------
-- ACTIVATION ON PAYMENT — trigger on the pending→paid edge (D1 untouched).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _apply_renewal_activation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link renewal_invoices;
  v_m    student_memberships;
BEGIN
  SELECT * INTO v_link FROM renewal_invoices WHERE invoice_id = NEW.id;
  IF v_link.invoice_id IS NULL THEN RETURN NEW; END IF;

  IF v_link.product_type = 'membership' THEN
    SELECT * INTO v_m FROM student_memberships WHERE id = v_link.product_id FOR UPDATE;
    IF v_m.id IS NOT NULL THEN
      UPDATE student_memberships
      SET plan_id = COALESCE(pending_plan_id, plan_id),
          pending_plan_id = NULL,
          end_date = GREATEST(end_date, v_link.period_end),
          status = CASE WHEN status IN ('lapsed', 'expired') THEN 'active'::membership_status_enum ELSE status END,
          updated_at = now()
      WHERE id = v_m.id;
    END IF;
  ELSE
    UPDATE class_registrations
    SET paid_until = GREATEST(COALESCE(paid_until, v_link.period_start), v_link.period_end),
        status = CASE WHEN status = 'suspended' THEN 'active'::class_registration_status_enum ELSE status END,
        updated_at = now()
    WHERE id = v_link.product_id;
    -- Re-project the roster seat on reactivation (capacity may transiently
    -- exceed if the seat was re-given — desk reality, named in the audit).
    INSERT INTO class_enrollments (class_id, student_id, is_active)
    SELECT cr.class_id, cr.student_id, true FROM class_registrations cr
    WHERE cr.id = v_link.product_id AND cr.status = 'active'
    ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid_renewal ON invoices;
CREATE TRIGGER trg_invoice_paid_renewal
  AFTER UPDATE OF status ON invoices
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION _apply_renewal_activation();

-- ------------------------------------------------------------
-- Staff actions: freeze / unfreeze / plan change / renew now / reinstate
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION freeze_membership(p_membership_id UUID, p_days INTEGER)
RETURNS student_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m    student_memberships;
  v_s    students;
  v_gym  gyms;
  v_used INTEGER;
BEGIN
  SELECT * INTO v_m FROM student_memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_m.student_id;
  SELECT * INTO v_gym FROM gyms WHERE id = v_s.gym_id;
  IF NOT (is_staff() AND v_s.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may freeze a membership';
  END IF;
  IF v_m.status <> 'active' THEN RAISE EXCEPTION 'Only an active membership can be frozen (status %)', v_m.status; END IF;

  IF p_days IS NULL OR p_days < COALESCE(v_gym.freeze_min_chunk_days, 7) THEN
    RAISE EXCEPTION 'Freeze must be at least % days', COALESCE(v_gym.freeze_min_chunk_days, 7);
  END IF;
  SELECT COALESCE(SUM(days_frozen), 0) INTO v_used FROM membership_freezes
  WHERE membership_id = p_membership_id
    AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE);
  IF v_used + p_days > COALESCE(v_gym.freeze_max_days_year, 30) THEN
    RAISE EXCEPTION 'Freeze limit: % of % days already used this year — % more would exceed the policy',
      v_used, COALESCE(v_gym.freeze_max_days_year, 30), p_days;
  END IF;

  INSERT INTO membership_freezes (membership_id, start_date, planned_end_date, days_frozen, created_by)
  VALUES (p_membership_id, CURRENT_DATE, CURRENT_DATE + p_days, p_days, auth.uid());

  UPDATE student_memberships
  SET status = 'paused', pause_start_date = CURRENT_DATE, pause_end_date = CURRENT_DATE + p_days,
      end_date = end_date + p_days, updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_m;
  RETURN v_m;
END;
$$;
REVOKE ALL ON FUNCTION freeze_membership(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION freeze_membership(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION unfreeze_membership(p_membership_id UUID)
RETURNS student_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m      student_memberships;
  v_s      students;
  v_unused INTEGER;
BEGIN
  SELECT * INTO v_m FROM student_memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_m.student_id;
  IF NOT (is_staff() AND v_s.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may unfreeze a membership';
  END IF;
  IF v_m.status <> 'paused' THEN RAISE EXCEPTION 'Membership is not frozen (status %)', v_m.status; END IF;

  -- Early unfreeze: give back the unused days (end_date had the full extension).
  v_unused := GREATEST(0, v_m.pause_end_date - CURRENT_DATE);
  UPDATE membership_freezes
  SET actual_end_date = CURRENT_DATE, days_frozen = GREATEST(0, days_frozen - v_unused)
  WHERE membership_id = p_membership_id AND actual_end_date IS NULL;

  UPDATE student_memberships
  SET status = 'active', end_date = end_date - v_unused,
      pause_start_date = NULL, pause_end_date = NULL, updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_m;
  RETURN v_m;
END;
$$;
REVOKE ALL ON FUNCTION unfreeze_membership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unfreeze_membership(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION change_membership_plan(p_membership_id UUID, p_plan_id UUID)
RETURNS student_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m student_memberships;
  v_s students;
BEGIN
  SELECT * INTO v_m FROM student_memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_m.student_id;
  IF NOT (is_staff() AND v_s.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may change the plan';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM membership_plans WHERE id = p_plan_id AND gym_id = v_s.gym_id AND is_active) THEN
    RAISE EXCEPTION 'Plan is not an active plan of this gym';
  END IF;

  -- NEXT CYCLE, no proration (operator-locked): recorded now, applied at renewal.
  UPDATE student_memberships SET pending_plan_id = p_plan_id, updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_m;
  RETURN v_m;
END;
$$;
REVOKE ALL ON FUNCTION change_membership_plan(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_membership_plan(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION renew_now(p_membership_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s students;
BEGIN
  SELECT s.* INTO v_s FROM students s
  JOIN student_memberships m ON m.student_id = s.id
  WHERE m.id = p_membership_id;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;
  IF NOT (is_staff() AND v_s.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may issue a renewal';
  END IF;
  RETURN _issue_membership_renewal(p_membership_id); -- NULL = already issued (idempotent)
END;
$$;
REVOKE ALL ON FUNCTION renew_now(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION renew_now(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION reinstate_membership(p_membership_id UUID)
RETURNS student_memberships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m student_memberships;
  v_s students;
BEGIN
  SELECT * INTO v_m FROM student_memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Membership % not found', p_membership_id; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_m.student_id;
  IF NOT (is_staff() AND v_s.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may reinstate a membership';
  END IF;
  IF v_m.status <> 'lapsed' THEN RAISE EXCEPTION 'Only a lapsed membership can be reinstated (status %)', v_m.status; END IF;

  -- Goodwill: back to active with the lapse boundary pushed to today — the
  -- open renewal still chases; the tick re-lapses only after a fresh grace.
  UPDATE student_memberships
  SET status = 'active', end_date = GREATEST(end_date, CURRENT_DATE), updated_at = now()
  WHERE id = p_membership_id
  RETURNING * INTO v_m;
  RETURN v_m;
END;
$$;
REVOKE ALL ON FUNCTION reinstate_membership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reinstate_membership(UUID) TO authenticated;

-- ------------------------------------------------------------
-- SCHEDULER: pg_cron (native on Supabase cloud — zero external moving parts).
-- Guarded: if unavailable, the documented fallback is a GH-Actions cron via
-- the run_sql plumbing; the staff wrapper covers the manual/e2e path either way.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('lifecycle-tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lifecycle-tick');
    PERFORM cron.schedule('lifecycle-tick', '15 2 * * *', $cron$SELECT run_lifecycle_tick();$cron$);
    RAISE NOTICE 'lifecycle-tick scheduled daily 02:15 UTC via pg_cron';
  ELSE
    RAISE NOTICE 'pg_cron unavailable — schedule run_lifecycle_tick() via GH-Actions run_sql cron';
  END IF;
END $$;
