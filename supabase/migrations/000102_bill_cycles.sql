-- ============================================================
-- 000102: BILL-CYCLES — registration start dates, staff-controlled billing
--         anchors & session-based first-cycle proration.
--
-- OWNER DECREE (Lebanese model). A class registration bills as a MONTHLY
-- recurring cycle per registration. session_value = monthly_class_price ÷
-- scheduled sessions in that cycle. Staff (owner AND reception) control the
-- cycle: a start date (today / future / past), a billing anchor (defaults to the
-- first scheduled session on/after the start; editable), and an optional
-- prorate-first-cycle toggle. Backdated start bills the CURRENT cycle only — no
-- retroactive invoices. Every LATER cycle renews at the full monthly fee via the
-- EXISTING renewal machinery (`_issue_registration_renewal` + `run_lifecycle_tick`
-- §2b + `_apply_renewal_activation`), which this migration teaches to roll by
-- calendar month when a billing_anchor is present (byte-identical +30-day roll
-- when it is NULL → every pre-existing registration is untouched).
--
-- Design-on-top-of, not around: `_activate_class_registration` gains three
-- defaulted params. When p_start_date IS NULL (waitlist promotion / any
-- un-migrated caller) it reproduces the 000098 body VERBATIM (byte-identical). A
-- provided start engages the anchored/proration model. The pure TS twin
-- (src/lib/billing/proration.ts) powers the live preview; this SQL is the
-- authoritative charge — both implement one spec, e2e asserts the real invoice.
--
-- Also folded in (deferred from PROXY-HOST, per docs/runbooks/custom-domain.md §5):
--   get_gym_primary_domain(slug) anon DEFINER → activates canonical/alias-301 once
--   src/lib/host/primary-domain.ts is wired. Anon allowlist 24 → 25.
--
-- NO prod apply here — the auditor applies migrations. Respects BILL-GUARDS
-- (NULL-fee activation still RAISES; discount guards untouched).
-- ============================================================

-- -----------------------------------------------------------
-- 0. PROXY-HOST fold-in: anon reader of a gym's PRIMARY custom domain.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_gym_primary_domain(p_slug TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.domain
  FROM gym_domains d
  JOIN gyms g ON g.id = d.gym_id
  WHERE g.slug = p_slug AND g.is_active AND d.is_primary
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_gym_primary_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_gym_primary_domain(TEXT) TO anon, authenticated;

-- -----------------------------------------------------------
-- 1. Registration cycle columns (additive; NULL = the legacy 30-day roll).
-- -----------------------------------------------------------
ALTER TABLE class_registrations
  ADD COLUMN IF NOT EXISTS billing_anchor       DATE,
  ADD COLUMN IF NOT EXISTS first_cycle_prorated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN class_registrations.billing_anchor IS
  'BILL-CYCLES: the monthly cycle grid origin (staff-controlled). NULL = pre-BILL-CYCLES registration billed on the legacy 30-day roll.';

-- -----------------------------------------------------------
-- 2. Pure date/session helpers (INVOKER; called only by the DEFINER parents).
--    Mirror src/lib/billing/proration.ts EXACTLY (0=Sun..6=Sat = EXTRACT(DOW)).
-- -----------------------------------------------------------

-- Scheduled sessions in [p_from, p_to_excl): days whose weekday the class meets,
-- intersected with each schedule row's optional valid_from/valid_until window.
CREATE OR REPLACE FUNCTION _class_sessions_in_window(p_class_id UUID, p_from DATE, p_to_excl DATE)
RETURNS INT
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM generate_series(p_from::timestamp, (p_to_excl - 1)::timestamp, interval '1 day') AS g(d)
  WHERE EXISTS (
    SELECT 1 FROM class_schedules cs
    WHERE cs.class_id = p_class_id AND cs.is_active
      AND cs.day_of_week = EXTRACT(DOW FROM g.d)::int
      AND (cs.valid_from  IS NULL OR g.d::date >= cs.valid_from)
      AND (cs.valid_until IS NULL OR g.d::date <= cs.valid_until)
  );
$$;
REVOKE ALL ON FUNCTION _class_sessions_in_window(UUID, DATE, DATE) FROM PUBLIC;

