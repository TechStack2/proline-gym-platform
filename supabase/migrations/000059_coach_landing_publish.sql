-- ============================================================
-- 000059: COACH LANDING SHOWCASE + EDIT→PUBLISH WORKFLOW (Cycle 6 / COACH-LP)
-- PRO LINE Gym Platform
--
-- Showcase the gym's coaches grandiosely on the public landing, with a
-- coach-edit → admin-publish workflow:
--   coach edits in the portal → saved PENDING (not live) → staff review in
--   Coach-360 → admin "Publish to live" applies pending→live + shows on landing.
--
-- Mirrors the 000036 classes `show_on_landing` publish switch, plus a pending-
-- draft mechanism. Leanest model that satisfies the leak guard:
--   • coaches gets: landing_visible (admin-set), landing_status (active|coming_soon),
--     has_pending_changes, last_published_at — the LIVE/published surface.
--   • a SEPARATE `coach_profile_pending` table holds drafts → anon has ZERO read
--     path to drafts (no anon policy on it at all), so a pending edit can never
--     leak publicly. (A draft jsonb ON coaches would be anon-readable since RLS is
--     row- not column-level — the separate table is the clean isolation.)
--   • anon reads the showcase ONLY via get_landing_coaches() — a SECURITY DEFINER
--     projection of published fields of landing_visible coaches; never the drafts.
--   • publish + landing-visibility are owner/head_coach-only (mirror TEAM-1);
--     reception may edit (write a draft) but not publish.
-- Forward-only, idempotent. Never weakens existing RLS (coaches_staff/_self stand).
-- ============================================================

