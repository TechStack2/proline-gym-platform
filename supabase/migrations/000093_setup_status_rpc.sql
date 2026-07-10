-- ============================================================
-- 000093: TODAY-DERISK — get_setup_status(): one-round-trip setup signals
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / TODAY-DERISK)
--
-- /today renders the derived onboarding checklist (six milestones) on EVERY load,
-- even for a fully-configured gym (it self-hides only AFTER computing that it's
-- done). The TS engine (lib/gym/setup-checklist.ts) fires ~15 count/exists probes
-- across ~10 tables in Promise.all batches — the biggest slice of the /today query
-- burst the 3-sweep review flagged, and the worst latency on gym Wi-Fi.
--
-- This collapses ALL of those existence/count probes into ONE aggregate read: a
-- single row of raw signals the TS assembles into the exact same items/milestones
-- (the product gating + branding derivation stay in TS — this returns raw signals
-- only, so behavior is byte-identical). SECURITY DEFINER (the checklist reads span
-- catalogs whose _read policies are blanket-authenticated) but SELF-SCOPED to the
-- caller's own gym — `g.id = get_user_gym_id()` — so it can NEVER read another
-- gym's setup state even though callers pass their own gym id.
--
-- Every predicate mirrors setup-checklist.ts exactly:
--   · catalogs are gym-scoped + soft-delete aware (deleted_at IS NULL);
--   · exchange_rates has NO deleted_at (FX-PER-GYM 000090);
--   · the class signal = a class_schedules row whose ACTIVE, non-deleted class is in
--     this gym (class_schedules has no gym_id → join classes; the leak-safe pattern);
--   · upcoming camp = live status set + not-yet-ended (camps have status, no is_active);
--   · membership_plans / pt_packages are computed unconditionally here but only USED
--     when the product is enabled (TS gates), so the output is unchanged.
-- Read-only, additive, replay-clean; no table/column/policy change.
-- ============================================================

CREATE OR REPLACE FUNCTION get_setup_status(p_gym_id UUID)
RETURNS TABLE (
  name_ar TEXT, name_en TEXT, name_fr TEXT, slug TEXT, phone TEXT, email TEXT,
  logo_url TEXT, brand_color TEXT, hero_image_url TEXT,
  tagline_ar TEXT, tagline_en TEXT, tagline_fr TEXT, enabled_products JSONB,
  has_discipline BOOLEAN, has_coach BOOLEAN, has_class_schedule BOOLEAN,
  has_membership_plan BOOLEAN, has_pt_package BOOLEAN, has_exchange_rate BOOLEAN,
  has_student BOOLEAN, has_upcoming_camp BOOLEAN, has_bookable_coach BOOLEAN,
  has_landing_class BOOLEAN, has_landing_coach BOOLEAN, first_coach_id UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    g.name_ar::TEXT, g.name_en::TEXT, g.name_fr::TEXT, g.slug::TEXT, g.phone::TEXT, g.email::TEXT,
    g.logo_url::TEXT, g.brand_color::TEXT, g.hero_image_url::TEXT,
    g.tagline_ar::TEXT, g.tagline_en::TEXT, g.tagline_fr::TEXT, g.enabled_products,
    EXISTS (SELECT 1 FROM disciplines d WHERE d.gym_id = g.id AND d.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM coaches c WHERE c.gym_id = g.id AND c.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM class_schedules s JOIN classes c ON c.id = s.class_id
              WHERE c.gym_id = g.id AND c.is_active AND c.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM membership_plans mp WHERE mp.gym_id = g.id AND mp.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM pt_packages pp WHERE pp.gym_id = g.id AND pp.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM exchange_rates er WHERE er.gym_id = g.id),
    EXISTS (SELECT 1 FROM students st WHERE st.gym_id = g.id AND st.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM camps cm WHERE cm.gym_id = g.id AND cm.deleted_at IS NULL
              AND cm.status IN ('open', 'in_progress', 'full') AND cm.end_date >= CURRENT_DATE),
    EXISTS (SELECT 1 FROM coach_availability ca WHERE ca.gym_id = g.id AND ca.is_active),
    EXISTS (SELECT 1 FROM classes c WHERE c.gym_id = g.id AND c.show_on_landing AND c.is_active AND c.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM coaches c WHERE c.gym_id = g.id AND c.landing_visible AND c.is_active AND c.deleted_at IS NULL),
    (SELECT c.id FROM coaches c WHERE c.gym_id = g.id AND c.is_active AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC LIMIT 1)
  FROM gyms g
  WHERE g.id = p_gym_id AND g.id = get_user_gym_id();
$$;

REVOKE ALL ON FUNCTION get_setup_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_setup_status(UUID) TO authenticated;
