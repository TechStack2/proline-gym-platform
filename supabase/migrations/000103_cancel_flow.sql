-- ============================================================
-- 000103: CANCEL-FLOW — clean cancellation & invoice voiding.
--
-- FIELD FINDING 15 (paying tenant): staff who sign a member to the wrong
-- class/service have no clean exit — the auto-generated invoice lingers.
-- INDUSTRY RULE: an invoice is NEVER deleted; it is VOIDED with a reason + audit
-- trail, and invoice numbering stays continuous (voiding is a status change, the
-- row + its number are kept).
--
-- DESIGN ON TOP OF the existing model (BILL-GUARDS 000098 / BILL-CYCLES 000102):
--   · Invoice status is payment_status_enum; a VOID = status 'cancelled' (the sole
--     prod writer of invoices.status='cancelled' is void_invoice) + the NEW
--     voided_at/void_reason/voided_by columns. The VOID stamp keys on voided_at.
--   · Every OUTSTANDING computation already filters status IN (pending,partial,
--     overdue), so a voided invoice drops out of "owed" automatically. The two
--     drawer tallies + revenue views are Σ payments.amount_usd with NO status/sign
--     filter, so a voided invoice's collected money is netted ONLY by a reversing
--     NEGATIVE payment — which record_payment refuses (E8 positive-only), so the
--     refund path INSERTs the negative row directly (nets BOTH per-method tallies).
--
-- R1(b) CODIFY the 7/17 prod ACL remediations (default-priv trap): on prod,
--   ALTER DEFAULT PRIVILEGES grants EXECUTE to anon at CREATE; REVOKE … FROM PUBLIC
--   does NOT remove the named anon grant, so the four 000102 functions stayed
--   anon-executable on prod (invisible to the from-zero posture guard). Idempotent
--   explicit REVOKEs below (no-op on the local replay, load-bearing on prod).
-- R1(c) CONTRACT (now standing): every function this migration creates/recreates
--   ends its grants with an explicit REVOKE … FROM anon (and authenticated for the
--   internal _fns) — REVOKE PUBLIC alone is not sufficient on prod.
--
-- NO new anon function → posture allowlist stays 25. NEEDS PROD APPLY (auditor).
-- ============================================================

