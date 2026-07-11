-- 000095: MEMBER SELF-SERVE REQUESTS (MJ-3) — profile changes + membership lifecycle
--
-- Member Journey 2.0 slice 3/5. The D2 ruling: renewal + freeze are REQUESTS
-- (member/guardian asks → staff inbox → staff approves at the desk; payment and
-- cancellation stay desk conversations). This EXTENDS the established request →
-- inbox → approve pattern (class_registrations / pt_assignments / camp_registrations)
-- with ONE new request table keyed by `kind`, its create RPCs (SECURITY DEFINER,
-- self/guardian/staff-authorized, notify owner+receptionist → /inbox), and the
-- staff-gated approve/decline RPCs that REUSE the existing lifecycle RPCs verbatim
-- (renew_now, freeze_membership).
--
-- Also:
--  · profiles.contact_email — a member-owned contact address, distinct from the
--    auth identity (credentialed members sign in with a synthetic email, so their
--    login must never be their editable contact email).
--  · A BEFORE UPDATE guard on profiles that NARROWS the open `profiles_self`
--    self-update (FOR ALL, no WITH CHECK): a non-staff member editing their own
--    row may only touch low-risk fields (avatar_url, locale, contact_email). The
--    safety/identity/system columns (dob, gender, phone, names, is_active, gym_id)
--    now REQUIRE a staff-approved change request. Staff and service-role writes are
--    unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. profiles.contact_email — member-owned, separate from auth identity
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. member_requests — one table for the member self-serve request family
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE member_request_kind AS ENUM ('profile_change', 'renewal', 'freeze');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_request_status AS ENUM ('pending', 'approved', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS member_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind           member_request_kind NOT NULL,
  status         member_request_status NOT NULL DEFAULT 'pending',
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- proposed field changes / reason / requested days
  note           TEXT,                                  -- member's optional note
  requested_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decline_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- Inbox reads the pending queue, gym-scoped; index it.
CREATE INDEX IF NOT EXISTS idx_member_requests_gym_pending
  ON member_requests(gym_id) WHERE status = 'pending';
-- One pending request of a given kind per member (upsert on re-submit, like camp).
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_requests_pending
  ON member_requests(student_id, kind) WHERE status = 'pending';

ALTER TABLE member_requests ENABLE ROW LEVEL SECURITY;

-- Staff of the gym do everything (the inbox + approve/decline run as staff).
DROP POLICY IF EXISTS member_requests_staff ON member_requests;
CREATE POLICY member_requests_staff ON member_requests FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff());

-- The member sees their own requests (portal pending state).
DROP POLICY IF EXISTS member_requests_owner_select ON member_requests;
CREATE POLICY member_requests_owner_select ON member_requests FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

-- A guardian sees their linked kids' requests.
DROP POLICY IF EXISTS member_requests_guardian_select ON member_requests;
CREATE POLICY member_requests_guardian_select ON member_requests FOR SELECT
  USING (is_guardian_of(student_id));

-- Members/guardians have NO direct INSERT/UPDATE policy — writes flow through the
-- SECURITY DEFINER request_* / approve_* / decline_* RPCs below (the request pattern).

