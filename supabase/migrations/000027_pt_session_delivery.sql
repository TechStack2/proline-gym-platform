-- ============================================================
-- 000027: PT SESSION DELIVERY LIFECYCLE (Cycle 5 / Phase 1 / Prompt C1)
-- PRO LINE Gym Platform — completes D4 (PT package lifecycle)
--
-- 22-R built PT ACQUISITION (request→approve→bill→roster). This builds DELIVERY
-- — the part that CONSUMES credits — and un-orphans pt_sessions (never written
-- before). The bare `increment_sessions_used` counter (no session record) is
-- retired from the UI; ALL credit consumption now flows through the single
-- writer: complete_pt_session.
--
-- BINDING SEAM (analysis-class-attendance-vs-pt-session-seam.md): PT pack credits
-- have exactly ONE writer — PT-session completion. Group-class attendance never
-- touches a PT credit. This migration touches no attendance table.
--
-- Every credit-affecting RPC is atomic (single txn), idempotent where stated,
-- gym-scoped, staff/coach-gated, and audited (audit_logs). Notifications stay in
-- the TS server actions (sanctioned F2 pattern), best-effort.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Schema: link the credit-owning assignment + gym PT policy
-- -----------------------------------------------------------
ALTER TABLE pt_sessions ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES pt_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pt_sessions_assignment ON pt_sessions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_student_time ON pt_sessions(student_id, scheduled_at DESC);

ALTER TABLE gyms ADD COLUMN IF NOT EXISTS pt_no_show_forfeits         BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS pt_late_cancel_window_hours INTEGER NOT NULL DEFAULT 0;

-- pt_sessions RLS already scopes staff via pt_packages (000014) and student via
-- student_id (000004). New rows carry package_id (kept in sync with the
-- assignment) so those policies keep working. Coaches see their own (000004).

-- -----------------------------------------------------------
-- 2. schedule_pt_session — origination (no credit effect)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION schedule_pt_session(
  p_assignment_id UUID,
  p_coach_id      UUID DEFAULT NULL,
  p_scheduled_at  TIMESTAMPTZ DEFAULT NULL,
  p_duration      INTEGER DEFAULT 60
) RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a       pt_assignments;
  v_gym     UUID;
  v_coach   UUID;
  v_session pt_sessions;
