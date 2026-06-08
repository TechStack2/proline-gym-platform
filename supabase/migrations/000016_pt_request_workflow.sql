-- ============================================================
-- 000016: PT REQUEST → APPROVE WORKFLOW (Cycle 5 / Prompt 22 / Track A)
-- PRO LINE Gym Platform
--
-- Takes the PT flow from L1 Ad-hoc → L3 Managed:
--   M-A1 student PT-request entry  ·  M-A2 request/approve state machine
--   M-A4 staff notification on request  ·  M-A6 authorize credit consumption
--
-- Design notes:
--  - pt_assignments gains a `status` state machine. Existing direct-assign
--    rows default to 'active' (back-compat). New requests start 'requested'.
--  - `coach_id` becomes NULLABLE: a student requests a *preferred* coach which
--    may be empty and is confirmed/changed by staff at approval.
--  - Students cannot INSERT pt_assignments or notifications (RLS). The request
--    path therefore runs through the SECURITY DEFINER `request_pt` RPC, which
--    inserts the assignment AND the staff `pt_requested` notification directly.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Request/approval state machine
-- -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pt_assignment_status') THEN
    CREATE TYPE pt_assignment_status AS ENUM (
      'requested', 'approved', 'rejected', 'active', 'completed', 'cancelled'
    );
  END IF;
END $$;

ALTER TABLE pt_assignments
  ADD COLUMN IF NOT EXISTS status          pt_assignment_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS requested_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- coach_id is now optional (preferred-coach-at-request; confirmed at approval)
ALTER TABLE pt_assignments ALTER COLUMN coach_id DROP NOT NULL;

-- Find pending requests per package (→ gym via pt_packages) efficiently.
CREATE INDEX IF NOT EXISTS idx_pt_assignments_status ON pt_assignments(status);

-- -----------------------------------------------------------
-- 2. RPC: request_pt — student-initiated request (M-A1, M-A4)
--    SECURITY DEFINER so it can (a) insert a pt_assignments row a student
--    otherwise can't, and (b) insert staff notifications (which require
--    is_staff()). All writes are gym-derived from the package.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION request_pt(p_package_id UUID, p_coach_id UUID DEFAULT NULL)
RETURNS pt_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id   UUID;
  v_student_gym  UUID;
  v_student_name TEXT;
  v_pkg          pt_packages;
  v_assignment   pt_assignments;
BEGIN
  -- Resolve the calling student
  SELECT s.id, s.gym_id, COALESCE(p.first_name_en, p.first_name_ar, '')
    INTO v_student_id, v_student_gym, v_student_name
  FROM students s
  JOIN profiles p ON p.id = s.profile_id
  WHERE s.profile_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Only a student may request PT';
  END IF;

  SELECT * INTO v_pkg FROM pt_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PT package % not found', p_package_id;
  END IF;

  -- Gym guard: a student may only request packages in their own gym.
  IF v_pkg.gym_id <> v_student_gym THEN
    RAISE EXCEPTION 'Package and student belong to different gyms';
  END IF;

  -- Preferred coach (optional) must belong to the same gym.
  IF p_coach_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM coaches WHERE id = p_coach_id AND gym_id = v_pkg.gym_id
  ) THEN
    RAISE EXCEPTION 'Coach % is not in this gym', p_coach_id;
  END IF;

  INSERT INTO pt_assignments (
    student_id, package_id, coach_id, sessions_total, sessions_used,
    status, requested_at, is_active
  )
  VALUES (
    v_student_id, p_package_id, p_coach_id, v_pkg.session_count, 0,
    'requested', NOW(), true
  )
  RETURNING * INTO v_assignment;

  -- Notify gym staff (owner + receptionist) — i18n keys + params, gym-scoped.
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id)
  SELECT ur.user_id,
         v_pkg.gym_id,
         'pt_requested',
         'messages.pt_requested.title',
         'messages.pt_requested.body',
         jsonb_build_object('studentName', v_student_name),
         'pt_assignment',
         v_assignment.id
  FROM user_roles ur
  WHERE ur.gym_id = v_pkg.gym_id
    AND ur.role IN ('owner', 'receptionist');

  RETURN v_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION request_pt(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 2b. RPC: get_coach_pt_roster — coach's "My PT Students" (M-A5)
--    The coach can SELECT pt_assignments (RLS) but NOT the student/profile
--    rows behind them. This SECURITY DEFINER reader resolves the calling
--    coach and returns ONLY their own active assignments with names — no
--    broad student/profile read policy needed.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_coach_pt_roster()
RETURNS TABLE (
  assignment_id      UUID,
  student_name       TEXT,
  package_name_ar    TEXT,
  package_name_en    TEXT,
  package_name_fr    TEXT,
  sessions_total     INTEGER,
  sessions_remaining INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         COALESCE(p.first_name_en, p.first_name_ar, ''),
         pkg.name_ar, pkg.name_en, pkg.name_fr,
         a.sessions_total, a.sessions_remaining
  FROM pt_assignments a
  JOIN coaches c   ON c.id = a.coach_id AND c.profile_id = auth.uid()
  JOIN students st ON st.id = a.student_id
  JOIN profiles p  ON p.id = st.profile_id
  JOIN pt_packages pkg ON pkg.id = a.package_id
  WHERE a.is_active = true
    AND a.status = 'active'
  ORDER BY a.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_coach_pt_roster() TO authenticated;

-- -----------------------------------------------------------
-- 3. Authorize increment_sessions_used (M-A6)
--    Previously callable by anyone (SECURITY DEFINER, no caller check).
--    Now: only staff in the assignment's gym OR the assigned coach.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_sessions_used(assignment_id UUID)
RETURNS pt_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result      pt_assignments;
  v_gym_id    UUID;
  v_coach_id  UUID;
  v_authorized BOOLEAN;
BEGIN
  SELECT pkg.gym_id, a.coach_id
    INTO v_gym_id, v_coach_id
  FROM pt_assignments a
  JOIN pt_packages pkg ON pkg.id = a.package_id
  WHERE a.id = assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment % not found', assignment_id;
  END IF;

  v_authorized :=
       (is_staff() AND v_gym_id = get_user_gym_id())
    OR (v_coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()));

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to log sessions for assignment %', assignment_id;
  END IF;

  UPDATE pt_assignments
  SET sessions_used = sessions_used + 1,
      updated_at = NOW()
  WHERE id = assignment_id
    AND is_active = true
    AND sessions_used < sessions_total
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot increment: assignment % is exhausted or inactive', assignment_id;
  END IF;

  RETURN result;
END;
$$;
