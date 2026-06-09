-- ============================================================
-- 000021: PT APPROVAL NOTIFICATIONS RPC (Cycle 5 / Phase 1 / Prompt 22-R)
-- PRO LINE Gym Platform
--
-- 22-R re-validation exposed: on staff approval, emitting pt_approved/pt_assigned
-- via the TS createNotification helper (regular client) was rejected by the
-- notifications INSERT RLS at runtime, even though staff inserting same-gym is
-- the intended path (the same action's invoice INSERT — which also requires
-- is_staff() — succeeded). Rather than weaken the notifications RLS, emit the
-- approval notifications through a SECURITY DEFINER RPC — exactly the pattern
-- request_pt (000016) already uses to emit the pt_requested staff notification.
--
-- Gym-authorized internally (caller must be staff in the assignment's gym).
-- Forward-only, idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION pt_emit_approved_notifications(p_assignment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym            UUID;
  v_student_profile UUID;
  v_coach_profile  UUID;
  v_total          INTEGER;
BEGIN
  SELECT pkg.gym_id, sp.id, cp.id, a.sessions_total
    INTO v_gym, v_student_profile, v_coach_profile, v_total
  FROM pt_assignments a
  JOIN pt_packages pkg ON pkg.id = a.package_id
  JOIN students st     ON st.id = a.student_id
  JOIN profiles sp     ON sp.id = st.profile_id
  LEFT JOIN coaches c  ON c.id = a.coach_id
  LEFT JOIN profiles cp ON cp.id = c.profile_id
  WHERE a.id = p_assignment_id;

  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'PT assignment % not found', p_assignment_id;
  END IF;

  -- Only staff in the assignment's gym may emit these.
  IF NOT (is_staff() AND v_gym = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized to notify for assignment %', p_assignment_id;
  END IF;

  -- Student: request approved.
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
  VALUES (v_student_profile, v_gym, 'pt_approved',
          'messages.pt_approved.title', 'messages.pt_approved.body',
          '{}'::jsonb, 'pt_assignment', p_assignment_id, '/portal/pt');

  -- Coach: assigned (only if a coach is set on the assignment).
  IF v_coach_profile IS NOT NULL THEN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (v_coach_profile, v_gym, 'pt_assigned',
            'messages.pt_assigned.title', 'messages.pt_assigned.body',
            jsonb_build_object('count', v_total), 'pt_assignment', p_assignment_id, '/coach/pt');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION pt_emit_approved_notifications(UUID) TO authenticated;
