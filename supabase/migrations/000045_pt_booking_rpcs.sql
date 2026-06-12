-- ============================================================
-- 000045: PT BOOKING — RPCS (V1 / PT-2, part 2 of 2)
-- PRO LINE Gym Platform
--
-- Race design (journey §4): bookings for one coach SERIALIZE on a per-coach
-- advisory xact lock, then an overlap check over scheduled+proposed sessions;
-- the partial unique index on (coach_id, scheduled_at) is the belt-and-braces
-- backstop. The race loser gets the clean 'slot taken' either way.
-- Anti-overbook: bookable = sessions_remaining − reserved(scheduled+proposed,
-- future) computed under FOR UPDATE on the assignment. Credits still only
-- move in complete_pt_session — UNTOUCHED here (booking reserves, completion
-- spends).
-- Member-path policy guards run in SQL IN THE GYM'S TIMEZONE via
-- AT TIME ZONE g.timezone (authoritative; the TS slot engine mirrors them
-- for display). Staff path (p_override) skips availability/notice/horizon/
-- grid — the desk has the last word; the IA-3 conflict warning stays client-
-- side. Proposals (p_propose, member path) skip availability too — that is
-- the fallback's point — but still reserve credits and respect validity.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_pt_sessions_coach_slot
  ON pt_sessions(coach_id, scheduled_at)
  WHERE status IN ('scheduled', 'proposed');

CREATE OR REPLACE FUNCTION book_pt_session(
  p_assignment_id UUID,
  p_scheduled_at  TIMESTAMPTZ,
  p_duration      INTEGER DEFAULT NULL,
  p_override      BOOLEAN DEFAULT false,
  p_propose       BOOLEAN DEFAULT false
) RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a         pt_assignments;
  v_gym       gyms;
  v_gym_id    UUID;
  v_student   students;
  v_is_member BOOLEAN;
  v_duration  INTEGER;
  v_reserved  INTEGER;
  v_local     TIMESTAMP;
  v_dow       INTEGER;
  v_start_t   TIME;
  v_end_t     TIME;
  v_session   pt_sessions;
  v_status    pt_session_status_enum;