BEGIN
  SELECT * INTO v_a FROM pt_assignments WHERE id = p_assignment_id;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;

  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = v_a.package_id;
  IF NOT ((is_staff() AND v_gym = get_user_gym_id())
          OR (v_a.coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized to schedule for this assignment';
  END IF;

  -- Preconditions (E5 expiry / E2 exhaustion / inactive).
  IF v_a.status <> 'active' THEN RAISE EXCEPTION 'Assignment is not active (status %)', v_a.status; END IF;
  IF v_a.sessions_remaining <= 0 THEN RAISE EXCEPTION 'Assignment has no remaining credits'; END IF;
  IF v_a.expires_at IS NOT NULL AND v_a.expires_at < now() THEN RAISE EXCEPTION 'Assignment has expired'; END IF;

  v_coach := COALESCE(p_coach_id, v_a.coach_id);
  IF v_coach IS NULL THEN RAISE EXCEPTION 'A coach is required to schedule a session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM coaches WHERE id = v_coach AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'Coach % is not in this gym', v_coach;
  END IF;

  INSERT INTO pt_sessions (student_id, coach_id, package_id, assignment_id, scheduled_at, duration_minutes, status)
  VALUES (v_a.student_id, v_coach, v_a.package_id, v_a.id, COALESCE(p_scheduled_at, now()), COALESCE(p_duration, 60), 'scheduled')
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;
GRANT EXECUTE ON FUNCTION schedule_pt_session(UUID, UUID, TIMESTAMPTZ, INTEGER) TO authenticated;

-- -----------------------------------------------------------
-- 3. complete_pt_session — THE single credit writer (atomic + idempotent)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_pt_session(p_session_id UUID)
RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session pt_sessions;
  v_a       pt_assignments;
  v_gym     UUID;
  v_used    INTEGER;
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

  -- E2: reject completion on an exhausted/inactive/expired assignment.
  IF v_a.status <> 'active' THEN RAISE EXCEPTION 'Assignment is not active (status %)', v_a.status; END IF;
  IF v_a.sessions_remaining <= 0 THEN RAISE EXCEPTION 'Assignment has no remaining credits'; END IF;

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

  RETURN v_session;
END;
$$;
GRANT EXECUTE ON FUNCTION complete_pt_session(UUID) TO authenticated;

-- -----------------------------------------------------------
-- 4. cancel_or_no_show_pt_session — policy-aware (server-side policy)
--    p_outcome ∈ 'cancelled' | 'no_show'. Operates on a SCHEDULED session
--    (not yet decremented). Forfeit ⇒ decrement now (atomic + audited).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_or_no_show_pt_session(
  p_session_id UUID,
  p_outcome    TEXT
) RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   pt_sessions;
  v_a         pt_assignments;
  v_gym       UUID;
  v_forfeits  BOOLEAN;
  v_window    INTEGER;
  v_used      INTEGER;
BEGIN
  IF p_outcome NOT IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Invalid outcome %', p_outcome;
  END IF;

  SELECT * INTO v_session FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status = p_outcome THEN RETURN v_session; END IF; -- idempotent
  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot cancel a completed session; use restore_pt_credit';
  END IF;
  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Cannot % a % session', p_outcome, v_session.status;
  END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = v_session.assignment_id FOR UPDATE;
  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = v_a.package_id;
  IF NOT ((is_staff() AND v_gym = get_user_gym_id())
          OR (v_a.coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this session';
  END IF;

  -- Server-side gym policy (never client-trusted).
  SELECT pt_no_show_forfeits, pt_late_cancel_window_hours INTO v_forfeits, v_window
  FROM gyms WHERE id = v_gym;

  DECLARE v_forfeit BOOLEAN := false;
  BEGIN
    IF p_outcome = 'no_show' THEN
      v_forfeit := COALESCE(v_forfeits, true);
    ELSE -- cancelled
      v_forfeit := COALESCE(v_window, 0) > 0
                   AND now() >= (v_session.scheduled_at - make_interval(hours => v_window));
    END IF;

    UPDATE pt_sessions SET status = p_outcome, updated_at = now() WHERE id = p_session_id
    RETURNING * INTO v_session;

    IF v_forfeit AND v_a.status = 'active' AND v_a.sessions_remaining > 0 THEN
      v_used := v_a.sessions_used + 1;
      UPDATE pt_assignments
      SET sessions_used = v_used,
          status = CASE WHEN v_used >= sessions_total THEN 'completed'::pt_assignment_status ELSE status END,
          updated_at = now()
      WHERE id = v_a.id;

      INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
      VALUES ('pt_assignments', v_a.id, 'update',
              jsonb_build_object('sessions_used', v_a.sessions_used),
              jsonb_build_object('sessions_used', v_used, 'action', p_outcome || '_forfeit', 'session_id', p_session_id),
              auth.uid());
    END IF;
  END;

  RETURN v_session;
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_or_no_show_pt_session(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 5. reschedule_pt_session — move slot/coach (E8: scheduled only; no credit)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION reschedule_pt_session(
  p_session_id   UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_coach_id     UUID DEFAULT NULL
) RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session pt_sessions;
  v_a       pt_assignments;
  v_gym     UUID;
  v_coach   UUID;
BEGIN
  SELECT * INTO v_session FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled session can be rescheduled (status %)', v_session.status;
  END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = v_session.assignment_id;
  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = COALESCE(v_a.package_id, v_session.package_id);
  IF NOT ((is_staff() AND v_gym = get_user_gym_id())
          OR (v_session.coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this session';
  END IF;

  v_coach := COALESCE(p_coach_id, v_session.coach_id);
  IF NOT EXISTS (SELECT 1 FROM coaches WHERE id = v_coach AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'Coach % is not in this gym', v_coach;
  END IF;

  UPDATE pt_sessions SET scheduled_at = p_scheduled_at, coach_id = v_coach, updated_at = now()
  WHERE id = p_session_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;
GRANT EXECUTE ON FUNCTION reschedule_pt_session(UUID, TIMESTAMPTZ, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 6. restore_pt_credit — recovery (staff-only, guarded ≥0, audited)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION restore_pt_credit(
  p_assignment_id UUID,
  p_session_id    UUID,
  p_reason        TEXT DEFAULT NULL
) RETURNS pt_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a    pt_assignments;
  v_gym  UUID;
  v_used INTEGER;
  v_sess pt_sessions;
BEGIN
  SELECT * INTO v_a FROM pt_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;

  SELECT gym_id INTO v_gym FROM pt_packages WHERE id = v_a.package_id;
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Only staff may restore credits';
  END IF;

  -- E3: never below 0.
  IF v_a.sessions_used < 1 THEN
    RAISE EXCEPTION 'No credit to restore (sessions_used is 0)';
  END IF;

  -- If a session is named, it must be a consuming event (completed/no_show) and
  -- is voided here so the same event cannot be restored twice (E3 once-per-event).
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_sess FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_sess.id IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_sess.status NOT IN ('completed', 'no_show') THEN
      RAISE EXCEPTION 'Session % is not a consumed session (status %)', p_session_id, v_sess.status;
    END IF;
    UPDATE pt_sessions SET status = 'cancelled', updated_at = now() WHERE id = p_session_id;
  END IF;

  v_used := v_a.sessions_used - 1;
  UPDATE pt_assignments
  SET sessions_used = v_used,
      status = CASE WHEN v_a.status = 'completed' THEN 'active'::pt_assignment_status ELSE status END,
      is_active = true,
      updated_at = now()
  WHERE id = v_a.id RETURNING * INTO v_a;

  INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES ('pt_assignments', v_a.id, 'refund',
          jsonb_build_object('sessions_used', v_used + 1),
          jsonb_build_object('sessions_used', v_used, 'action', 'restore_pt_credit', 'session_id', p_session_id, 'reason', p_reason),
          auth.uid());

  RETURN v_a;
END;
$$;
GRANT EXECUTE ON FUNCTION restore_pt_credit(UUID, UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 7. get_coach_pt_sessions — definer reader for the coach lifecycle UI
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_pt_sessions()
RETURNS TABLE (
  session_id         UUID,
  assignment_id      UUID,
  student_name       TEXT,
  package_name_ar    TEXT,
  package_name_en    TEXT,
  package_name_fr    TEXT,
  scheduled_at       TIMESTAMPTZ,
  status             pt_session_status_enum,
  sessions_total     INTEGER,
  sessions_remaining INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.assignment_id,
         COALESCE(p.first_name_en, p.first_name_ar, ''),
         pkg.name_ar, pkg.name_en, pkg.name_fr,
         s.scheduled_at, s.status,
         a.sessions_total, a.sessions_remaining
  FROM pt_sessions s
  JOIN coaches c   ON c.id = s.coach_id AND c.profile_id = auth.uid()
  JOIN students st ON st.id = s.student_id
  JOIN profiles p  ON p.id = st.profile_id
  LEFT JOIN pt_assignments a ON a.id = s.assignment_id
  LEFT JOIN pt_packages pkg  ON pkg.id = s.package_id
  ORDER BY s.scheduled_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION get_coach_pt_sessions() TO authenticated;

-- -----------------------------------------------------------
-- 8. get_student_pt_sessions — definer reader for portal/pt history
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_student_pt_sessions()
RETURNS TABLE (
  session_id      UUID,
  assignment_id   UUID,
  coach_name      TEXT,
  package_name_ar TEXT,
  package_name_en TEXT,
  package_name_fr TEXT,
  scheduled_at    TIMESTAMPTZ,
  status          pt_session_status_enum
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.assignment_id,
         COALESCE(cp.first_name_en, cp.first_name_ar, ''),
         pkg.name_ar, pkg.name_en, pkg.name_fr,
         s.scheduled_at, s.status
  FROM pt_sessions s
  JOIN students st ON st.id = s.student_id AND st.profile_id = auth.uid()
  LEFT JOIN coaches c  ON c.id = s.coach_id
  LEFT JOIN profiles cp ON cp.id = c.profile_id
  LEFT JOIN pt_packages pkg ON pkg.id = s.package_id
  ORDER BY s.scheduled_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION get_student_pt_sessions() TO authenticated;

-- -----------------------------------------------------------
-- 9. E10 backfill — synthesize completed placeholder sessions so member history
--    reconciles with the counter (the bare-increment era left sessions_used with
--    no pt_sessions rows). Idempotent: re-runs compute a 0 gap.
-- -----------------------------------------------------------
DO $$
DECLARE
  r     RECORD;
  v_gap INTEGER;
  i     INTEGER;
BEGIN
  FOR r IN
    SELECT a.id, a.student_id, a.coach_id, a.package_id, a.sessions_used, a.purchased_at,
           (SELECT count(*) FROM pt_sessions s WHERE s.assignment_id = a.id AND s.status = 'completed') AS done
    FROM pt_assignments a
    WHERE a.sessions_used > 0 AND a.coach_id IS NOT NULL
  LOOP
    v_gap := r.sessions_used - r.done;
    IF v_gap > 0 THEN
      FOR i IN 1..v_gap LOOP
        INSERT INTO pt_sessions (student_id, coach_id, package_id, assignment_id, scheduled_at, duration_minutes, status, notes_en)
        VALUES (r.student_id, r.coach_id, r.package_id, r.id, COALESCE(r.purchased_at, now()), 60, 'completed', 'migrated');
      END LOOP;
    END IF;
  END LOOP;
END $$;
