-- ============================================================
-- BILL-POLICY — billing cycles become a per-gym POLICY, and month-normalization
-- actually normalizes.
--
-- THE FLAW (owner-reported, confirmed in 000102). The anchor defaulted to
--   COALESCE(p_billing_anchor, _class_first_session_on_or_after(class, start), start)
-- i.e. the MEMBER'S OWN START DATE, and renewals roll one calendar month from that
-- anchor. So a member joining the 17th billed 17th → 17th → 17th forever. Worse,
-- for a FRESH registration the anchor IS the start, so the cycle's remaining
-- sessions always equal its total sessions — the proration branch could never fire.
-- Proration was meant to discount the first cycle INTO alignment; the grid origin
-- was never moved to a month boundary, so nothing was ever normalized.
--
-- THE RULING (owner): this is a per-gym POLICY, not one model.
--   · `calendar`     — all cycles run on the month grid, on a gym-chosen cycle day
--                      (default the 1st). A mid-month join prorates a STUB from the
--                      start to the next boundary; every later cycle is boundary →
--                      boundary. This is the alignment the owner intended.
--   · `anniversary`  — each registration's cycle runs from its own start. No
--                      normalization. Exactly today's behavior.
--
-- ⚠ EXISTING GYMS DEFAULT TO `anniversary` = THE BEHAVIOR THEY HAVE TODAY.
-- Proline is a PAYING CUSTOMER with live registrations; no live gym's billing may
-- change because this migration ran. The column DEFAULT is 'anniversary' and this
-- migration performs NO backfill/UPDATE of any existing row, so every existing gym
-- and every existing registration keeps its current anchor and its current cycle.
-- Switching policy later is non-retroactive by construction: anchors are STORED on
-- class_registrations at activation time and nothing here recomputes them.
--
-- DEFAULT-PRIVILEGE TRAP (codified in 000103): on prod, ALTER DEFAULT PRIVILEGES
-- grants EXECUTE to anon at CREATE time, and `REVOKE … FROM PUBLIC` does NOT remove
-- that named grant. Every function created OR RECREATED below therefore ends its
-- grants with an explicit `REVOKE … FROM anon` (plus `authenticated` for the
-- internal `_`-prefixed helpers). NO new anon-executable function is introduced →
-- the definer-anon posture allowlist stays 25.
-- ============================================================

-- -----------------------------------------------------------
-- 1. The policy columns on gyms.
--    cycle_day is capped at 28 ON PURPOSE: every month has a 28th, so the grid is
--    stable and `paid_until + INTERVAL '1 month'` (the renewal roll) lands on the
--    same day-of-month forever. Allowing 29–31 would silently walk the grid
--    backwards after a short month (Jan 31 → Feb 28 → Mar 28 → …), which is
--    exactly the drift this slice exists to remove.
-- -----------------------------------------------------------
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS billing_cycle_policy TEXT     NOT NULL DEFAULT 'anniversary',
  ADD COLUMN IF NOT EXISTS billing_cycle_day    SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gyms_billing_cycle_policy_chk') THEN
    ALTER TABLE gyms ADD CONSTRAINT gyms_billing_cycle_policy_chk
      CHECK (billing_cycle_policy IN ('calendar', 'anniversary'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gyms_billing_cycle_day_chk') THEN
    ALTER TABLE gyms ADD CONSTRAINT gyms_billing_cycle_day_chk
      CHECK (billing_cycle_day BETWEEN 1 AND 28);
  END IF;
END $$;

COMMENT ON COLUMN gyms.billing_cycle_policy IS
  'BILL-POLICY: calendar = every registration bills on the month grid (billing_cycle_day); anniversary = each registration bills from its own start. Default anniversary = pre-BILL-POLICY behavior, so existing gyms are unchanged.';
COMMENT ON COLUMN gyms.billing_cycle_day IS
  'BILL-POLICY: the month-grid boundary day (1..28) used when billing_cycle_policy = calendar. Ignored under anniversary.';

-- -----------------------------------------------------------
-- 2. _calendar_cycle_anchor — the cycle-day boundary ON OR BEFORE p_on.
--    Anchoring at the boundary BEFORE the start is what makes the first cycle a
--    partial stub: the cycle window is [boundary, boundary+1mo) and the member is
--    billed only from their start, so remaining < in-cycle → proration fires and
--    paid_until lands exactly on the next boundary.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _calendar_cycle_anchor(p_on DATE, p_cycle_day INT)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v DATE;
BEGIN
  -- p_cycle_day is constrained to 1..28, so make_date never overflows the month.
  v := make_date(EXTRACT(YEAR FROM p_on)::int, EXTRACT(MONTH FROM p_on)::int,
                 LEAST(GREATEST(COALESCE(p_cycle_day, 1), 1), 28));
  IF v > p_on THEN
    v := (v - INTERVAL '1 month')::date;
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION _calendar_cycle_anchor(DATE, INT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------
-- 3. _default_billing_anchor — the ONE anchor-derivation door, policy-aware.
--    SECURITY DEFINER because it reads `gyms` (staff-scoped under RLS) while
--    running inside the billing path; it returns a DATE only, never gym data.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _default_billing_anchor(p_gym_id UUID, p_class_id UUID, p_start DATE)
RETURNS DATE
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy TEXT;
  v_day    SMALLINT;
BEGIN
  SELECT billing_cycle_policy, billing_cycle_day INTO v_policy, v_day
    FROM gyms WHERE id = p_gym_id;

  IF v_policy = 'calendar' THEN
    RETURN _calendar_cycle_anchor(p_start, COALESCE(v_day, 1)::int);
  END IF;

  -- anniversary (and the NULL/unknown fallback): byte-identical to the pre-
  -- BILL-POLICY expression in 000102.
  RETURN COALESCE(_class_first_session_on_or_after(p_class_id, p_start), p_start);
END;
$$;
REVOKE ALL ON FUNCTION _default_billing_anchor(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------
-- 4. _activate_class_registration — the 000102 body REPRODUCED VERBATIM with a
--    single expression changed (the anchor derivation now goes through
--    _default_billing_anchor). 000102 holds the latest CREATE; 000103 only
--    REVOKEs it. Nothing else in the body is touched, so every other behavior
--    this function carries (legacy NULL-start path, zero-remaining roll, discount
--    discipline, invoice labels, audit) is unchanged by construction.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _activate_class_registration(
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
    -- BILL-POLICY: the anchor is now derived by the GYM'S POLICY. Under
    -- `anniversary` this resolves to exactly the old expression (first session
    -- on/after start, else start); under `calendar` it snaps to the gym's cycle-day
    -- boundary on/before the start, which is what makes the first cycle a STUB and
    -- every later cycle run boundary → boundary. A staff-supplied override still
    -- wins in both policies.
    v_anchor := COALESCE(p_billing_anchor,
                         _default_billing_anchor(v_reg.gym_id, v_reg.class_id, v_start));
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

-- The recreate re-acquires prod default privileges → re-REVOKE explicitly.
REVOKE ALL ON FUNCTION _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT, DATE, DATE, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