-- The first scheduled session on/after p_from (scans one week); NULL if the class
-- has no active schedule → the anchor falls back to the start date.
CREATE OR REPLACE FUNCTION _class_first_session_on_or_after(p_class_id UUID, p_from DATE)
RETURNS DATE
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT MIN(g.d)::date
  FROM generate_series(p_from::timestamp, (p_from + 6)::timestamp, interval '1 day') AS g(d)
  WHERE EXISTS (
    SELECT 1 FROM class_schedules cs
    WHERE cs.class_id = p_class_id AND cs.is_active
      AND cs.day_of_week = EXTRACT(DOW FROM g.d)::int
      AND (cs.valid_from  IS NULL OR g.d::date >= cs.valid_from)
      AND (cs.valid_until IS NULL OR g.d::date <= cs.valid_until)
  );
$$;
REVOKE ALL ON FUNCTION _class_first_session_on_or_after(UUID, DATE) FROM PUBLIC;

-- The month-stepped cycle window [c_start, c_end) that contains p_on, on the
-- anchor grid. `date + interval '1 month'` clamps day-of-month (Jan 31 → Feb 28/29),
-- matching addMonths() in the TS twin.
CREATE OR REPLACE FUNCTION _reg_cycle_bounds(p_anchor DATE, p_on DATE)
RETURNS TABLE(c_start DATE, c_end DATE)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE k INT := 0;
BEGIN
  IF p_on <= p_anchor THEN
    c_start := p_anchor;
    c_end   := (p_anchor + INTERVAL '1 month')::date;
    RETURN NEXT; RETURN;
  END IF;
  WHILE (p_anchor + make_interval(months => k + 1))::date <= p_on LOOP
    k := k + 1;
  END LOOP;
  c_start := (p_anchor + make_interval(months => k))::date;
  c_end   := (p_anchor + make_interval(months => k + 1))::date;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION _reg_cycle_bounds(DATE, DATE) FROM PUBLIC;