BEGIN
  SELECT * INTO v_a FROM pt_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;

  SELECT gym_id INTO v_gym_id FROM pt_packages WHERE id = v_a.package_id;
  SELECT * INTO v_gym FROM gyms WHERE id = v_gym_id;
  SELECT * INTO v_student FROM students WHERE id = v_a.student_id;

  -- Caller: the member themself, their guardian, or staff of the gym.
  v_is_member := (v_student.profile_id = auth.uid()) OR is_guardian_of(v_a.student_id);
  IF NOT (v_is_member OR (is_staff() AND v_gym_id = get_user_gym_id())) THEN
    RAISE EXCEPTION 'Not authorized to book for this package';
  END IF;
  -- Override/proposal flags belong to one side each.
  IF p_override AND v_is_member AND NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may override availability';
  END IF;

  -- Package state (PT-1 expiry semantics).
  IF v_a.status <> 'active' THEN RAISE EXCEPTION 'Package is not active (status %)', v_a.status; END IF;
  IF v_a.expires_at IS NOT NULL AND v_a.expires_at < now() THEN
    RAISE EXCEPTION 'Package validity has expired — extend it to continue';
  END IF;
  -- Slot must land inside the validity window.
  IF v_a.expires_at IS NOT NULL AND p_scheduled_at > v_a.expires_at THEN
    RAISE EXCEPTION 'The chosen time is outside the package validity window';
  END IF;
  IF p_scheduled_at <= now() THEN RAISE EXCEPTION 'The chosen time is in the past'; END IF;

  -- ANTI-OVERBOOK under the assignment lock: a booking is a RESERVATION
  -- (credits only move on completion — C1 single writer untouched).
  SELECT count(*) INTO v_reserved FROM pt_sessions
  WHERE assignment_id = v_a.id AND status IN ('scheduled', 'proposed') AND scheduled_at > now();
  IF v_a.sessions_remaining - v_reserved <= 0 THEN
    RAISE EXCEPTION 'No bookable credits left (% remaining, % already reserved)', v_a.sessions_remaining, v_reserved;
  END IF;

  v_duration := COALESCE(p_duration, v_gym.pt_slot_minutes, 60);

  -- Member-path policy guards, computed in the GYM'S timezone.
  IF v_is_member AND NOT p_propose THEN
    IF p_scheduled_at < now() + make_interval(hours => COALESCE(v_gym.pt_min_notice_hours, 12)) THEN
      RAISE EXCEPTION 'Bookings need at least % hours notice', COALESCE(v_gym.pt_min_notice_hours, 12);
    END IF;
    IF p_scheduled_at > now() + make_interval(days => COALESCE(v_gym.pt_booking_horizon_days, 14)) THEN
      RAISE EXCEPTION 'Bookings open % days ahead', COALESCE(v_gym.pt_booking_horizon_days, 14);
    END IF;

    v_local := p_scheduled_at AT TIME ZONE COALESCE(v_gym.timezone, 'Asia/Beirut');
    v_dow := EXTRACT(DOW FROM v_local)::int;
    v_start_t := v_local::time;
    v_end_t := (v_local + make_interval(mins => v_duration))::time;

    -- Slot-grid alignment.
    IF (EXTRACT(HOUR FROM v_local)::int * 60 + EXTRACT(MINUTE FROM v_local)::int)
       % COALESCE(v_gym.pt_slot_minutes, 60) <> 0 THEN
      RAISE EXCEPTION 'The chosen time is not on the booking grid';
    END IF;

    -- Inside a published window (recurring or one-off extra), not blocked.
    IF EXISTS (
      SELECT 1 FROM coach_availability_overrides o
      WHERE o.coach_id = v_a.coach_id AND o.date = v_local::date AND o.kind = 'block'
        AND (o.start_time IS NULL OR (o.start_time <= v_start_t AND o.end_time >= v_end_t))
    ) THEN
      RAISE EXCEPTION 'The coach is not available at that time';
    END IF;
    IF NOT (
      EXISTS (
        SELECT 1 FROM coach_availability a
        WHERE a.coach_id = v_a.coach_id AND a.is_active AND a.day_of_week = v_dow
          AND a.start_time <= v_start_t AND a.end_time >= v_end_t
      )
      OR EXISTS (
        SELECT 1 FROM coach_availability_overrides o
        WHERE o.coach_id = v_a.coach_id AND o.date = v_local::date AND o.kind = 'extra'
          AND o.start_time <= v_start_t AND o.end_time >= v_end_t
      )
    ) THEN
      RAISE EXCEPTION 'The coach is not available at that time';
    END IF;
  END IF;

  -- Serialize per coach, then overlap over live sessions (the race loser
  -- arrives here after the winner committed and gets the clean message).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_a.coach_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM pt_sessions s
    WHERE s.coach_id = v_a.coach_id
      AND s.status IN ('scheduled', 'proposed')
      AND tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => COALESCE(s.duration_minutes, 60) + COALESCE(v_gym.pt_buffer_minutes, 0)))
          && tstzrange(p_scheduled_at, p_scheduled_at + make_interval(mins => v_duration + COALESCE(v_gym.pt_buffer_minutes, 0)))
  ) THEN
    RAISE EXCEPTION 'Slot taken — pick another time';
  END IF;

  v_status := CASE WHEN p_propose THEN 'proposed'::pt_session_status_enum ELSE 'scheduled'::pt_session_status_enum END;

  BEGIN
    INSERT INTO pt_sessions (student_id, coach_id, package_id, assignment_id, scheduled_at, duration_minutes, status, proposed_by)
    VALUES (v_a.student_id, v_a.coach_id, v_a.package_id, v_a.id, p_scheduled_at, v_duration, v_status,
            CASE WHEN p_propose THEN auth.uid() END)
    RETURNING * INTO v_session;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Slot taken — pick another time';
  END;

  -- Best-effort notifications, both sides (login-less members never fail it).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_gym_id,
            CASE WHEN p_propose THEN 'pt_time_proposed' ELSE 'pt_session_scheduled' END,
            CASE WHEN p_propose THEN 'messages.pt_time_proposed.title' ELSE 'messages.pt_session_scheduled.title' END,
            CASE WHEN p_propose THEN 'messages.pt_time_proposed.body' ELSE 'messages.pt_session_scheduled.body' END,
            jsonb_build_object('date', v_session.scheduled_at), 'pt_session', v_session.id, '/portal/pt');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT c.profile_id, v_gym_id,
           CASE WHEN p_propose THEN 'pt_time_proposed' ELSE 'pt_session_scheduled' END,
           CASE WHEN p_propose THEN 'messages.pt_time_proposed.title' ELSE 'messages.pt_session_scheduled.title' END,
           CASE WHEN p_propose THEN 'messages.pt_time_proposed.body' ELSE 'messages.pt_session_scheduled.body' END,
           jsonb_build_object('date', v_session.scheduled_at), 'pt_session', v_session.id, '/coach/pt'
    FROM coaches c WHERE c.id = v_a.coach_id AND c.profile_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_session;
