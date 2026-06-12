-- ============================================================
-- 000041: PT CATALOG + DESK SALE + REFILL THRESHOLDS + EXPIRY (V1 / PT-1)
-- PRO LINE Gym Platform
--
-- STRUCTURAL NOTE (named deviation from the prompt's "pt_package_types"):
-- the schema ALREADY has the catalog/instance split the prompt asks for —
--   · pt_packages    = the gym-scoped TYPE CATALOG (names, session_count,
--                      price_usd/lbp, validity_days, is_active) that 22R's
--                      request flow and every PT surface read today;
--   · pt_assignments = the SOLD package instance (snapshotted sessions_total,
--                      expires_at, coach_id, invoice_id, status).
-- Creating a parallel pt_package_types table would duplicate pt_packages 1:1
-- and strand 22R. This migration therefore EXTENDS the existing catalog
-- (show_on_landing + optional discipline_id) and builds the sale RPC on the
-- existing instance table. Snapshot rule honored: sessions_total and
-- expires_at are stamped at sale; later catalog edits never mutate sold rows.
--
-- Contents:
--   1. Catalog columns: pt_packages.show_on_landing (default false, staged),
--      pt_packages.discipline_id (optional specialty link).
--   2. Anon landing read (the 000035/000036 pattern): active + published types
--      of active gyms ONLY.
--   3. Gym refill policy columns (C1 pattern): pt_refill_sessions_threshold
--      (default 2) + pt_refill_days_threshold (default 7).
--   4. sell_pt_package — atomic staff sale (and the 22R approval path via
--      p_request_id): guards → snapshot → invoice (discount %/fixed, payer
--      auto-resolves per B3 inside _system_issue_invoice) → notifications
--      (best-effort). REVOKE FROM PUBLIC, guards inside.
--   5. extend_pt_package — staff-gated validity extension (audited). Expiry is
--      COMPUTED state (expires_at < now() = frozen) — no enum change, no cron;
--      extending moves expires_at forward which un-freezes by definition.
--   6. complete_pt_session REDEFINED (stays the ONLY credit writer): adds the
--      missing expiry guard (schedule_pt_session already had one) + the
--      refill-threshold member notification on the crossing edge.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catalog columns
-- ------------------------------------------------------------
ALTER TABLE pt_packages
  ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discipline_id UUID REFERENCES disciplines(id);

-- ------------------------------------------------------------
-- 2. Anon landing read — public catalog only (active + published + active gym)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS pt_packages_public_read ON pt_packages;
CREATE POLICY pt_packages_public_read ON pt_packages FOR SELECT TO anon
  USING (is_active AND show_on_landing AND deleted_at IS NULL AND is_active_gym(gym_id));

-- ------------------------------------------------------------
-- 3. Refill thresholds as gym policy (C1 pattern)
-- ------------------------------------------------------------
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS pt_refill_sessions_threshold INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pt_refill_days_threshold INTEGER NOT NULL DEFAULT 7;

-- ------------------------------------------------------------
-- 4. sell_pt_package — the single sale writer (desk sale + 22R approval)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sell_pt_package(
  p_student_id          UUID,
  p_package_id          UUID,
  p_coach_id            UUID,
  p_discount_pct        NUMERIC DEFAULT 0,
  p_discount_amount_usd NUMERIC DEFAULT 0,
  p_request_id          UUID DEFAULT NULL
) RETURNS pt_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg     pt_packages;
  v_student students;
  v_req     pt_assignments;
  v_a       pt_assignments;
  v_net     NUMERIC;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_lbp     NUMERIC;
  v_inv     invoices;
  v_expires TIMESTAMPTZ;
  v_name    TEXT;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may sell PT packages'; END IF;

  SELECT * INTO v_pkg FROM pt_packages WHERE id = p_package_id;
  IF v_pkg.id IS NULL THEN RAISE EXCEPTION 'Package type % not found', p_package_id; END IF;
  IF v_pkg.gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Package type is not in your gym'; END IF;
  IF NOT v_pkg.is_active OR v_pkg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Package type is archived'; END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF v_student.gym_id <> v_pkg.gym_id THEN RAISE EXCEPTION 'Member and package are in different gyms'; END IF;
  IF NOT v_student.is_active THEN RAISE EXCEPTION 'Member is not active'; END IF;

  -- Coach: MANDATORY for a desk sale (allocation binds at sale, §3); the 22R
  -- approval path (p_request_id) may carry NULL — the legacy request semantics
  -- where the coach binds at scheduling (schedule_pt_session requires one).
  IF p_request_id IS NULL AND p_coach_id IS NULL THEN
    RAISE EXCEPTION 'A coach is required for a PT sale';
  END IF;
  IF p_coach_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coaches WHERE id = p_coach_id AND gym_id = v_pkg.gym_id AND is_active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Coach is not an active coach of this gym';
  END IF;

  IF COALESCE(p_discount_pct, 0) < 0 OR COALESCE(p_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 100';
  END IF;

  -- Discount discipline (B2 idiom): % then fixed, floor at zero.
  v_net := GREATEST(0, round(v_pkg.price_usd * (1 - COALESCE(p_discount_pct, 0) / 100), 2)
                        - COALESCE(p_discount_amount_usd, 0));
  v_expires := CASE WHEN v_pkg.validity_days IS NOT NULL
                    THEN now() + make_interval(days => v_pkg.validity_days) END;

  IF p_request_id IS NOT NULL THEN
    -- 22R approval path: ACTIVATE the member's requested row (same writer).
    SELECT * INTO v_req FROM pt_assignments WHERE id = p_request_id FOR UPDATE;
    IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF v_req.status <> 'requested' THEN RAISE EXCEPTION 'Request is not pending (status %)', v_req.status; END IF;
    IF v_req.student_id <> p_student_id OR v_req.package_id <> p_package_id THEN
      RAISE EXCEPTION 'Request does not match the member/package';
    END IF;
    UPDATE pt_assignments
    SET status = 'active', is_active = true, coach_id = COALESCE(p_coach_id, coach_id),
        sessions_total = v_pkg.session_count, sessions_used = 0,
        purchased_at = now(), expires_at = v_expires,
        approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_a;
  ELSE
    INSERT INTO pt_assignments (
      student_id, package_id, coach_id, sessions_total, sessions_used,
      status, is_active, purchased_at, expires_at, approved_by, approved_at
    )
    VALUES (
      p_student_id, p_package_id, p_coach_id, v_pkg.session_count, 0,
      'active', true, now(), v_expires, auth.uid(), now()
    )
    RETURNING * INTO v_a;
  END IF;

  -- Invoice via the canonical issuance path (number/TVA triggers; payer
  -- auto-resolves to the primary guardian for linked minors — B3).
  IF v_net > 0.005 THEN
    SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;
    v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE COALESCE(v_pkg.price_lbp, 0) END;
    v_inv := _system_issue_invoice(
      v_pkg.gym_id, p_student_id, 'pt_package', v_net, v_lbp, v_rate, v_rdate, NULL, NULL,
      'PT package: ' || COALESCE(v_pkg.name_en, ''),
      'باقة تدريب خاص: ' || COALESCE(v_pkg.name_ar, ''),
      'Forfait PT : ' || COALESCE(v_pkg.name_fr, ''),
      NULL);
    UPDATE pt_assignments SET invoice_id = v_inv.id, updated_at = now() WHERE id = v_a.id
    RETURNING * INTO v_a;
  END IF;

  -- Best-effort notifications (member approved/sold + coach assigned) — the
  -- F2 pattern; login-less members have no auth row, so never fail the sale.
  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_pkg.gym_id, 'pt_approved',
            'messages.pt_approved.title', 'messages.pt_approved.body',
            jsonb_build_object('package', COALESCE(v_pkg.name_en, v_pkg.name_ar), 'count', v_a.sessions_total),
            'pt_assignment', v_a.id, '/portal/pt');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT c.profile_id, v_pkg.gym_id, 'pt_assigned',
           'messages.pt_assigned.title', 'messages.pt_assigned.body',
           jsonb_build_object('count', v_a.sessions_total),
           'pt_assignment', v_a.id, '/coach/pt'
    FROM coaches c WHERE c.id = p_coach_id AND c.profile_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_a;
END;
$$;
REVOKE ALL ON FUNCTION sell_pt_package(UUID, UUID, UUID, NUMERIC, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_pt_package(UUID, UUID, UUID, NUMERIC, NUMERIC, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. extend_pt_package — staff goodwill action, audited, un-freezes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION extend_pt_package(
  p_assignment_id UUID,
  p_days          INTEGER DEFAULT 30
) RETURNS pt_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a    pt_assignments;
  v_gym  UUID;
  v_old  TIMESTAMPTZ;
BEGIN
  IF p_days IS NULL OR p_days <= 0 OR p_days > 365 THEN
    RAISE EXCEPTION 'Extension must be between 1 and 365 days';
  END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;
  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = v_a.package_id;
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff of this gym may extend a package';
  END IF;

  v_old := v_a.expires_at;
  -- From the LATER of current expiry / now: extending an expired package
  -- restarts the clock from today (the goodwill semantics), a live one gains
  -- p_days on top.
  UPDATE pt_assignments
  SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days => p_days),
      updated_at = now()
  WHERE id = p_assignment_id
  RETURNING * INTO v_a;

  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('pt_assignments', v_a.id, 'update',
          jsonb_build_object('expires_at', v_old),
          jsonb_build_object('expires_at', v_a.expires_at, 'action', 'extend_pt_package', 'days', p_days),
          auth.uid());

  RETURN v_a;
END;
$$;
REVOKE ALL ON FUNCTION extend_pt_package(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extend_pt_package(UUID, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 6. complete_pt_session — REDEFINED in place (single credit writer intact):
--    + expiry guard (frozen packages reject completion, matching schedule)
--    + refill-threshold member notification on the crossing edge (best-effort)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_pt_session(p_session_id UUID)
RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   pt_sessions;
  v_a         pt_assignments;
  v_gym       UUID;
  v_used      INTEGER;
  v_remaining INTEGER;
  v_thr       INTEGER;
  v_profile   UUID;
  v_pkg_name  TEXT;
BEGIN
  -- Lock the session row (E4 concurrent completion serialized here).
  SELECT * INTO v_session FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;

  -- Idempotent no-op (E1 double-complete: never double-decrement).
  IF v_session.status = 'completed' THEN RETURN v_session; END IF;
  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Cannot complete a % session', v_session.status;
  END IF;
  IF v_session.assignment_id IS NULL THEN RAISE EXCEPTION 'Session has no linked assignment'; END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = v_session.assignment_id FOR UPDATE;
  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = v_a.package_id;

  IF NOT ((is_staff() AND v_gym = get_user_gym_id())
          OR (v_a.coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized to complete this session';
  END IF;

  -- E2: reject completion on an exhausted/inactive assignment.
  IF v_a.status <> 'active' THEN RAISE EXCEPTION 'Assignment is not active (status %)', v_a.status; END IF;
  IF v_a.sessions_remaining <= 0 THEN RAISE EXCEPTION 'Assignment has no remaining credits'; END IF;
  -- PT-1 expiry freeze: a package past validity rejects completion too
  -- (schedule_pt_session already guards; staff Extend un-freezes).
  IF v_a.expires_at IS NOT NULL AND v_a.expires_at < now() THEN
    RAISE EXCEPTION 'Package validity has expired — extend it to continue';
  END IF;

  v_used := v_a.sessions_used + 1;

  -- Both writes in ONE transaction (E11: roll back together on any failure).
  UPDATE pt_sessions SET status = 'completed', updated_at = now() WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE pt_assignments
  SET sessions_used = v_used,
      status = CASE WHEN v_used >= sessions_total THEN 'completed'::pt_assignment_status ELSE status END,
      updated_at = now()
  WHERE id = v_a.id;

  -- Audit the credit move.
  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('pt_assignments', v_a.id, 'update',
          jsonb_build_object('sessions_used', v_a.sessions_used),
          jsonb_build_object('sessions_used', v_used, 'action', 'complete_pt_session', 'session_id', p_session_id),
          auth.uid());

  -- PT-1 refill nudge: notify the member when this completion CROSSES the
  -- gym's sessions threshold (old remaining > thr ≥ new remaining > 0).
  -- Best-effort — login-less members have no auth row; never fail the credit.
  BEGIN
    SELECT pt_refill_sessions_threshold INTO v_thr FROM gyms WHERE id = v_gym;
    v_remaining := v_a.sessions_total - v_used;
    IF v_remaining > 0 AND v_remaining <= COALESCE(v_thr, 2)
       AND (v_a.sessions_total - v_a.sessions_used) > COALESCE(v_thr, 2) THEN
      SELECT s.profile_id INTO v_profile FROM students s WHERE s.id = v_a.student_id;
      SELECT COALESCE(name_en, name_ar) INTO v_pkg_name FROM pt_packages WHERE id = v_a.package_id;
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
      VALUES (v_profile, v_gym, 'pt_refill_due',
              'messages.pt_refill_due.title', 'messages.pt_refill_due.body',
              jsonb_build_object('remaining', v_remaining, 'package', v_pkg_name),
              'pt_assignment', v_a.id, '/portal/pt');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_session;
END;
$$;
GRANT EXECUTE ON FUNCTION complete_pt_session(UUID) TO authenticated;