-- -----------------------------------------------------------
-- 3. _activate_class_registration — the single billing door, now cycle-aware.
--    p_start_date NULL → the 000098 body reproduced verbatim (byte-identical);
--    p_start_date set → anchored/proration model. DROP+CREATE: the arg list grows,
--    so replace (defaults keep the 4-arg waitlist-promotion caller resolving).
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT);
CREATE FUNCTION _activate_class_registration(
  p_reg_id UUID, p_discount_pct NUMERIC, p_discount_amount_usd NUMERIC, p_notify_type TEXT,
  p_start_date DATE DEFAULT NULL, p_billing_anchor DATE DEFAULT NULL, p_prorate BOOLEAN DEFAULT false
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg     class_registrations;
  v_class   classes;
  v_fee     NUMERIC;
  v_pct     NUMERIC;
  v_amt     NUMERIC;
  v_net     NUMERIC;   -- full monthly net (after discount)
  v_bill    NUMERIC;   -- amount actually invoiced now (prorated or full)
  v_bill_lbp NUMERIC;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_inv     invoices;
  v_inv_id  UUID := NULL;
  -- BILL-CYCLES cycle state
  v_start   DATE;
  v_anchor  DATE := NULL;
  v_cstart  DATE := NULL;
  v_cend    DATE;
  v_paid_until DATE := NULL;
  v_sessions_cycle     INT;
  v_sessions_remaining INT;
  v_billfrom DATE;
  v_bills_now BOOLEAN := true;
  v_prorated  BOOLEAN := false;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  SELECT * INTO v_class FROM classes WHERE id = v_reg.class_id;

  -- BILL-GUARDS R2(i): the resolved fee must be SET (unchanged).
  v_fee := COALESCE(v_reg.monthly_fee_usd, v_class.monthly_fee_usd);
  IF v_fee IS NULL THEN
    RAISE EXCEPTION 'This class has no fee set. Set a monthly fee or mark the class free before registering.';
  END IF;
  -- BILL-GUARDS R2(ii): reject a discount that exceeds the fee (unchanged).
  IF COALESCE(p_discount_pct, 0) < 0 OR COALESCE(p_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'The discount percentage must be between 0 and 100.';
  END IF;
  IF COALESCE(p_discount_amount_usd, 0) < 0 OR COALESCE(p_discount_amount_usd, 0) > v_fee THEN
    RAISE EXCEPTION 'The discount is larger than the class fee.';
  END IF;
  v_pct := LEAST(GREATEST(COALESCE(p_discount_pct, 0), 0), 100);
  v_amt := GREATEST(COALESCE(p_discount_amount_usd, 0), 0);
  v_net := v_fee * (1 - v_pct / 100.0) - v_amt;
  IF v_net < 0 THEN v_net := 0; END IF;

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_reg.gym_id ORDER BY rate_date DESC LIMIT 1;

  IF p_start_date IS NULL THEN
    -- ── LEGACY PATH (waitlist promotion / un-migrated callers): 000098 behavior.
    v_start := CURRENT_DATE;
    v_cend  := (CURRENT_DATE + INTERVAL '1 month')::date;
    v_bill  := v_net;                          -- full month, billed now
  ELSE
    -- ── ANCHORED PATH (BILL-CYCLES) ──
    v_start  := p_start_date;
    v_anchor := COALESCE(p_billing_anchor,
                         _class_first_session_on_or_after(v_reg.class_id, v_start),
                         v_start);
    v_bills_now := (v_start <= CURRENT_DATE);
    -- Current cycle = the grid cycle containing max(start, today): a backdated
    -- start bills the current cycle (never retroactively); a future start bills
    -- its first cycle (deferred to the tick — no invoice issues now).
    SELECT b.c_start, b.c_end INTO v_cstart, v_cend
      FROM _reg_cycle_bounds(v_anchor, GREATEST(v_start, CURRENT_DATE)) b;
    v_billfrom := GREATEST(GREATEST(v_start, CURRENT_DATE), v_cstart);
    v_sessions_cycle     := _class_sessions_in_window(v_reg.class_id, v_cstart, v_cend);
    v_sessions_remaining := _class_sessions_in_window(v_reg.class_id, v_billfrom, v_cend);

    -- Zero remaining → billing begins clean at the NEXT cycle (full), not a $0 invoice.
    IF p_prorate AND v_sessions_cycle > 0 AND v_sessions_remaining = 0 THEN
      v_cstart := v_cend;
      SELECT b.c_end INTO v_cend FROM _reg_cycle_bounds(v_anchor, v_cstart) b;
      v_sessions_cycle     := _class_sessions_in_window(v_reg.class_id, v_cstart, v_cend);
      v_sessions_remaining := v_sessions_cycle;
      v_bills_now := (v_cstart <= CURRENT_DATE);
    END IF;

    IF p_prorate AND v_sessions_cycle > 0 AND v_sessions_remaining < v_sessions_cycle THEN
      v_bill := round((v_net / v_sessions_cycle) * v_sessions_remaining, 2);
      v_prorated := true;
    ELSE
      v_bill := v_net;
    END IF;
    -- Cursor: when we bill the first cycle NOW, the next bill is its end (tick rolls
    -- monthly from there). For a FUTURE start we issue no invoice now → park the
    -- cursor on the first cycle's START so the tick bills that first cycle at the anchor.
    v_paid_until := CASE WHEN v_bills_now THEN v_cend ELSE v_cstart END;
  END IF;

  v_bill_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_bill * v_rate) ELSE COALESCE(v_reg.monthly_fee_lbp, 0) END;

  -- Issue the first invoice only when billing begins now (future start defers to the tick).
  IF v_bills_now AND v_bill > 0.005 THEN
    v_inv := _system_issue_invoice(
      v_reg.gym_id, v_reg.student_id, 'class_registration', v_bill, v_bill_lbp, v_rate, v_rdate, NULL,
      (CURRENT_DATE + 14),
      COALESCE(v_class.name_en, '') || ' — ' || _invoice_month_label(COALESCE(v_cstart, CURRENT_DATE), 'en'),
      COALESCE(v_class.name_ar, '') || ' — ' || _invoice_month_label(COALESCE(v_cstart, CURRENT_DATE), 'ar'),
      COALESCE(v_class.name_fr, '') || ' — ' || _invoice_month_label(COALESCE(v_cstart, CURRENT_DATE), 'fr'));
    v_inv_id := v_inv.id;
  END IF;

  UPDATE class_registrations
  SET status = 'active', waitlist_position = NULL,
      discount_pct = v_pct, discount_amount_usd = v_amt,
      start_date = v_start, end_date = v_cend,
      billing_anchor = v_anchor, first_cycle_prorated = v_prorated,
      paid_until = COALESCE(v_paid_until, paid_until),
      invoice_id = COALESCE(v_inv_id, invoice_id),
      approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_reg_id;

  -- Project the attendance roster (B1 class_enrollments — unchanged flow).
  INSERT INTO class_enrollments (class_id, student_id, is_active)
  VALUES (v_reg.class_id, v_reg.student_id, true)
  ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;

  PERFORM _notify_class_student(
    v_reg.student_id, v_reg.gym_id, p_notify_type,
    jsonb_build_object('class', COALESCE(v_class.name_en, v_class.name_ar), 'fee', COALESCE(v_inv.total_usd, v_bill)), p_reg_id);

  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('class_registrations', p_reg_id, 'update',
          jsonb_build_object('action', p_notify_type, 'net_usd', v_bill, 'invoice', v_inv_id,
                             'anchor', v_anchor, 'prorated', v_prorated), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT, DATE, DATE, BOOLEAN) FROM PUBLIC;

-- -----------------------------------------------------------
-- 4. approve_class_registration — pass the staff cycle choices through to activate.
--    DROP+CREATE (arg list grows); defaults keep the 3-arg callers resolving to the
--    LEGACY activate path (start=NULL → byte-identical to today).
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS approve_class_registration(UUID, NUMERIC, NUMERIC);
CREATE FUNCTION approve_class_registration(
  p_reg_id UUID, p_discount_pct NUMERIC DEFAULT 0, p_discount_amount_usd NUMERIC DEFAULT 0,
  p_start_date DATE DEFAULT NULL, p_billing_anchor DATE DEFAULT NULL, p_prorate BOOLEAN DEFAULT false
) RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg    class_registrations;
  v_class  classes;
  v_active INT;
  v_pos    INT;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Registration % not found', p_reg_id; END IF;
  IF NOT (is_staff() AND v_reg.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_reg.status <> 'requested' THEN RAISE EXCEPTION 'Only a requested registration can be approved (is %)', v_reg.status; END IF;

  -- E2: lock the class row so concurrent approvals serialize; count under the lock.
  SELECT * INTO v_class FROM classes WHERE id = v_reg.class_id FOR UPDATE;
  SELECT count(*) INTO v_active FROM class_registrations WHERE class_id = v_reg.class_id AND status = 'active';

  IF v_active < v_class.max_capacity THEN
    PERFORM _activate_class_registration(p_reg_id, p_discount_pct, p_discount_amount_usd, 'class_approved',
                                         p_start_date, p_billing_anchor, p_prorate);
  ELSE
    -- E4/E5: full → waitlist (position appended), NO invoice. Carry the discount
    -- for when this registration is later promoted.
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_pos
    FROM class_registrations WHERE class_id = v_reg.class_id AND status = 'waitlisted';
    UPDATE class_registrations
    SET status = 'waitlisted', waitlist_position = v_pos,
        discount_pct = LEAST(GREATEST(COALESCE(p_discount_pct, 0), 0), 100),
        discount_amount_usd = GREATEST(COALESCE(p_discount_amount_usd, 0), 0),
        approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = p_reg_id;
    PERFORM _notify_class_student(
      v_reg.student_id, v_reg.gym_id, 'class_waitlisted',
      jsonb_build_object('class', COALESCE(v_class.name_en, v_class.name_ar), 'position', v_pos), p_reg_id);
  END IF;

  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id;
  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION approve_class_registration(UUID, NUMERIC, NUMERIC, DATE, DATE, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_class_registration(UUID, NUMERIC, NUMERIC, DATE, DATE, BOOLEAN) TO authenticated, service_role;

-- -----------------------------------------------------------
-- 5. set_registration_anchor — staff (owner + reception) move the cycle FORWARD.
--    Audited via an explicit audit_logs row (the established idiom for this table:
--    _activate_class_registration writes its own audit row too).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_registration_anchor(p_reg_id UUID, p_new_anchor DATE)
RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg class_registrations;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Registration % not found', p_reg_id; END IF;
  IF NOT (is_staff() AND v_reg.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_reg.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Only an active registration''s billing cycle can be edited (is %)', v_reg.status;
  END IF;
  IF p_new_anchor IS NULL THEN RAISE EXCEPTION 'A billing anchor date is required'; END IF;
  -- Forward-only: never move the anchor earlier (would retroactively re-bill).
  IF p_new_anchor < COALESCE(v_reg.billing_anchor, v_reg.start_date, CURRENT_DATE) THEN
    RAISE EXCEPTION 'The billing anchor can only be moved forward.';
  END IF;

  UPDATE class_registrations
  SET billing_anchor = p_new_anchor,
      -- push the next-bill cursor out to the new anchor (the member isn't billed until then)
      paid_until = GREATEST(COALESCE(paid_until, CURRENT_DATE), p_new_anchor),
      end_date   = (p_new_anchor + INTERVAL '1 month')::date,
      updated_at = now()
  WHERE id = p_reg_id
  RETURNING * INTO v_reg;

  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('class_registrations', p_reg_id, 'update',
          jsonb_build_object('action', 'anchor_moved', 'billing_anchor', p_new_anchor), auth.uid());
  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION set_registration_anchor(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_registration_anchor(UUID, DATE) TO authenticated, service_role;

-- -----------------------------------------------------------
-- 6. _issue_registration_renewal — roll by CALENDAR MONTH on the anchor grid when
--    billing_anchor is set; keep the exact +30-day roll when it is NULL (every
--    pre-BILL-CYCLES registration is byte-identical). Based verbatim on the current
--    body (000090) with ONLY the v_end line made anchor-aware.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _issue_registration_renewal(p_reg_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r     class_registrations;
  v_s     students;
  v_cls   classes;
  v_net   NUMERIC;
  v_start DATE;
  v_end   DATE;
  v_inv   invoices;
  v_rate  NUMERIC;
  v_rdate DATE;
  v_lbp   NUMERIC;
BEGIN
  SELECT * INTO v_r FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_r.id IS NULL OR v_r.status NOT IN ('active', 'suspended') THEN RETURN NULL; END IF;
  SELECT * INTO v_s FROM students WHERE id = v_r.student_id;
  SELECT * INTO v_cls FROM classes WHERE id = v_r.class_id;

  v_start := COALESCE(v_r.paid_until, COALESCE(v_r.start_date, v_r.requested_at::date) + 30);
  -- BILL-CYCLES: anchored registrations roll a calendar month (stays on the grid);
  -- legacy registrations keep the flat 30-day cycle.
  v_end   := CASE WHEN v_r.billing_anchor IS NOT NULL
                  THEN (v_start + INTERVAL '1 month')::date
                  ELSE v_start + 30 END;
  IF EXISTS (SELECT 1 FROM renewal_invoices
             WHERE product_type = 'class_registration' AND product_id = v_r.id AND period_start = v_start) THEN
    RETURN NULL;
  END IF;

  -- The B2 net-fee discipline (same formula approve used: % then fixed, floor 0).
  v_net := GREATEST(0, round(COALESCE(v_r.monthly_fee_usd, v_cls.monthly_fee_usd, 0)
                             * (1 - COALESCE(v_r.discount_pct, 0) / 100), 2)
                       - COALESCE(v_r.discount_amount_usd, 0));
  IF v_net <= 0.005 THEN RETURN NULL; END IF; -- fully discounted: nothing to bill

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates WHERE gym_id = v_s.gym_id ORDER BY rate_date DESC LIMIT 1;
  v_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE 0 END;
  v_inv := _system_issue_invoice(
    v_s.gym_id, v_r.student_id, 'class_registration', v_net, v_lbp, v_rate, v_rdate,
    NULL, v_start,
    COALESCE(v_cls.name_en, '') || ' — ' || _invoice_month_label(v_start, 'en'),
    COALESCE(v_cls.name_ar, '') || ' — ' || _invoice_month_label(v_start, 'ar'),
    COALESCE(v_cls.name_fr, '') || ' — ' || _invoice_month_label(v_start, 'fr'),
    NULL);

  INSERT INTO renewal_invoices (invoice_id, product_type, product_id, period_start, period_end)
  VALUES (v_inv.id, 'class_registration', v_r.id, v_start, v_end);

  BEGIN
    INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
    VALUES (v_s.profile_id, v_s.gym_id, 'renewal_due',
            'messages.renewal_due.title', 'messages.renewal_due.body',
            jsonb_build_object('amount', v_inv.total_usd, 'date', v_start),
            'invoice', v_inv.id, '/portal/billing',
            'renewal_registration_' || v_r.id || '_' || v_start)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_inv.id;
END;
$$;
REVOKE ALL ON FUNCTION _issue_registration_renewal(UUID) FROM PUBLIC;