END;
$$;
REVOKE ALL ON FUNCTION book_pt_session(UUID, TIMESTAMPTZ, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION book_pt_session(UUID, TIMESTAMPTZ, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- respond_pt_proposal — accept (books through book-guards) / counter / decline.
-- The ball: proposed_by = the LAST proposer; only the OTHER side responds
-- (member/guardian vs staff/the assigned coach).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION respond_pt_proposal(
  p_session_id UUID,
  p_action     TEXT,
  p_counter_at TIMESTAMPTZ DEFAULT NULL
) RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s         pt_sessions;
  v_a         pt_assignments;
  v_student   students;
  v_gym_id    UUID;
  v_is_member BOOLEAN;
  v_is_house  BOOLEAN;
  v_was_member_turn BOOLEAN;
BEGIN
  IF p_action NOT IN ('accept', 'counter', 'decline') THEN
    RAISE EXCEPTION 'Invalid action %', p_action;
  END IF;

  SELECT * INTO v_s FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Proposal % not found', p_session_id; END IF;
  IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'Not a pending proposal (status %)', v_s.status; END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = v_s.assignment_id;
  SELECT * INTO v_student FROM students WHERE id = v_s.student_id;
  SELECT gym_id INTO v_gym_id FROM pt_packages WHERE id = v_a.package_id;

  v_is_member := (v_student.profile_id = auth.uid()) OR is_guardian_of(v_s.student_id);
  v_is_house  := (is_staff() AND v_gym_id = get_user_gym_id())
                 OR v_s.coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid());
  IF NOT (v_is_member OR v_is_house) THEN
    RAISE EXCEPTION 'Not authorized to respond to this proposal';
  END IF;
  -- The proposer cannot answer their own proposal.
  v_was_member_turn := (v_s.proposed_by = v_student.profile_id) OR
                       (v_s.proposed_by IN (SELECT profile_id FROM guardians g
                                            JOIN guardian_students gs ON gs.guardian_id = g.id
                                            WHERE gs.student_id = v_s.student_id));
  IF v_was_member_turn AND v_is_member AND NOT v_is_house THEN
    RAISE EXCEPTION 'Waiting for the gym to respond';
  END IF;
  IF NOT v_was_member_turn AND v_is_house AND NOT v_is_member THEN
    RAISE EXCEPTION 'Waiting for the member to respond';
  END IF;

  IF p_action = 'decline' THEN
    UPDATE pt_sessions SET status = 'cancelled', updated_at = now() WHERE id = p_session_id
    RETURNING * INTO v_s;
  ELSIF p_action = 'counter' THEN
    IF p_counter_at IS NULL OR p_counter_at <= now() THEN
      RAISE EXCEPTION 'A future counter time is required';
    END IF;
    UPDATE pt_sessions
    SET scheduled_at = p_counter_at, proposed_by = auth.uid(), updated_at = now()
    WHERE id = p_session_id
    RETURNING * INTO v_s;
  ELSE
    -- ACCEPT: re-validate through the booking guards (overlap/credits under
    -- locks) by flipping THIS row — serialize on the coach first.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_s.coach_id::text, 0));
    IF v_s.scheduled_at <= now() THEN RAISE EXCEPTION 'The proposed time is in the past — counter with a new one'; END IF;
    IF v_a.expires_at IS NOT NULL AND v_s.scheduled_at > v_a.expires_at THEN
      RAISE EXCEPTION 'The proposed time is outside the package validity window';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pt_sessions s
      WHERE s.coach_id = v_s.coach_id AND s.id <> v_s.id
        AND s.status IN ('scheduled', 'proposed')
        AND tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => COALESCE(s.duration_minutes, 60)))
            && tstzrange(v_s.scheduled_at, v_s.scheduled_at + make_interval(mins => COALESCE(v_s.duration_minutes, 60)))
    ) THEN
      RAISE EXCEPTION 'Slot taken — counter with another time';
    END IF;
    UPDATE pt_sessions SET status = 'scheduled', updated_at = now() WHERE id = p_session_id
    RETURNING * INTO v_s;
  END IF;

  -- Best-effort notification to BOTH sides (simple + symmetric).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_student.profile_id, v_gym_id, 'pt_proposal_' || p_action,
            'messages.pt_proposal_' || p_action || '.title',
            'messages.pt_proposal_' || p_action || '.body',
            jsonb_build_object('date', v_s.scheduled_at), 'pt_session', v_s.id, '/portal/pt');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT c.profile_id, v_gym_id, 'pt_proposal_' || p_action,
           'messages.pt_proposal_' || p_action || '.title',
           'messages.pt_proposal_' || p_action || '.body',
           jsonb_build_object('date', v_s.scheduled_at), 'pt_session', v_s.id, '/coach/pt'
    FROM coaches c WHERE c.id = v_s.coach_id AND c.profile_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_s;
