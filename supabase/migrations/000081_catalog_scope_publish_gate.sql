-- ============================================================
-- 000081: CATALOG-SCOPE-FIX — restore the show_on_landing publish gate
-- PRO LINE Gym Platform (hotfix)
--
-- REGRESSION. 000080 replaced the anon *_public_read policies with per-gym definer
-- RPCs, but two of them (get_landing_schedule, get_landing_class_fees) were based
-- on the SECTION QUERY's filters (.eq('is_active')) instead of the ANON POLICY's
-- USING clause. 000036 had TIGHTENED the classes anon read path to also require
-- `show_on_landing` — both classes_public_read (is_active AND show_on_landing AND
-- is_active_gym) and is_public_class() (which gated class_schedules_public_read).
-- Dropping that gate leaked STAGED/unpublished classes onto the public landing's
-- #schedule and per-class fees (adm1.spec.ts:43).
--
-- FIX-FORWARD (do NOT revert 000080 — its dropped anon policies are live on cloud;
-- reverting would blank the landing). CREATE OR REPLACE exactly the two affected
-- RPCs, adding ONE predicate `AND c.show_on_landing`, changing nothing else. The
-- sole definer of both is 000080 (this base), so there is no rewrite-revert risk.
-- The other four RPCs already match their latest anon policies — left untouched.
-- STABLE SECURITY DEFINER SET search_path=public; re-REVOKE/GRANT both. Replay-clean.
-- ============================================================

CREATE OR REPLACE FUNCTION get_landing_schedule(p_gym_id UUID)
RETURNS TABLE (class_id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT, color TEXT,
               day_of_week SMALLINT, start_time TIME, end_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT, c.color::TEXT,
         s.day_of_week, s.start_time, s.end_time
  FROM classes c
  JOIN class_schedules s ON s.class_id = c.id
  WHERE c.gym_id = p_gym_id AND c.is_active AND c.show_on_landing AND s.is_active AND is_active_gym(c.gym_id)
  ORDER BY s.start_time, s.day_of_week, c.name_en;
$$;
REVOKE ALL ON FUNCTION get_landing_schedule(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_schedule(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_landing_class_fees(p_gym_id UUID)
RETURNS TABLE (id UUID, name_ar TEXT, name_en TEXT, name_fr TEXT,
               monthly_fee_usd NUMERIC, monthly_fee_lbp NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name_ar::TEXT, c.name_en::TEXT, c.name_fr::TEXT,
         c.monthly_fee_usd, c.monthly_fee_lbp
  FROM classes c
  WHERE c.gym_id = p_gym_id AND c.is_active AND c.show_on_landing AND c.monthly_fee_usd IS NOT NULL
    AND is_active_gym(c.gym_id)
  ORDER BY c.monthly_fee_usd;
$$;
REVOKE ALL ON FUNCTION get_landing_class_fees(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_landing_class_fees(UUID) TO anon, authenticated;