-- Guardians may READ their linked kids' memberships — the kid dashboard shows the
-- lifecycle state so a guardian can request renewal/freeze for the kid. READ-ONLY,
-- scoped by the existing is_guardian_of() helper; mirrors the guardian reads already
-- granted on class_registrations / camp_registrations / waivers / profiles. No write
-- path is added (staff still own every membership write via student_memberships_staff_gym).
DROP POLICY IF EXISTS student_memberships_guardian ON student_memberships;
CREATE POLICY student_memberships_guardian ON student_memberships FOR SELECT
  USING (is_guardian_of(student_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Narrow the open self-update on profiles (verify + narrow, Req1)
--    profiles_self is FOR ALL USING (id = auth.uid()) with NO WITH CHECK, so a
--    member can currently rewrite ANY column of their own row (dob, phone,
--    is_active, gym_id…). Restrict a non-staff self-update to the low-risk set.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_profile_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard ONLY a member editing their own row as a non-staff user. Staff edits
  -- (is_staff()) — including a staff member editing their own profile — and
  -- service-role/definer writes (auth.uid() IS NULL) pass through untouched.
  IF auth.uid() = NEW.id AND NOT is_staff() THEN
    IF ( NEW.gym_id        IS DISTINCT FROM OLD.gym_id
      OR NEW.is_active     IS DISTINCT FROM OLD.is_active
      OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
      OR NEW.gender        IS DISTINCT FROM OLD.gender
      OR NEW.phone         IS DISTINCT FROM OLD.phone
      OR NEW.first_name_ar IS DISTINCT FROM OLD.first_name_ar
      OR NEW.first_name_en IS DISTINCT FROM OLD.first_name_en
      OR NEW.first_name_fr IS DISTINCT FROM OLD.first_name_fr
      OR NEW.last_name_ar  IS DISTINCT FROM OLD.last_name_ar
      OR NEW.last_name_en  IS DISTINCT FROM OLD.last_name_en
      OR NEW.last_name_fr  IS DISTINCT FROM OLD.last_name_fr
      OR NEW.deleted_at    IS DISTINCT FROM OLD.deleted_at
    ) THEN
      RAISE EXCEPTION 'profile_self_field_locked'
        USING HINT = 'These fields require staff approval — submit a change request.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON profiles;
CREATE TRIGGER trg_guard_profile_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_self_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Shared authz guard for the request_* RPCs (self OR guardian OR staff-in-gym)
-- ─────────────────────────────────────────────────────────────────────────────
-- Inlined per-function below to match the established request_* pattern.

-- request_profile_change — proposed edits to safety/identity fields (dob, gender,
-- phone, emergency contact, medical notes, and — for a guardian editing a kid they
-- cannot RLS-write — contact_email/locale). payload = {profiles:{…}, students:{…}}.
CREATE OR REPLACE FUNCTION request_profile_change(
  p_student_id UUID,
  p_payload    JSONB,
  p_note       TEXT DEFAULT NULL
) RETURNS member_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student students;
  v_req     member_requests;
  v_name    TEXT;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF NOT (
    v_student.profile_id = auth.uid()
    OR is_guardian_of(p_student_id)
    OR (is_staff() AND v_student.gym_id = get_user_gym_id())
  ) THEN
    RAISE EXCEPTION 'Not authorized to request for this member';
  END IF;

  INSERT INTO member_requests (gym_id, student_id, kind, payload, note, requested_by)
  VALUES (v_student.gym_id, p_student_id, 'profile_change', COALESCE(p_payload, '{}'::jsonb), p_note, auth.uid())
  ON CONFLICT (student_id, kind) WHERE status = 'pending'
  DO UPDATE SET payload = EXCLUDED.payload, note = EXCLUDED.note,
                requested_by = EXCLUDED.requested_by, created_at = now()
  RETURNING * INTO v_req;

  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_student.gym_id, 'member_request',
           'messages.member_request.title', 'messages.member_request.body',
           jsonb_build_object('studentName', v_name, 'kind', 'profile_change'),
           'member_request', v_req.id, '/inbox'
    FROM user_roles ur
    WHERE ur.gym_id = v_student.gym_id AND ur.role IN ('owner', 'receptionist');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION request_profile_change(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_profile_change(UUID, JSONB, TEXT) TO authenticated;

-- request_membership_renewal — the portal "renew at the desk" dead-end becomes a
-- request; staff approve issues the invoice via the canonical renewal path.
CREATE OR REPLACE FUNCTION request_membership_renewal(
  p_student_id UUID,
  p_note       TEXT DEFAULT NULL
) RETURNS member_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student students;
  v_req     member_requests;
  v_name    TEXT;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF NOT (
    v_student.profile_id = auth.uid()
    OR is_guardian_of(p_student_id)
    OR (is_staff() AND v_student.gym_id = get_user_gym_id())
  ) THEN
    RAISE EXCEPTION 'Not authorized to request for this member';
  END IF;

  INSERT INTO member_requests (gym_id, student_id, kind, payload, note, requested_by)
  VALUES (v_student.gym_id, p_student_id, 'renewal', '{}'::jsonb, p_note, auth.uid())
  ON CONFLICT (student_id, kind) WHERE status = 'pending'
  DO UPDATE SET note = EXCLUDED.note, requested_by = EXCLUDED.requested_by, created_at = now()
  RETURNING * INTO v_req;

  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_student.gym_id, 'member_request',
           'messages.member_request.title', 'messages.member_request.body',
           jsonb_build_object('studentName', v_name, 'kind', 'renewal'),
           'member_request', v_req.id, '/inbox'
    FROM user_roles ur
    WHERE ur.gym_id = v_student.gym_id AND ur.role IN ('owner', 'receptionist');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION request_membership_renewal(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_membership_renewal(UUID, TEXT) TO authenticated;

-- request_membership_freeze — reason optional; payload.days = requested length
-- (defaults at approve time to the gym's min chunk). Staff approve applies it.
CREATE OR REPLACE FUNCTION request_membership_freeze(
  p_student_id UUID,
  p_days       INTEGER DEFAULT NULL,
  p_reason     TEXT DEFAULT NULL
) RETURNS member_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student students;
  v_req     member_requests;
  v_name    TEXT;
BEGIN
  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'Member % not found', p_student_id; END IF;
  IF NOT (
    v_student.profile_id = auth.uid()
    OR is_guardian_of(p_student_id)
    OR (is_staff() AND v_student.gym_id = get_user_gym_id())
  ) THEN
    RAISE EXCEPTION 'Not authorized to request for this member';
  END IF;

  INSERT INTO member_requests (gym_id, student_id, kind, payload, note, requested_by)
  VALUES (v_student.gym_id, p_student_id, 'freeze',
          jsonb_build_object('days', p_days), p_reason, auth.uid())
  ON CONFLICT (student_id, kind) WHERE status = 'pending'
  DO UPDATE SET payload = EXCLUDED.payload, note = EXCLUDED.note,
                requested_by = EXCLUDED.requested_by, created_at = now()
  RETURNING * INTO v_req;

  BEGIN
    SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name
    FROM profiles p WHERE p.id = v_student.profile_id;
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_student.gym_id, 'member_request',
           'messages.member_request.title', 'messages.member_request.body',
           jsonb_build_object('studentName', v_name, 'kind', 'freeze'),
           'member_request', v_req.id, '/inbox'
    FROM user_roles ur
    WHERE ur.gym_id = v_student.gym_id AND ur.role IN ('owner', 'receptionist');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION request_membership_freeze(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_membership_freeze(UUID, INTEGER, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. _apply_profile_change — write an approved profile-change payload to the row.
--    Runs inside approve_member_request (staff context), so the self-update guard
--    above does not fire (auth.uid() is the staff approver, not the member).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _apply_profile_change(p_student_id UUID, p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID;
  v_prof    JSONB := p_payload -> 'profiles';
  v_stu     JSONB := p_payload -> 'students';
BEGIN
  SELECT profile_id INTO v_profile FROM students WHERE id = p_student_id;

  IF v_prof IS NOT NULL AND v_profile IS NOT NULL THEN
    UPDATE profiles SET
      date_of_birth = CASE WHEN v_prof ? 'date_of_birth'
                           THEN NULLIF(v_prof ->> 'date_of_birth', '')::date ELSE date_of_birth END,
      gender        = CASE WHEN v_prof ? 'gender'
                           THEN NULLIF(v_prof ->> 'gender', '')::gender_enum ELSE gender END,
      phone         = CASE WHEN v_prof ? 'phone'
                           THEN normalize_lb_phone(v_prof ->> 'phone') ELSE phone END,
      contact_email = CASE WHEN v_prof ? 'contact_email'
                           THEN NULLIF(v_prof ->> 'contact_email', '') ELSE contact_email END,
      locale        = CASE WHEN v_prof ? 'locale'
                           THEN COALESCE(NULLIF(v_prof ->> 'locale', ''), locale) ELSE locale END
    WHERE id = v_profile;
  END IF;

  IF v_stu IS NOT NULL THEN
    UPDATE students SET
      emergency_contact_name  = CASE WHEN v_stu ? 'emergency_contact_name'
                                     THEN NULLIF(v_stu ->> 'emergency_contact_name', '') ELSE emergency_contact_name END,
      emergency_contact_phone = CASE WHEN v_stu ? 'emergency_contact_phone'
                                     THEN NULLIF(v_stu ->> 'emergency_contact_phone', '') ELSE emergency_contact_phone END,
      medical_notes           = CASE WHEN v_stu ? 'medical_notes'
                                     THEN NULLIF(v_stu ->> 'medical_notes', '') ELSE medical_notes END
    WHERE id = p_student_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _apply_profile_change(UUID, JSONB) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. approve_member_request — staff-gated; dispatch by kind, REUSING the existing
--    lifecycle RPCs verbatim (renew_now, freeze_membership).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_member_request(p_request_id UUID)
RETURNS member_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req  member_requests;
  v_mem  UUID;
  v_days INTEGER;
BEGIN
  SELECT * INTO v_req FROM member_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT (is_staff() AND v_req.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  IF v_req.kind = 'profile_change' THEN
    PERFORM _apply_profile_change(v_req.student_id, v_req.payload);

  ELSIF v_req.kind = 'renewal' THEN
    -- The member's active (or most recent) membership. renew_now is idempotent +
    -- staff-guarded; the caller here is staff, so it applies the same desk path.
    SELECT id INTO v_mem FROM student_memberships
      WHERE student_id = v_req.student_id
      ORDER BY (status = 'active') DESC, end_date DESC NULLS LAST
      LIMIT 1;
    IF v_mem IS NULL THEN RAISE EXCEPTION 'No membership to renew'; END IF;
    PERFORM renew_now(v_mem);

  ELSIF v_req.kind = 'freeze' THEN
    SELECT id INTO v_mem FROM student_memberships
      WHERE student_id = v_req.student_id AND status = 'active'
      ORDER BY end_date DESC LIMIT 1;
    IF v_mem IS NULL THEN RAISE EXCEPTION 'No active membership to freeze'; END IF;
    v_days := COALESCE(
      NULLIF(v_req.payload ->> 'days', '')::int,
      (SELECT freeze_min_chunk_days FROM gyms WHERE id = v_req.gym_id)
    );
    PERFORM freeze_membership(v_mem, v_days);  -- enforces gym freeze bounds
  END IF;

  UPDATE member_requests
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_req;

  -- Tell the asker it's done (best-effort; never blocks the state change).
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (COALESCE(v_req.requested_by, (SELECT profile_id FROM students WHERE id = v_req.student_id)),
            v_req.gym_id, 'member_request_approved',
            'messages.member_request_approved.title', 'messages.member_request_approved.body',
            jsonb_build_object('kind', v_req.kind::text),
            'member_request', v_req.id,
            CASE v_req.kind WHEN 'renewal' THEN '/portal/billing' ELSE '/portal/profile' END);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION approve_member_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_member_request(UUID) TO authenticated;

-- decline_member_request — staff-gated; records the reason, notifies the asker.
CREATE OR REPLACE FUNCTION decline_member_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS member_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req member_requests;
BEGIN
  SELECT * INTO v_req FROM member_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT (is_staff() AND v_req.gym_id = get_user_gym_id()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  UPDATE member_requests
    SET status = 'declined', reviewed_by = auth.uid(), reviewed_at = now(), decline_reason = p_reason
    WHERE id = p_request_id
    RETURNING * INTO v_req;

  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    VALUES (COALESCE(v_req.requested_by, (SELECT profile_id FROM students WHERE id = v_req.student_id)),
            v_req.gym_id, 'member_request_declined',
            'messages.member_request_declined.title', 'messages.member_request_declined.body',
            jsonb_build_object('kind', v_req.kind::text),
            'member_request', v_req.id, '/portal/profile');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION decline_member_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decline_member_request(UUID, TEXT) TO authenticated;
