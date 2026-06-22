-- ============================================================
-- 000065: REG-FIX — a notification emit must NEVER roll back its parent txn
-- PRO LINE Gym Platform (Cycle 6 / REG-FIX)
--
-- Blocking bug: staff → "Register <member> to a class" → "Register & approve" →
--   ERROR: insert or update on "notifications" violates FK "notifications_user_id_fkey"
-- and the whole registration rolls back.
--
-- Root cause (audited): request_class_registration (000034) emits the
-- `class_requested` STAFF notification with an UN-GUARDED fan-out:
--     INSERT INTO notifications (user_id, …)
--     SELECT ur.user_id … FROM user_roles ur
--     WHERE ur.gym_id = … AND ur.role IN ('owner','receptionist');
-- Since 000032 re-pointed notifications_user_id_fkey from auth.users → profiles,
-- a STAFF user_role whose user_id has NO profiles row FK-violates (23503). Unlike
-- the member-side helpers (_notify_class_student 000034 / _notify_student_billing
-- 000031 — valid-recipient filter + EXCEPTION-WHEN-OTHERS best-effort), this staff
-- emit is un-guarded, so its failure aborts the registration. Systemic class:
-- [[notifications-fk-blocks-loginless]].
--
-- Fix (two layers, additive, RLS UNTOUCHED, forward-only):
--   1) Surgical (as prescribed): CREATE OR REPLACE request_class_registration with
--      the staff emit (a) filtered to recipients that exist in the FK target
--      (AND EXISTS profiles) and (b) wrapped best-effort so it can never abort the
--      registration. Business rules (E1 one-open-reg, belt/age/gym gates) unchanged.
--   2) Systemic (the sweep, done in ONE place instead of hand-wrapping 14 RPCs):
--      a BEFORE INSERT trigger on `notifications` that SKIPS (RETURN NULL, never
--      RAISE) any row whose user_id is absent from `profiles`. This guarantees the
--      invariant for EVERY emit — present and future — that a missing recipient can
--      never FK-violate and roll back the producer's transaction. It is a safety
--      net, not a licence to mis-target: producers should still address real
--      recipients; this only converts an orphan recipient from a fatal 23503 into a
--      silently-skipped row (the same end state the best-effort helpers already had).
--
-- DATA ODDITY (flagged, NOT mutated here): a staff user_role.user_id with no
-- profiles row is an orphaned/profile-less staff account (e.g. a user_roles row
-- inserted without the handle_new_user-provisioned profile, or a staff auth.users
-- created outside that path). This migration does NOT delete or backfill it (no
-- silent prod mutation) — see the REG-FIX drag-read for the live finding + the
-- recommended explicit cleanup.
-- ============================================================

-- 1) Systemic safety net: skip orphan-recipient rows instead of FK-violating. ----
CREATE OR REPLACE FUNCTION _notifications_skip_orphan_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER            -- read profiles regardless of the producer's RLS context
SET search_path = public
AS $$
BEGIN
  -- user_id is NOT NULL (000032), but guard defensively. A recipient that is not
  -- in the FK target (profiles) is dropped silently so a best-effort emit can
  -- never abort its parent state change — never RAISE here.
  IF NEW.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = NEW.user_id) THEN
    RETURN NULL; -- skip this row; the rest of an INSERT … SELECT fan-out still inserts
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_skip_orphan ON notifications;
CREATE TRIGGER trg_notifications_skip_orphan
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION _notifications_skip_orphan_recipient();

-- 2) Surgical fix of the named blocker: request_class_registration. --------------
--    Based on the CURRENT definition (000037 / B3 — preserves the guardian
--    request-for-kid branch via is_guardian_of) EXCEPT the staff `class_requested`
--    emit, which is now valid-recipient-filtered + best-effort (mirrors
--    _notify_class_student). Business rules (B3 guardian, E1, belt/age/gym) intact.
CREATE OR REPLACE FUNCTION request_class_registration(
  p_class_id UUID, p_student_id UUID DEFAULT NULL
) RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student students;
  v_class   classes;
  v_reg     class_registrations;
  v_name    TEXT;
  v_dob     DATE;
  v_age     INT;
BEGIN
  IF p_student_id IS NULL THEN
    SELECT * INTO v_student FROM students WHERE profile_id = auth.uid() LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Only a member may request a class'; END IF;
  ELSE
    -- B3: staff OR a linked guardian may act for the named student.
    IF NOT (is_staff() OR is_guardian_of(p_student_id)) THEN
      RAISE EXCEPTION 'Only staff or a linked guardian may register another member';
    END IF;
    SELECT * INTO v_student FROM students WHERE id = p_student_id;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student % not found', p_student_id; END IF;
    IF is_staff() AND v_student.gym_id <> get_user_gym_id() THEN
      RAISE EXCEPTION 'Member is not in your gym';
    END IF;
  END IF;

  SELECT * INTO v_class FROM classes WHERE id = p_class_id;
  IF v_class.id IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF NOT v_class.is_active THEN RAISE EXCEPTION 'Class is not active'; END IF;           -- E9
  IF v_class.gym_id <> v_student.gym_id THEN RAISE EXCEPTION 'Class and member are in different gyms'; END IF;

  -- E9 eligibility: belt requirement (belt_rank_enum is ordered white→black).
  IF v_class.belt_requirement IS NOT NULL AND v_student.current_belt_rank < v_class.belt_requirement THEN
    RAISE EXCEPTION 'Member does not meet the belt requirement for this class';
  END IF;
  SELECT date_of_birth INTO v_dob FROM profiles WHERE id = v_student.profile_id;
  IF v_dob IS NOT NULL THEN
    v_age := date_part('year', age(v_dob));
    IF v_class.min_age IS NOT NULL AND v_age < v_class.min_age THEN RAISE EXCEPTION 'Member is below the minimum age for this class'; END IF;
    IF v_class.max_age IS NOT NULL AND v_age > v_class.max_age THEN RAISE EXCEPTION 'Member is above the maximum age for this class'; END IF;
  END IF;

  -- E1: one open registration per (class, student).
  IF EXISTS (SELECT 1 FROM class_registrations
             WHERE class_id = p_class_id AND student_id = v_student.id
               AND status IN ('requested', 'active', 'waitlisted')) THEN
    RAISE EXCEPTION 'There is already an open registration for this class';
  END IF;

  INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, monthly_fee_lbp, requested_at)
  VALUES (p_class_id, v_student.id, v_class.gym_id, 'requested', v_class.monthly_fee_usd, v_class.monthly_fee_lbp, now())
  RETURNING * INTO v_reg;

  -- class_requested → staff (owner + receptionist). REG-FIX: valid recipients only
  -- (FK target = profiles since 000032) + best-effort, so a profile-less staff role
  -- can never roll back the registration. (The 000065 trigger is the systemic net.)
  SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name FROM profiles p WHERE p.id = v_student.profile_id;
  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
    SELECT ur.user_id, v_class.gym_id, 'class_requested', 'messages.class_requested.title', 'messages.class_requested.body',
           jsonb_build_object('studentName', v_name, 'class', COALESCE(v_class.name_en, v_class.name_ar)),
           'class_registration', v_reg.id, '/classes/' || p_class_id
    FROM user_roles ur
    WHERE ur.gym_id = v_class.gym_id AND ur.role IN ('owner', 'receptionist')
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ur.user_id);
  EXCEPTION WHEN OTHERS THEN NULL; -- best-effort; the registration is authoritative
  END;

  RETURN v_reg;
END;
$$;
GRANT EXECUTE ON FUNCTION request_class_registration(UUID, UUID) TO authenticated;
