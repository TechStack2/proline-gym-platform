-- ============================================================
-- 000068: NO-MEMBERSHIP — per-gym OPTIONAL products (white-label)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / NO-MEMBERSHIP)
--
-- Proline sells classes + PT only; membership is a per-gym OPTIONAL product that
-- is HIDDEN/GATED when off (never deleted — the platform is white-label). This
-- ADDITIVE, replay-clean migration:
--   1. gyms.enabled_products JSONB (default: everything ON) — one source of truth.
--   2. Gates the MEMBERSHIP lifecycle in run_lifecycle_tick (issue/lapse/freeze):
--      skip a gym's membership loops when enabled_products->>'membership' = false.
--      Class-registration renewals/suspends are UNTOUCHED. NULL/missing = ON.
--   3. seed_e2e_gym_no_membership(slug) — an e2e-only, service_role-only seed for
--      the gating spec (isolated gym with membership disabled; mirrors the
--      reset_ml1_e2e pattern), so ml1/pause-card/billing keep their ENABLED gyms.
--
-- Proline's own flag is NOT set here — the auditor sets it on prod post-VF.
-- No RLS change (default-privileges/policies unchanged; a JSONB column + a gated
-- SECURITY DEFINER read).
-- ============================================================

-- 1. The flag column — default everything ON so every existing gym is unchanged.
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS enabled_products JSONB
  NOT NULL DEFAULT '{"membership":true,"class":true,"pt":true,"camp":true}'::jsonb;