-- 1) coaches: the live publish surface ------------------------------------------
ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS landing_visible      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS landing_status       TEXT        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS has_pending_changes  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_published_at    TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE coaches ADD CONSTRAINT coaches_landing_status_chk
    CHECK (landing_status IN ('active', 'coming_soon'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Pending-draft store — separate table so anon has no path to drafts ----------
CREATE TABLE IF NOT EXISTS coach_profile_pending (
  coach_id           UUID PRIMARY KEY REFERENCES coaches(id) ON DELETE CASCADE,
  gym_id             UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  specialization_ar  VARCHAR(255),
  specialization_en  VARCHAR(255),
  specialization_fr  VARCHAR(255),
  bio_ar             TEXT,
  bio_en             TEXT,
  bio_fr             TEXT,
  avatar_url         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID
);
ALTER TABLE coach_profile_pending ENABLE ROW LEVEL SECURITY;

-- coach edits OWN draft; staff (owner/head_coach/reception) edit any in-gym draft.
-- NO anon policy → drafts are unreadable to the public. (Mirrors coaches_self +
-- coaches_staff predicates exactly — no widening.)
DROP POLICY IF EXISTS coach_pending_self ON coach_profile_pending;
CREATE POLICY coach_pending_self ON coach_profile_pending FOR ALL
  USING (coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()))
  WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS coach_pending_staff ON coach_profile_pending;
CREATE POLICY coach_pending_staff ON coach_profile_pending FOR ALL
  USING (gym_id = get_user_gym_id() AND get_user_role() IN ('owner', 'head_coach', 'receptionist'))
  WITH CHECK (gym_id = get_user_gym_id() AND get_user_role() IN ('owner', 'head_coach', 'receptionist'));

-- keep coaches.has_pending_changes in sync with the draft's existence
CREATE OR REPLACE FUNCTION sync_coach_has_pending()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE coaches SET has_pending_changes = false WHERE id = OLD.coach_id;
    RETURN OLD;
  ELSE
    UPDATE coaches SET has_pending_changes = true WHERE id = NEW.coach_id;
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_coach_has_pending ON coach_profile_pending;
CREATE TRIGGER trg_sync_coach_has_pending
  AFTER INSERT OR UPDATE OR DELETE ON coach_profile_pending
  FOR EACH ROW EXECUTE FUNCTION sync_coach_has_pending();

-- 3) Anon landing reader — PUBLISHED projection only (never drafts) --------------
CREATE OR REPLACE FUNCTION get_landing_coaches(p_gym_id UUID)
RETURNS TABLE (
  id                UUID,
  first_name_ar     TEXT,
  first_name_en     TEXT,
  first_name_fr     TEXT,
  last_name_ar      TEXT,
  last_name_en      TEXT,
  last_name_fr      TEXT,
  avatar_url        TEXT,
  specialization_ar TEXT,
  specialization_en TEXT,
  specialization_fr TEXT,
  bio_ar            TEXT,
  bio_en            TEXT,
  bio_fr            TEXT,
  landing_status    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    p.first_name_ar, p.first_name_en, p.first_name_fr,
    p.last_name_ar,  p.last_name_en,  p.last_name_fr,
    p.avatar_url,
    c.specialization_ar, c.specialization_en, c.specialization_fr,
    c.bio_ar, c.bio_en, c.bio_fr,
    c.landing_status
  FROM coaches c
  JOIN profiles p ON p.id = c.profile_id
  WHERE c.gym_id = p_gym_id
    AND c.is_active
    AND c.landing_visible
    AND is_active_gym(c.gym_id)
  -- current coaches first, "coming soon" last; then alphabetical
  ORDER BY (c.landing_status = 'coming_soon'), p.first_name_en;
$$;
REVOKE ALL ON FUNCTION get_landing_coaches(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_coaches(UUID) TO anon, authenticated;

-- 4) Publish (owner/head_coach ONLY): apply pending→live, set visible, clear ------
CREATE OR REPLACE FUNCTION publish_coach_profile(p_coach_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gym       UUID;
  v_profile   UUID;
  v_pending   coach_profile_pending%ROWTYPE;
BEGIN
  SELECT gym_id, profile_id INTO v_gym, v_profile FROM coaches WHERE id = p_coach_id;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'coach not found'; END IF;

  -- TEAM-1 guardrail: publish to the public landing is owner/head_coach only.
  IF get_user_gym_id() <> v_gym OR get_user_role() NOT IN ('owner', 'head_coach') THEN
    RAISE EXCEPTION 'forbidden: publish requires owner or head_coach';
  END IF;

  SELECT * INTO v_pending FROM coach_profile_pending WHERE coach_id = p_coach_id;
  IF FOUND THEN
    UPDATE coaches SET
      specialization_ar = COALESCE(v_pending.specialization_ar, specialization_ar),
      specialization_en = COALESCE(v_pending.specialization_en, specialization_en),
      specialization_fr = COALESCE(v_pending.specialization_fr, specialization_fr),
      bio_ar            = COALESCE(v_pending.bio_ar, bio_ar),
      bio_en            = COALESCE(v_pending.bio_en, bio_en),
      bio_fr            = COALESCE(v_pending.bio_fr, bio_fr),
      landing_visible   = true,
      has_pending_changes = false,
      last_published_at = now()
    WHERE id = p_coach_id;

    IF v_pending.avatar_url IS NOT NULL AND v_profile IS NOT NULL THEN
      UPDATE profiles SET avatar_url = v_pending.avatar_url WHERE id = v_profile;
    END IF;

    DELETE FROM coach_profile_pending WHERE coach_id = p_coach_id;
  ELSE
    -- nothing pending → publish simply makes the live profile visible
    UPDATE coaches SET landing_visible = true, last_published_at = now()
      WHERE id = p_coach_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION publish_coach_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publish_coach_profile(UUID) TO authenticated;

-- 5) Landing visibility/status setter (owner/head_coach): coming-soon + hide ------
CREATE OR REPLACE FUNCTION set_coach_landing(p_coach_id UUID, p_visible BOOLEAN, p_status TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gym UUID;
BEGIN
  IF p_status NOT IN ('active', 'coming_soon') THEN
    RAISE EXCEPTION 'invalid landing_status';
  END IF;
  SELECT gym_id INTO v_gym FROM coaches WHERE id = p_coach_id;
  IF v_gym IS NULL THEN RAISE EXCEPTION 'coach not found'; END IF;
  IF get_user_gym_id() <> v_gym OR get_user_role() NOT IN ('owner', 'head_coach') THEN
    RAISE EXCEPTION 'forbidden: landing visibility requires owner or head_coach';
  END IF;
  UPDATE coaches SET landing_visible = p_visible, landing_status = p_status WHERE id = p_coach_id;
END; $$;
REVOKE ALL ON FUNCTION set_coach_landing(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_coach_landing(UUID, BOOLEAN, TEXT) TO authenticated;

-- 6) e2e seed wrap: Sami stays HIDDEN (the workflow coach the test publishes), and
--    a published COMING-SOON coach is added so the showcase + coming-soon +
--    leak-guard tests have deterministic fixtures. Wrap the current seeder rather
--    than duplicate it (idempotent; base returns the existing gym id on re-run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_pre_coachlp') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_pre_coachlp;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gym       UUID;
  v_cs_prof   UUID;
BEGIN
  v_gym := seed_e2e_gym_pre_coachlp(p_slug, p_password);

  -- Sami is deliberately NOT landing_visible — the COACH-LP workflow test edits
  -- then publishes him, proving publish is the only path to the landing.

  -- A published "coming soon" coach for the showcase + coming-soon treatment.
  IF NOT EXISTS (
    SELECT 1 FROM coaches c JOIN profiles p ON p.id = c.profile_id
    WHERE c.gym_id = v_gym AND p.first_name_en = 'Nadia' AND p.last_name_en = 'Khoury'
  ) THEN
    INSERT INTO profiles (gym_id, first_name_ar, first_name_en, first_name_fr,
      last_name_ar, last_name_en, last_name_fr, phone, gender)
    VALUES (v_gym, 'نادية', 'Nadia', 'Nadia', 'خوري', 'Khoury', 'Khoury', '+96170000077', 'female')
    RETURNING id INTO v_cs_prof;

    INSERT INTO coaches (profile_id, gym_id, specialization_ar, specialization_en, specialization_fr,
      bio_ar, bio_en, bio_fr, belt_rank, hourly_rate_usd, is_active,
      landing_visible, landing_status, last_published_at)
    VALUES (v_cs_prof, v_gym, 'ملاكمة', 'Boxing', 'Boxe',
      'بطلة ملاكمة قادمة قريباً', 'Champion boxer — joining the team soon.', 'Championne de boxe — bientôt dans l''équipe.',
      'black_1', 30.00, true,
      true, 'coming_soon', now());
  END IF;

  RETURN v_gym;
END; $$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
