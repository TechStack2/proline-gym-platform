-- ============================================================
-- 000057: F3-lean — Waiver / consent record + signature capture (V1 / F3)
-- PRO LINE Gym Platform
--
-- A gym-CONFIGURABLE liability waiver (tenant-clean: the text is DATA) with
-- in-app signature capture. NOT third-party e-sign, NO PDF, NO enforcement gate.
--
--   waiver_templates  — ONE active waiver per gym (UNIQUE gym_id). title+body
--     ar/en/fr, version INT, is_active. Editing the BODY bumps `version` (so
--     existing signatures become "outdated" and trigger re-sign). Staff write
--     own-gym; ANY authenticated member reads it in-gym (they must read what
--     they sign).
--   waiver_signatures — APPEND-ONLY (re-sign = new row). student_id (the member
--     the waiver covers) + signed_by_profile_id (the signer: the member, or the
--     GUARDIAN for a minor, B3) + template_id/template_version SNAPSHOT at sign
--     time + signature artifact + typed_name + signed_at + user_agent. "Current"
--     = the latest row whose template_version >= the active template version.
--
-- STORAGE CHOICE (coder's call, per the prompt): the signature artifact is a
-- base64 PNG data-URL stored IN THE ROW (`signature` TEXT) — no Storage bucket,
-- no extra Storage-RLS surface; the row's own gym-scoped RLS covers the artifact
-- and the e2e can assert the artifact persisted by reading the row. A drawn pad
-- PNG is a few KB. (Bucket path was the alternative; in-row is the lean choice.)
--
-- RLS reuses the established helpers: is_staff(), get_user_gym_id(),
-- is_guardian_of(student_id) (000037). No helper or policy is weakened.
-- ============================================================

-- ── 1. waiver_templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waiver_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  title_ar    TEXT NOT NULL DEFAULT '',
  title_en    TEXT NOT NULL DEFAULT '',
  title_fr    TEXT NOT NULL DEFAULT '',
  body_ar     TEXT NOT NULL DEFAULT '',
  body_en     TEXT NOT NULL DEFAULT '',
  body_fr     TEXT NOT NULL DEFAULT '',
  version     INT  NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waiver_templates_one_per_gym UNIQUE (gym_id)  -- one active waiver / gym (V1)
);

ALTER TABLE waiver_templates ENABLE ROW LEVEL SECURITY;

-- Members must READ the text they sign → any authenticated user IN THE GYM reads.
DROP POLICY IF EXISTS waiver_templates_read ON waiver_templates;
CREATE POLICY waiver_templates_read ON waiver_templates FOR SELECT
  USING (gym_id = get_user_gym_id());

-- Staff of the gym write (create / edit / activate).
DROP POLICY IF EXISTS waiver_templates_staff_insert ON waiver_templates;
CREATE POLICY waiver_templates_staff_insert ON waiver_templates FOR INSERT
  WITH CHECK (is_staff() AND gym_id = get_user_gym_id());

DROP POLICY IF EXISTS waiver_templates_staff_update ON waiver_templates;
CREATE POLICY waiver_templates_staff_update ON waiver_templates FOR UPDATE
  USING (is_staff() AND gym_id = get_user_gym_id())
  WITH CHECK (is_staff() AND gym_id = get_user_gym_id());

DROP POLICY IF EXISTS waiver_templates_staff_delete ON waiver_templates;
CREATE POLICY waiver_templates_staff_delete ON waiver_templates FOR DELETE
  USING (is_staff() AND gym_id = get_user_gym_id());

-- ── 2. waiver_signatures (APPEND-ONLY) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS waiver_signatures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  signed_by_profile_id  UUID NOT NULL REFERENCES profiles(id),
  template_id           UUID NOT NULL REFERENCES waiver_templates(id),
  template_version      INT  NOT NULL,
  signature             TEXT NOT NULL,          -- base64 PNG data-URL (the artifact)
  typed_name            TEXT NOT NULL DEFAULT '',
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiver_sig_student ON waiver_signatures (student_id, template_version DESC);
CREATE INDEX IF NOT EXISTS idx_waiver_sig_gym ON waiver_signatures (gym_id);

ALTER TABLE waiver_signatures ENABLE ROW LEVEL SECURITY;

-- READ: staff of the gym; the SIGNER (self); a GUARDIAN of the covered student
-- (000037 is_guardian_of); and the covered MEMBER themselves (own student row).
DROP POLICY IF EXISTS waiver_signatures_read ON waiver_signatures;
CREATE POLICY waiver_signatures_read ON waiver_signatures FOR SELECT
  USING (
    (is_staff() AND gym_id = get_user_gym_id())
    OR signed_by_profile_id = auth.uid()
    OR is_guardian_of(student_id)
    OR EXISTS (SELECT 1 FROM students s WHERE s.id = student_id AND s.profile_id = auth.uid())
  );

-- INSERT (the ONLY write): always signed AS yourself, in your gym, and you may
-- sign for yourself (own student), your linked minor (guardian), or — as staff —
-- any member of your gym (front-desk capture).
DROP POLICY IF EXISTS waiver_signatures_insert ON waiver_signatures;
CREATE POLICY waiver_signatures_insert ON waiver_signatures FOR INSERT
  WITH CHECK (
    gym_id = get_user_gym_id()
    AND signed_by_profile_id = auth.uid()
    AND (
      is_staff()
      OR is_guardian_of(student_id)
      OR EXISTS (SELECT 1 FROM students s WHERE s.id = student_id AND s.profile_id = auth.uid())
    )
  );
-- No UPDATE / DELETE policy → the table is APPEND-ONLY under RLS (re-sign = new row).

-- ── 3. Seed a default Proline waiver into every e2e gym ──────────────────────
-- Rename-once cascade (the established seed chain): the current seed_e2e_gym
-- (G1 wrapper) becomes seed_e2e_gym_g1; the new wrapper calls it, then seeds the
-- gym's default active waiver template (idempotent on the one-per-gym unique).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_g1') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_g1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym UUID;
BEGIN
  v_gym := seed_e2e_gym_g1(p_slug, p_password);

  IF NOT EXISTS (SELECT 1 FROM waiver_templates WHERE gym_id = v_gym) THEN
    INSERT INTO waiver_templates (gym_id, title_ar, title_en, title_fr, body_ar, body_en, body_fr, version, is_active)
    VALUES (
      v_gym,
      'إقرار وإخلاء مسؤولية', 'Liability Waiver', 'Décharge de responsabilité',
      'أقرّ بأن التدريب على فنون القتال ينطوي على مخاطر جسدية، وأتحمّل هذه المخاطر طوعاً، وأُخلي نادي برو لاين من المسؤولية عن أي إصابة.',
      'I acknowledge that martial-arts training carries inherent physical risk. I voluntarily assume that risk and release PRO LINE Gym from liability for any injury.',
      'Je reconnais que la pratique des arts martiaux comporte des risques physiques. J''assume volontairement ces risques et dégage PRO LINE Gym de toute responsabilité en cas de blessure.',
      1, true
    );
  END IF;

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
