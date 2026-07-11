-- ============================================================
-- 000094: MJ-1 FAMILY-DOOR — the family account model, end-to-end
-- PRO LINE Gym Platform / "Gym 360 Pro" (Member Journey 2.0, slice 1/5)
--
-- The ratified model: minors default to NO login (the guardian is the family's
-- door); "can hold own login" is a STAFF-EDITABLE eligibility override, NOT a
-- hard age rule; credentials attach to the existing profile via invite/adopt;
-- staff are the only credential gate (no public registration anywhere).
--
-- This migration adds the backend the app layer needs:
--   1. students.portal_login_override — the nullable staff eligibility toggle
--      (NULL = age-derived default; TRUE/FALSE = explicit staff override).
--   2. normalize_lb_phone() — a SQL mirror of toE164Digits (lib/whatsapp/link.ts)
--      so phone comparisons agree on both sides regardless of formatting.
--   3. find_profile_by_phone() — ONE gym-scoped, normalized EXACT-match guardian
--      lookup shared by the add-member wizard AND the guardian panel (kills the
--      wizard's old ilike '%phone%' fuzzy match).
--   4. credentialed_phone_owner() — the credential invariant: does another
--      CREDENTIALED (has an auth user) profile in the caller's gym already hold
--      this phone? Login-less records may share a phone freely; the check bites
--      only at credential issuance (inviteToPortal).
--   5. attach_student_to_profile() — the dual-hat write: give an EXISTING profile
--      (a guardian training too) its own students row, no second person/phone.
--
-- All gym-scoped via get_user_gym_id() + is_staff(); DEFINER only where a read of
-- auth.users / an RLS-independent write is required.
-- ============================================================

-- 1. Eligibility override — nullable: NULL defers to the age-derived default.
ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_login_override BOOLEAN;
COMMENT ON COLUMN students.portal_login_override IS
  'MJ-1: staff override for portal-login eligibility. NULL = age-derived default '
  '(DOB>=18 eligible, <18 not); TRUE/FALSE = explicit staff decision.';

-- 2. Lebanese phone → e164 digits (no +). Mirrors toE164Digits in
--    src/lib/whatsapp/link.ts EXACTLY (961 default; 961-prefixed as-is; 00 stripped;
--    leading 0 → 961; <=8 local digits → 961-prefixed). IMMUTABLE → index/compare safe.
CREATE OR REPLACE FUNCTION normalize_lb_phone(p_phone TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d = '' THEN ''
    WHEN d LIKE '961%' THEN d
    WHEN d LIKE '00%' THEN substr(d, 3)
    WHEN d LIKE '0%' THEN '961' || substr(d, 2)
    WHEN length(d) <= 8 THEN '961' || d
    ELSE d
  END
  FROM (SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS d) t
$$;

-- 3. Gym-scoped, normalized EXACT-match profile lookup (the shared guardian lookup).
--    DEFINER so it can match across the gym's profiles, but scoped to the CALLER's
--    gym (get_user_gym_id reads the caller's JWT) and gated to staff.
CREATE OR REPLACE FUNCTION find_profile_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  first_name_ar TEXT, first_name_en TEXT, first_name_fr TEXT,
  last_name_ar TEXT, last_name_en TEXT, last_name_fr TEXT,
  phone TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name_ar, p.first_name_en, p.first_name_fr,
         p.last_name_ar, p.last_name_en, p.last_name_fr, p.phone
  FROM profiles p
  WHERE is_staff()
    AND p.gym_id = get_user_gym_id()
    AND normalize_lb_phone(p_phone) <> ''
    AND normalize_lb_phone(p.phone) = normalize_lb_phone(p_phone)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION find_profile_by_phone(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_profile_by_phone(TEXT) TO authenticated;

-- 4. The credential invariant. Returns the display name of a DIFFERENT profile in
--    the caller's gym that (a) already has an auth.users row (is credentialed) and
--    (b) holds the same normalized phone; NULL when the phone is free to credential.
--    Login-less profiles (no auth user) are excluded → they may share phones.
CREATE OR REPLACE FUNCTION credentialed_phone_owner(p_phone TEXT, p_exclude UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_norm TEXT := normalize_lb_phone(p_phone);
  v_name TEXT;
BEGIN
  IF NOT is_staff() OR v_norm = '' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(
           NULLIF(TRIM(COALESCE(p.first_name_en, '') || ' ' || COALESCE(p.last_name_en, '')), ''),
           p.first_name_ar,
           'this member')
    INTO v_name
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.gym_id = get_user_gym_id()
     AND p.id <> p_exclude
     AND normalize_lb_phone(p.phone) = v_norm
   LIMIT 1;
  RETURN v_name; -- NULL when no credentialed holder
END $$;
REVOKE ALL ON FUNCTION credentialed_phone_owner(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credentialed_phone_owner(TEXT, UUID) TO authenticated;

-- 5. Dual-hat: attach a students row to an EXISTING profile (a guardian who trains
--    too). No new profile, no second phone. Gym-scoped + staff-gated; idempotent
--    (returns the existing active row if one already exists).
CREATE OR REPLACE FUNCTION attach_student_to_profile(p_profile_id UUID)
RETURNS students
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gym UUID := get_user_gym_id();
  v_student students;
BEGIN
  IF NOT is_staff() OR v_gym IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- The profile must be a real person in the caller's gym.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id AND gym_id = v_gym) THEN
    RAISE EXCEPTION 'profile not in gym' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_student FROM students WHERE profile_id = p_profile_id AND gym_id = v_gym LIMIT 1;
  IF FOUND THEN
    RETURN v_student;
  END IF;
  INSERT INTO students (profile_id, gym_id, join_date, is_active)
  VALUES (p_profile_id, v_gym, CURRENT_DATE, true)
  RETURNING * INTO v_student;
  RETURN v_student;
END $$;
REVOKE ALL ON FUNCTION attach_student_to_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attach_student_to_profile(UUID) TO authenticated;