-- -----------------------------------------------------------
-- 0. R1(b): codify the 7/17 prod ACL remediations for the BILL-CYCLES functions.
--    Idempotent: REVOKE of a grant not held is a silent no-op (so this is a no-op
--    on the from-zero replay, where the prod default-privilege anon grant never
--    materialized, and load-bearing on prod, where it did).
-- -----------------------------------------------------------
REVOKE ALL ON FUNCTION _activate_class_registration(uuid, numeric, numeric, text, date, date, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION approve_class_registration(uuid, numeric, numeric, date, date, boolean) FROM anon;
REVOKE ALL ON FUNCTION set_registration_anchor(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION _issue_registration_renewal(uuid) FROM anon, authenticated;

-- -----------------------------------------------------------
-- 1. Void support on invoices (additive).
-- -----------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

COMMENT ON COLUMN invoices.voided_at IS
  'CANCEL-FLOW: when the invoice was VOIDED (status=cancelled). NULL on legacy/test cancelled rows; the VOID stamp keys on this being set.';

-- -----------------------------------------------------------
-- 2. _void_invoice — internal, guard-free VOID setter (the sole writer of the
--    voided_* columns). Idempotent. Called by void_invoice + the cancel cascade.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _void_invoice(p_invoice_id UUID, p_reason TEXT, p_by UUID)
RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RETURN NULL; END IF;
  IF v_inv.voided_at IS NOT NULL THEN RETURN v_inv; END IF; -- idempotent
  UPDATE invoices
  SET status = 'cancelled', void_reason = p_reason, voided_by = p_by, voided_at = now(), updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;
  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('invoices', p_invoice_id, 'update', jsonb_build_object('action', 'void_invoice', 'reason', p_reason), p_by);
  RETURN v_inv;
END;
$$;
REVOKE ALL ON FUNCTION _void_invoice(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------
-- 3. _refund_invoice_payments — internal. Records a reversing NEGATIVE payment per
--    payment_method that has NET positive collections, referencing the original
--    invoice, so BOTH per-method drawer tallies (getDailyTally / getCollectionsByMethod)
--    and the payment-summed revenue views net to zero. record_payment can't do this
--    (E8 rejects amount<=0), so we INSERT directly. Idempotent (a method already net
--    to zero is skipped). Returns the reversed USD total.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _refund_invoice_payments(p_invoice_id UUID, p_by UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices; v_reversed NUMERIC := 0;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RETURN 0; END IF;

  WITH per_method AS (
    SELECT p.student_id, p.payment_method,
           SUM(p.amount_usd) AS net_usd, SUM(p.amount_lbp) AS net_lbp
    FROM payments p
    WHERE p.invoice_id = p_invoice_id
    GROUP BY p.student_id, p.payment_method
    HAVING SUM(p.amount_usd) > 0.005
  ), ins AS (
    INSERT INTO payments (invoice_id, student_id, received_by, amount_usd, amount_lbp,
                          payment_method, payment_date, reference_number, notes_en, notes_ar, notes_fr)
    SELECT p_invoice_id, pm.student_id, p_by, -pm.net_usd, -pm.net_lbp,
           pm.payment_method, now(),
           'REFUND ' || COALESCE(v_inv.invoice_number, ''),
           'Refund — invoice voided on cancellation',
           'استرداد — فاتورة ملغاة عند الإلغاء',
           'Remboursement — facture annulée à l''annulation'
    FROM per_method pm
    RETURNING amount_usd
  )
  SELECT COALESCE(-SUM(amount_usd), 0) INTO v_reversed FROM ins;

  RETURN v_reversed;
END;
$$;
REVOKE ALL ON FUNCTION _refund_invoice_payments(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------
-- 4. void_invoice — recreate: stamp the voided_* columns + STRENGTHEN the guard.
--    Old guard blocked only status='paid'; a PARTIAL invoice's collected payments
--    would otherwise linger in the drawer tallies after a void. Now: any standing
--    (net positive) payments block the void — the money must be refunded first.
--    Byte-faithful to 000031 otherwise (staff+gym gate, idempotent, audited).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION void_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices; v_paid NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF NOT (is_staff() AND v_inv.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_inv.voided_at IS NOT NULL OR v_inv.status = 'cancelled' THEN RETURN v_inv; END IF; -- idempotent
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_paid FROM payments WHERE invoice_id = p_invoice_id;
  IF v_inv.status = 'paid' OR v_paid > 0.005 THEN
    RAISE EXCEPTION 'Cannot void an invoice with payments; record a refund first.';
  END IF;
  v_inv := _void_invoice(p_invoice_id, p_reason, auth.uid());
  RETURN v_inv;
END;
$$;
REVOKE ALL ON FUNCTION void_invoice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_invoice(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 5. _cancel_flow_settle_invoice — internal. Per invoice tied to a cancelled
--    registration: unpaid → void; has payments → refund-then-void (staff chose
--    refund) else keep-paid-and-cancel (leave the paid invoice honest).
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _cancel_flow_settle_invoice(p_invoice_id UUID, p_reason TEXT, p_refund BOOLEAN, p_by UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv invoices; v_paid NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL OR v_inv.voided_at IS NOT NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_paid FROM payments WHERE invoice_id = p_invoice_id;
  IF v_paid > 0.005 THEN
    IF p_refund THEN
      PERFORM _refund_invoice_payments(p_invoice_id, p_by); -- reversing payment nets the drawers
      PERFORM _void_invoice(p_invoice_id, p_reason, p_by);
    END IF; -- else keep-paid-and-cancel: the paid invoice stays honest, reg still ends
  ELSE
    PERFORM _void_invoice(p_invoice_id, p_reason, p_by); -- unpaid → void
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _cancel_flow_settle_invoice(UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------
-- 6. cancel_class_registration — recreate (DROP+CREATE, arg list grows). Adds a
--    required reason + a refund fork, and VOIDS every linked invoice on cancel.
--    The base cascade (status='cancelled' → un-enroll → waitlist auto-promote →
--    recompact) is reproduced VERBATIM from 000034 so BILL-GUARDS promotion is
--    intact. Permission TIGHTENED: the void/refund exit is owner/reception (coach
--    NO); the owning member may still self-cancel (portal) but never refund. Setting
--    status='cancelled' already stops the tick's renewal loop (§2b filters 'active').
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS cancel_class_registration(UUID);
CREATE FUNCTION cancel_class_registration(p_reg_id UUID, p_reason TEXT DEFAULT NULL, p_refund BOOLEAN DEFAULT false)
RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg            class_registrations;
  v_is_member_self BOOLEAN;
  v_is_admin       BOOLEAN;
  v_was_active     BOOLEAN;
  v_inv_id         UUID;
  v_reason         TEXT := COALESCE(NULLIF(btrim(p_reason), ''), 'Registration cancelled');
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Registration % not found', p_reg_id; END IF;

  v_is_member_self := EXISTS (SELECT 1 FROM students s WHERE s.id = v_reg.student_id AND s.profile_id = auth.uid());
  v_is_admin := (get_user_role() IN ('owner', 'receptionist')) AND v_reg.gym_id = get_user_gym_id();
  IF NOT (v_is_member_self OR v_is_admin) THEN
    RAISE EXCEPTION 'Not authorized to cancel this registration';
  END IF;
  IF p_refund AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only owner/reception may issue a refund';
  END IF;
  IF v_reg.status NOT IN ('requested', 'active', 'waitlisted') THEN
    RAISE EXCEPTION 'Cannot cancel a % registration', v_reg.status;
  END IF;

  -- E2/E3: lock the class so the freed-spot promotion serializes with approvals.
  PERFORM 1 FROM classes WHERE id = v_reg.class_id FOR UPDATE;

  v_was_active := (v_reg.status = 'active');
  UPDATE class_registrations SET status = 'cancelled', waitlist_position = NULL, updated_at = now() WHERE id = p_reg_id;

  IF v_was_active THEN
    -- Remove the attendance projection; the active registration is the roster source.
    UPDATE class_enrollments SET is_active = false WHERE class_id = v_reg.class_id AND student_id = v_reg.student_id;
    -- E3/E12: atomically promote the lowest-position waitlisted (→ active + invoice + enrollment + notify).
    PERFORM _promote_next_waitlisted(v_reg.class_id);
  END IF;

  PERFORM _recompact_waitlist(v_reg.class_id);

  -- CANCEL-FLOW: settle EVERY invoice tied to this registration — the first-cycle
  -- invoice (class_registrations.invoice_id) + any renewal invoices (renewal_invoices).
  -- Future-start / fully-discounted regs have no invoice → the loop is simply empty.
  FOR v_inv_id IN
    SELECT i.id FROM invoices i WHERE i.id = v_reg.invoice_id
    UNION
    SELECT ri.invoice_id FROM renewal_invoices ri
    WHERE ri.product_type = 'class_registration' AND ri.product_id = v_reg.id
  LOOP
    PERFORM _cancel_flow_settle_invoice(v_inv_id, v_reason, p_refund, auth.uid());
  END LOOP;

  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id;
  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION cancel_class_registration(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_class_registration(UUID, TEXT, BOOLEAN) TO authenticated;