END;
$$;
REVOKE ALL ON FUNCTION respond_pt_proposal(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION respond_pt_proposal(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- ------------------------------------------------------------
-- cancel_pt_booking — member/guardian (or staff) cancel of a SCHEDULED
-- future booking OUTSIDE the C1 late-cancel window: frees the slot, credits
-- untouched (they were never spent). Inside the window the member is sent to
-- the desk — the C1 cancel/no-show flow (with its forfeit policy) stays the
-- staff-side authority. complete_pt_session remains the ONLY credit writer.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_pt_booking(p_session_id UUID)
RETURNS pt_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s       pt_sessions;
  v_a       pt_assignments;
  v_student students;
  v_gym     gyms;
  v_gym_id  UUID;
  v_window  INTEGER;
BEGIN
  SELECT * INTO v_s FROM pt_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_s.status NOT IN ('scheduled', 'proposed') THEN
    RAISE EXCEPTION 'Only an upcoming booking can be cancelled (status %)', v_s.status;
  END IF;

  SELECT * INTO v_a FROM pt_assignments WHERE id = v_s.assignment_id;
  SELECT * INTO v_student FROM students WHERE id = v_s.student_id;
  SELECT gym_id INTO v_gym_id FROM pt_packages WHERE id = v_a.package_id;
  SELECT * INTO v_gym FROM gyms WHERE id = v_gym_id;

  IF NOT ((v_student.profile_id = auth.uid()) OR is_guardian_of(v_s.student_id)
          OR (is_staff() AND v_gym_id = get_user_gym_id())) THEN
    RAISE EXCEPTION 'Not authorized to cancel this booking';
  END IF;

  v_window := COALESCE(v_gym.pt_late_cancel_window_hours, 0);
  IF v_s.status = 'scheduled' AND v_s.scheduled_at < now() + make_interval(hours => v_window)
     AND NOT is_staff() THEN
    RAISE EXCEPTION 'Within the % hour cancellation window — please contact the desk', v_window;
  END IF;

  UPDATE pt_sessions SET status = 'cancelled', updated_at = now() WHERE id = p_session_id
  RETURNING * INTO v_s;

  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT c.profile_id, v_gym_id, 'pt_booking_cancelled',
           'messages.pt_booking_cancelled.title', 'messages.pt_booking_cancelled.body',
           jsonb_build_object('date', v_s.scheduled_at), 'pt_session', v_s.id, '/coach/pt'
    FROM coaches c WHERE c.id = v_s.coach_id AND c.profile_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_s;
END;
$$;
REVOKE ALL ON FUNCTION cancel_pt_booking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_pt_booking(UUID) TO authenticated;