-- 2. Gate the MEMBERSHIP lifecycle. Full current body of run_lifecycle_tick (from
--    000047, the latest definer) + a per-gym membership gate on the three
--    membership loops (auto-unfreeze, renewals, lapse). CREATE OR REPLACE needs the
--    whole body; this is based on the CURRENT live definition, so no later
--    amendment is reverted (see [[function-rewrite-reverts-later-migrations]]).
--    The gate is per-gym (`g.enabled_products`), so it holds even in the all-gyms
--    sweep (p_gym_id IS NULL). Registration renewals/suspends are unchanged.
CREATE OR REPLACE FUNCTION run_lifecycle_tick(p_gym_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unfrozen  INTEGER := 0;
  v_issued    INTEGER := 0;
  v_reminded  INTEGER := 0;
  v_lapsed    INTEGER := 0;
  v_suspended INTEGER := 0;
  r RECORD;
BEGIN
  -- 1. AUTO-UNFREEZE: planned date reached → active (end_date was already
  --    extended at freeze time; the freeze row closes at its planned value).
  --    NO-MEMBERSHIP: skip gyms with membership disabled.
  FOR r IN
    SELECT m.id FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    JOIN gyms g ON g.id = s.gym_id
    WHERE m.status = 'paused' AND m.pause_end_date IS NOT NULL AND m.pause_end_date <= CURRENT_DATE
      AND COALESCE((g.enabled_products->>'membership')::boolean, true)
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    UPDATE membership_freezes SET actual_end_date = planned_end_date
    WHERE membership_id = r.id AND actual_end_date IS NULL;
    UPDATE student_memberships
    SET status = 'active', pause_start_date = NULL, pause_end_date = NULL, updated_at = now()
    WHERE id = r.id;
    v_unfrozen := v_unfrozen + 1;
  END LOOP;

  -- 2a. MEMBERSHIP RENEWALS inside lead time (frozen excluded by status guard).
  --     NO-MEMBERSHIP: skip gyms with membership disabled.
  FOR r IN
    SELECT m.id FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    JOIN gyms g ON g.id = s.gym_id
    WHERE m.status = 'active'
      AND m.end_date <= CURRENT_DATE + g.renewal_lead_days
      AND COALESCE((g.enabled_products->>'membership')::boolean, true)
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    IF _issue_membership_renewal(r.id) IS NOT NULL THEN v_issued := v_issued + 1; END IF;
  END LOOP;

  -- 2b. REGISTRATION RENEWALS inside lead time. (class product — UNCHANGED)
  FOR r IN
    SELECT cr.id FROM class_registrations cr
    JOIN gyms g ON g.id = cr.gym_id
    WHERE cr.status = 'active'
      AND COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          <= CURRENT_DATE + g.renewal_lead_days
      AND (p_gym_id IS NULL OR cr.gym_id = p_gym_id)
  LOOP
    IF _issue_registration_renewal(r.id) IS NOT NULL THEN v_issued := v_issued + 1; END IF;
  END LOOP;

  -- 3. DUNNING REMINDERS on open renewal invoices: at due, and at due+3d.
  --    (product-agnostic — reminds on whatever renewal invoices exist; a
  --    membership-off gym simply has none, so no membership reminder fires.)
  FOR r IN
    SELECT i.id AS invoice_id, i.due_date, i.total_usd, s.profile_id, s.gym_id AS gid,
           (CURRENT_DATE >= i.due_date + 3) AS second_nudge
    FROM renewal_invoices ri
    JOIN invoices i ON i.id = ri.invoice_id
    JOIN students s ON s.id = i.student_id
    WHERE i.status IN ('pending', 'partial')
      AND i.due_date <= CURRENT_DATE
      AND (p_gym_id IS NULL OR i.gym_id = p_gym_id)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'renewal_reminder',
              'messages.renewal_reminder.title', 'messages.renewal_reminder.body',
              jsonb_build_object('amount', r.total_usd),
              'invoice', r.invoice_id, '/portal/billing',
              'remind_' || (CASE WHEN r.second_nudge THEN '3_' ELSE '0_' END) || r.invoice_id)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
      IF FOUND THEN v_reminded := v_reminded + 1; END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- 4a. LAPSE memberships past end+grace with NO PAID renewal for the period.
  --     NO-MEMBERSHIP: skip gyms with membership disabled.
  FOR r IN
    SELECT m.id, m.end_date, s.profile_id, s.gym_id AS gid
    FROM student_memberships m
    JOIN students s ON s.id = m.student_id
    JOIN gyms g ON g.id = s.gym_id
    WHERE m.status = 'active'
      AND m.end_date + g.dunning_grace_days < CURRENT_DATE
      AND COALESCE((g.enabled_products->>'membership')::boolean, true)
      AND NOT EXISTS (
        SELECT 1 FROM renewal_invoices ri JOIN invoices i ON i.id = ri.invoice_id
        WHERE ri.product_type = 'membership' AND ri.product_id = m.id
          AND ri.period_start = m.end_date AND i.status = 'paid'
      )
      AND (p_gym_id IS NULL OR s.gym_id = p_gym_id)
  LOOP
    UPDATE student_memberships SET status = 'lapsed', updated_at = now() WHERE id = r.id;
    v_lapsed := v_lapsed + 1;
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'membership_lapsed',
              'messages.membership_lapsed.title', 'messages.membership_lapsed.body',
              '{}'::jsonb, 'student_membership', r.id, '/portal/billing',
              'lapsed_' || r.id || '_' || r.end_date)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- 4b. SUSPEND registrations past paid_until+grace (seat frees → B2 promote).
  --     (class product — UNCHANGED)
  FOR r IN
    SELECT cr.id, cr.class_id, cr.student_id, cr.gym_id AS gid, s.profile_id,
           COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30) AS anchor
    FROM class_registrations cr
    JOIN gyms g ON g.id = cr.gym_id
    JOIN students s ON s.id = cr.student_id
    WHERE cr.status = 'active'
      AND COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          + g.dunning_grace_days < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM renewal_invoices ri JOIN invoices i ON i.id = ri.invoice_id
        WHERE ri.product_type = 'class_registration' AND ri.product_id = cr.id
          AND ri.period_start = COALESCE(cr.paid_until, COALESCE(cr.start_date, cr.requested_at::date) + 30)
          AND i.status = 'paid'
      )
      AND (p_gym_id IS NULL OR cr.gym_id = p_gym_id)
  LOOP
    -- B2 contract: the promote helper expects the caller to hold the class lock.
    PERFORM 1 FROM classes WHERE id = r.class_id FOR UPDATE;
    UPDATE class_registrations SET status = 'suspended', waitlist_position = NULL, updated_at = now()
    WHERE id = r.id;
    UPDATE class_enrollments SET is_active = false
    WHERE class_id = r.class_id AND student_id = r.student_id;
    -- The seat is free — B2's waitlist machinery decides what happens next.
    -- A promotion's first invoice covers a month from TODAY: anchor it so the
    -- next tick doesn't instantly re-bill/suspend the promoted member.
    DECLARE v_promoted UUID;
    BEGIN
      v_promoted := _promote_next_waitlisted(r.class_id);
      IF v_promoted IS NOT NULL THEN
        UPDATE class_registrations
        SET paid_until = CURRENT_DATE + 30, start_date = COALESCE(start_date, CURRENT_DATE)
        WHERE id = v_promoted;
      END IF;
    END;
    v_suspended := v_suspended + 1;
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      VALUES (r.profile_id, r.gid, 'registration_suspended',
              'messages.registration_suspended.title', 'messages.registration_suspended.body',
              '{}'::jsonb, 'class_registration', r.id, '/portal/billing',
              'suspended_' || r.id || '_' || r.anchor)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN jsonb_build_object(
    'unfrozen', v_unfrozen, 'issued', v_issued, 'reminded', v_reminded,
    'lapsed', v_lapsed, 'suspended', v_suspended);
END;
$$;
REVOKE ALL ON FUNCTION run_lifecycle_tick(UUID) FROM PUBLIC;

-- 3. E2E-ONLY seed: an isolated gym with the MEMBERSHIP product DISABLED (class +
--    PT only) for the NO-MEMBERSHIP gating spec. Wraps seed_e2e_gym (runs as the
--    function owner → may call the REVOKEd seed) then flips the flag. Mirrors the
--    reset_ml1_e2e contract: SECURITY DEFINER, REVOKE FROM PUBLIC, GRANT
--    service_role ONLY (server-only key; never anon/authenticated). Test slugs only.
CREATE OR REPLACE FUNCTION seed_e2e_gym_no_membership(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym UUID;
BEGIN
  v_gym := seed_e2e_gym(p_slug, p_password);
  UPDATE gyms
    SET enabled_products = jsonb_build_object('membership', false, 'class', true, 'pt', true, 'camp', true)
    WHERE id = v_gym;
  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym_no_membership(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_e2e_gym_no_membership(TEXT, TEXT) TO service_role;
