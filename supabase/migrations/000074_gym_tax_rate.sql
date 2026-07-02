-- ============================================================
-- 000074: GO-LIVE-GUARDS — per-gym TVA rate (owner decided: configured prices are
-- FINAL / tax-inclusive → Proline gets rate 0; set by the auditor on prod post-VF)
-- PRO LINE Gym Platform / "Gym 360 Pro" (Cycle 6 / GO-LIVE-GUARDS #3)
--
-- Today every invoice gets a hardcoded 11% TVA via the invoices.tax_rate COLUMN
-- DEFAULT (000003) + the calculate_invoice_totals BEFORE-INSERT trigger (000005):
-- total = amount × (1 + tax_rate/100). Make the rate PER-GYM:
--   1. gyms.tax_rate NUMERIC(5,2) NOT NULL DEFAULT 11.00 — the default preserves
--      current demo/e2e behavior ($55.50 / $144.30 asserts unchanged). NO gym's
--      rate is changed here (the auditor sets Proline = 0 on prod post-VF).
--   2. invoices.tax_rate: DROP the hardcoded column default → an issuance that
--      doesn't set it inserts NULL...
--   3. ...and calculate_invoice_totals resolves NULL from the GYM's rate. This is
--      the SINGLE point every insertion path funnels through — _system_issue_invoice
--      (issue_invoice / class-activation / camps / PT-sale / renewals) AND the
--      lead-convert direct INSERT (000024) — so stamping here covers them all with
--      ONE function rewrite instead of many (each CREATE OR REPLACE is a
--      rewrite-reverts-later-amendments risk; see the 000065 incident).
--   4. _activate_class_registration's approval notify showed the PRE-TVA net
--      (000034: 'fee', v_net); it now shows the tax-inclusive invoice total.
--
-- REWRITE BASES (the current-live-body rule): calculate_invoice_totals ← 000005
-- (sole definer) verbatim + the NULL→gym block; _activate_class_registration ←
-- 000034 (sole definer) verbatim + the notify-total line. Diff-verified.
-- ============================================================

-- 1. Per-gym rate; default 11 = today's behavior for every existing gym.
ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 11.00;

-- 2. The invoice row's rate is no longer a hardcoded default — NULL means
--    "resolve from the gym at insert" (step 3). Explicit values still win.
ALTER TABLE invoices ALTER COLUMN tax_rate DROP DEFAULT;

-- 3. calculate_invoice_totals — 000005 body + the NULL→gym resolution. SECURITY
--    DEFINER so the gyms read never depends on the inserting role's RLS (every
--    business path is a definer RPC already; this covers any direct insert too).
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- GO-LIVE-GUARDS: no explicit rate on the row → the GYM's configured rate
  -- (Proline: 0 = configured prices are final; default 11 = legacy behavior).
  IF NEW.tax_rate IS NULL THEN
    SELECT g.tax_rate INTO NEW.tax_rate FROM gyms g WHERE g.id = NEW.gym_id;
    NEW.tax_rate := COALESCE(NEW.tax_rate, 11.00);
  END IF;
  NEW.tax_amount_usd := ROUND(NEW.amount_usd * NEW.tax_rate / 100, 2);
  NEW.total_usd := NEW.amount_usd + NEW.tax_amount_usd;
  IF NEW.exchange_rate IS NOT NULL AND NEW.exchange_rate > 0 THEN
    NEW.total_lbp := ROUND(NEW.total_usd * NEW.exchange_rate, 2);
  END IF;
  RETURN NEW;
END;
$$;
-- (trg_calculate_invoice_totals itself is unchanged — BEFORE INSERT OR UPDATE OF
--  amount_usd, tax_rate, exchange_rate — it now executes the new body.)

-- 4. _activate_class_registration — FULL 000034 body; the ONLY change is the
--    notify payload: 'fee' = the tax-inclusive invoice total when an invoice was
--    issued (v_inv.total_usd), else the net (free/fully-discounted → no invoice).
CREATE OR REPLACE FUNCTION _activate_class_registration(
  p_reg_id UUID, p_discount_pct NUMERIC, p_discount_amount_usd NUMERIC, p_notify_type TEXT
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
  v_net     NUMERIC;
  v_net_lbp NUMERIC;
  v_rate    NUMERIC;
  v_rdate   DATE;
  v_inv     invoices;
  v_inv_id  UUID := NULL;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  SELECT * INTO v_class FROM classes WHERE id = v_reg.class_id;

  v_fee := COALESCE(v_reg.monthly_fee_usd, v_class.monthly_fee_usd, 0);
  v_pct := LEAST(GREATEST(COALESCE(p_discount_pct, 0), 0), 100);     -- E6: % in [0,100]
  v_amt := GREATEST(COALESCE(p_discount_amount_usd, 0), 0);          -- E6: floor 0
  v_net := v_fee * (1 - v_pct / 100.0) - v_amt;
  IF v_net < 0 THEN v_net := 0; END IF;                              -- E6: never below 0

  SELECT rate, rate_date INTO v_rate, v_rdate FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;
  v_net_lbp := CASE WHEN v_rate IS NOT NULL THEN round(v_net * v_rate) ELSE COALESCE(v_reg.monthly_fee_lbp, 0) END;

  -- E5: bill on the active transition (skip when fully discounted / free).
  IF v_net > 0.005 THEN
    v_inv := _system_issue_invoice(
      v_reg.gym_id, v_reg.student_id, 'class_registration', v_net, v_net_lbp, v_rate, v_rdate, NULL,
      (CURRENT_DATE + 14),
      'Class: ' || COALESCE(v_class.name_en, ''),
      'حصة: ' || COALESCE(v_class.name_ar, ''),
      'Cours : ' || COALESCE(v_class.name_fr, ''));
    v_inv_id := v_inv.id;
  END IF;

  UPDATE class_registrations
  SET status = 'active', waitlist_position = NULL,
      discount_pct = v_pct, discount_amount_usd = v_amt,
      start_date = CURRENT_DATE, end_date = (CURRENT_DATE + INTERVAL '1 month')::date,
      invoice_id = v_inv_id, approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_reg_id;

  -- Project the attendance roster (B1 class_enrollments — unchanged flow).
  INSERT INTO class_enrollments (class_id, student_id, is_active)
  VALUES (v_reg.class_id, v_reg.student_id, true)
  ON CONFLICT (class_id, student_id) DO UPDATE SET is_active = true;

  PERFORM _notify_class_student(
    v_reg.student_id, v_reg.gym_id, p_notify_type,
    -- GO-LIVE-GUARDS: the approval notify shows what the member OWES — the
    -- tax-inclusive invoice total — not the pre-TVA net.
    jsonb_build_object('class', COALESCE(v_class.name_en, v_class.name_ar), 'fee', COALESCE(v_inv.total_usd, v_net)), p_reg_id);

  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('class_registrations', p_reg_id, 'update',
          jsonb_build_object('action', p_notify_type, 'net_usd', v_net, 'invoice', v_inv_id), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
