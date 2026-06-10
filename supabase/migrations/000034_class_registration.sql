-- ============================================================
-- 000034: RECURRING-CLASS REGISTRATION (V1 / B2) — request → approve → bill →
--         roster + capacity/waitlist auto-promote
-- PRO LINE Gym Platform
--
-- The group-class analog of PT acquisition. A member requests a recurring class
-- for a monthly fee; staff approve (+discount); a free spot → active + the FIRST
-- monthly invoice (D1 issue_invoice) + a projected attendance enrollment (B1
-- class_enrollments, unchanged) + class_approved; a full class → waitlisted (no
-- invoice) + class_waitlisted. Free cancel of an active registration atomically
-- promotes the lowest-position waitlisted → active + invoice + enrollment +
-- waitlist_promoted. Billing fires ONLY on the active transition.
--
-- Atomicity: approve/cancel lock the class row FOR UPDATE and count active
-- registrations under that lock, so capacity is never exceeded (E2) and the
-- cancel→promote can't double-promote (E3); status ↔ enrollment ↔ invoice are
-- mutated in one transaction (E12).
--
-- issue_invoice reuse: D1's issue_invoice gates on is_staff(). A member may
-- free-cancel their own active registration, which must invoice the PROMOTED
-- member — a system action where the caller is NOT staff. So issue_invoice is
-- refactored to delegate to a guard-free internal `_system_issue_invoice`
-- (same insert + triggers + invoice_issued); issue_invoice keeps its public
-- is_staff/gym guard and delegates. The B2 activation path calls the internal
-- directly (only reachable from the gated B2 RPCs). billing.spec re-runs in CI
-- and re-proves issue_invoice's public contract.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Class monthly pricing (dual-currency; weekly tier is V1.1)
-- -----------------------------------------------------------
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS monthly_fee_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monthly_fee_lbp NUMERIC(15,2);

-- -----------------------------------------------------------
-- 2. class_registrations — the billable monthly subscription + status machine
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  status              class_registration_status_enum NOT NULL DEFAULT 'requested',
  waitlist_position   INTEGER,
  monthly_fee_usd     NUMERIC(12,2),
  monthly_fee_lbp     NUMERIC(15,2),
  discount_pct        NUMERIC(5,2),
  discount_amount_usd NUMERIC(12,2),
  start_date          DATE,
  end_date            DATE,
  invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  rejected_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- E1: at most ONE open registration per (class, student).
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_reg_open
  ON class_registrations (class_id, student_id)
  WHERE status IN ('requested', 'active', 'waitlisted');
CREATE INDEX IF NOT EXISTS idx_class_reg_class_status ON class_registrations (class_id, status);
CREATE INDEX IF NOT EXISTS idx_class_reg_student ON class_registrations (student_id);

ALTER TABLE class_registrations ENABLE ROW LEVEL SECURITY;

-- Member sees own; parent sees children's; staff manage in-gym. (Writes go
-- through the SECURITY DEFINER RPCs below, which do their own authz.)
DROP POLICY IF EXISTS class_reg_member_select ON class_registrations;
CREATE POLICY class_reg_member_select ON class_registrations FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS class_reg_parent_select ON class_registrations;
CREATE POLICY class_reg_parent_select ON class_registrations FOR SELECT
  USING (
    get_user_role() = 'parent' AND student_id IN (
      SELECT gs.student_id FROM guardian_students gs
      JOIN guardians g ON g.id = gs.guardian_id
      WHERE g.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS class_reg_staff_all ON class_registrations;
CREATE POLICY class_reg_staff_all ON class_registrations FOR ALL
  USING (gym_id = get_user_gym_id() AND is_staff())
  WITH CHECK (gym_id = get_user_gym_id() AND is_staff());

-- -----------------------------------------------------------
-- 3. issue_invoice → delegate to a guard-free internal (system issuance)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _system_issue_invoice(
  p_gym_id        UUID,
  p_student_id    UUID,
  p_invoice_type  invoice_type_enum,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_rate_date     DATE DEFAULT NULL,
  p_membership_id UUID DEFAULT NULL,
  p_due_date      DATE DEFAULT NULL,
  p_notes_en      TEXT DEFAULT NULL,
  p_notes_ar      TEXT DEFAULT NULL,
  p_notes_fr      TEXT DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invoices;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND gym_id = p_gym_id) THEN
    RAISE EXCEPTION 'Student % not found in this gym', p_student_id;
  END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;

  INSERT INTO invoices (
    gym_id, student_id, membership_id, invoice_type, invoice_number,
    amount_usd, amount_lbp, exchange_rate, rate_date, total_usd,
    status, due_date, notes_en, notes_ar, notes_fr
  )
  VALUES (
    p_gym_id, p_student_id, p_membership_id, p_invoice_type, '',
    p_amount_usd, COALESCE(p_amount_lbp, 0), p_exchange_rate, p_rate_date, p_amount_usd,
    'pending', COALESCE(p_due_date, CURRENT_DATE + 14), p_notes_en, p_notes_ar, p_notes_fr
  )
  RETURNING * INTO v_inv;

  PERFORM _notify_student_billing(
    p_student_id, p_gym_id, 'invoice_issued',
    jsonb_build_object('invoice', v_inv.invoice_number, 'amount', v_inv.total_usd), v_inv.id);

  RETURN v_inv;
END;
$$;
REVOKE ALL ON FUNCTION _system_issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;

-- Public issuance path: keep the staff/gym guard, then delegate (D1 contract).
CREATE OR REPLACE FUNCTION issue_invoice(
  p_gym_id        UUID,
  p_student_id    UUID,
  p_invoice_type  invoice_type_enum,
  p_amount_usd    NUMERIC,
  p_amount_lbp    NUMERIC DEFAULT 0,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_rate_date     DATE DEFAULT NULL,
  p_membership_id UUID DEFAULT NULL,
  p_due_date      DATE DEFAULT NULL,
  p_notes_en      TEXT DEFAULT NULL,
  p_notes_ar      TEXT DEFAULT NULL,
  p_notes_fr      TEXT DEFAULT NULL
) RETURNS invoices
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may issue invoices'; END IF;
  IF p_gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Cross-gym invoice not allowed'; END IF;
  RETURN _system_issue_invoice(
    p_gym_id, p_student_id, p_invoice_type, p_amount_usd, p_amount_lbp,
    p_exchange_rate, p_rate_date, p_membership_id, p_due_date, p_notes_en, p_notes_ar, p_notes_fr);
END;
$$;
GRANT EXECUTE ON FUNCTION issue_invoice(UUID, UUID, invoice_type_enum, NUMERIC, NUMERIC, NUMERIC, DATE, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 4. _notify_class_student — per-recipient best-effort (member + guardians)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION _notify_class_student(
  p_student_id UUID, p_gym_id UUID, p_type TEXT, p_params JSONB, p_reg_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec UUID;
BEGIN
  FOR v_rec IN
    SELECT s.profile_id FROM students s WHERE s.id = p_student_id AND s.profile_id IS NOT NULL
    UNION
    SELECT g.profile_id FROM guardian_students gs JOIN guardians g ON g.id = gs.guardian_id
    WHERE gs.student_id = p_student_id AND g.profile_id IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
      VALUES (v_rec, p_gym_id, p_type, 'messages.' || p_type || '.title', 'messages.' || p_type || '.body',
              p_params, 'class_registration', p_reg_id, '/portal/classes');
    EXCEPTION WHEN OTHERS THEN NULL; -- best-effort; never blocks the state change
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION _notify_class_student(UUID, UUID, TEXT, JSONB, UUID) FROM PUBLIC;

-- -----------------------------------------------------------
-- 5. _activate_class_registration — the single active-transition (approve-free
--    AND waitlist-promote share it): status→active + first invoice (if net>0) +
--    enrollment projection + member notification. Caller holds the class lock.
-- -----------------------------------------------------------
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
    jsonb_build_object('class', COALESCE(v_class.name_en, v_class.name_ar), 'fee', v_net), p_reg_id);

  INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
  VALUES ('class_registrations', p_reg_id, 'update',
          jsonb_build_object('action', p_notify_type, 'net_usd', v_net, 'invoice', v_inv_id), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION _activate_class_registration(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;

-- _recompact_waitlist — renumber remaining waitlisted to 1..n (close gaps).
CREATE OR REPLACE FUNCTION _recompact_waitlist(p_class_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, requested_at ASC) AS rn
    FROM class_registrations WHERE class_id = p_class_id AND status = 'waitlisted'
  )
  UPDATE class_registrations cr SET waitlist_position = o.rn, updated_at = now()
  FROM ordered o WHERE cr.id = o.id AND cr.waitlist_position IS DISTINCT FROM o.rn;
END;
$$;
REVOKE ALL ON FUNCTION _recompact_waitlist(UUID) FROM PUBLIC;

-- _promote_next_waitlisted — activate the lowest-position waitlisted (E3).
-- Caller holds the class lock.
CREATE OR REPLACE FUNCTION _promote_next_waitlisted(p_class_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_pct NUMERIC; v_amt NUMERIC;
BEGIN
  SELECT id, discount_pct, discount_amount_usd INTO v_id, v_pct, v_amt
  FROM class_registrations
  WHERE class_id = p_class_id AND status = 'waitlisted'
  ORDER BY waitlist_position ASC NULLS LAST, requested_at ASC
  LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  PERFORM _activate_class_registration(v_id, v_pct, v_amt, 'waitlist_promoted');
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION _promote_next_waitlisted(UUID) FROM PUBLIC;

-- -----------------------------------------------------------
-- 6. request_class_registration — member self-request OR staff walk-in
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION request_class_registration(
  p_class_id UUID, p_student_id UUID DEFAULT NULL
) RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student students;
  v_class   classes;
  v_reg     class_registrations;
  v_name    TEXT;
  v_dob     DATE;
  v_age     INT;
BEGIN
  IF p_student_id IS NULL THEN
    SELECT * INTO v_student FROM students WHERE profile_id = auth.uid() LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Only a member may request a class'; END IF;
  ELSE
    IF NOT is_staff() THEN RAISE EXCEPTION 'Only staff may register another member'; END IF;
    SELECT * INTO v_student FROM students WHERE id = p_student_id;
    IF v_student.id IS NULL THEN RAISE EXCEPTION 'Student % not found', p_student_id; END IF;
    IF v_student.gym_id <> get_user_gym_id() THEN RAISE EXCEPTION 'Member is not in your gym'; END IF;
  END IF;

  SELECT * INTO v_class FROM classes WHERE id = p_class_id;
  IF v_class.id IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF NOT v_class.is_active THEN RAISE EXCEPTION 'Class is not active'; END IF;           -- E9
  IF v_class.gym_id <> v_student.gym_id THEN RAISE EXCEPTION 'Class and member are in different gyms'; END IF;

  -- E9 eligibility: belt requirement (belt_rank_enum is ordered white→black).
  IF v_class.belt_requirement IS NOT NULL AND v_student.current_belt_rank < v_class.belt_requirement THEN
    RAISE EXCEPTION 'Member does not meet the belt requirement for this class';
  END IF;
  SELECT date_of_birth INTO v_dob FROM profiles WHERE id = v_student.profile_id;
  IF v_dob IS NOT NULL THEN
    v_age := date_part('year', age(v_dob));
    IF v_class.min_age IS NOT NULL AND v_age < v_class.min_age THEN RAISE EXCEPTION 'Member is below the minimum age for this class'; END IF;
    IF v_class.max_age IS NOT NULL AND v_age > v_class.max_age THEN RAISE EXCEPTION 'Member is above the maximum age for this class'; END IF;
  END IF;

  -- E1: one open registration per (class, student).
  IF EXISTS (SELECT 1 FROM class_registrations
             WHERE class_id = p_class_id AND student_id = v_student.id
               AND status IN ('requested', 'active', 'waitlisted')) THEN
    RAISE EXCEPTION 'There is already an open registration for this class';
  END IF;

  INSERT INTO class_registrations (class_id, student_id, gym_id, status, monthly_fee_usd, monthly_fee_lbp, requested_at)
  VALUES (p_class_id, v_student.id, v_class.gym_id, 'requested', v_class.monthly_fee_usd, v_class.monthly_fee_lbp, now())
  RETURNING * INTO v_reg;

  -- class_requested → staff (owner + receptionist), in-RPC definer emit.
  SELECT COALESCE(p.first_name_en, p.first_name_ar, '') INTO v_name FROM profiles p WHERE p.id = v_student.profile_id;
  INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url)
  SELECT ur.user_id, v_class.gym_id, 'class_requested', 'messages.class_requested.title', 'messages.class_requested.body',
         jsonb_build_object('studentName', v_name, 'class', COALESCE(v_class.name_en, v_class.name_ar)),
         'class_registration', v_reg.id, '/classes/' || p_class_id
  FROM user_roles ur WHERE ur.gym_id = v_class.gym_id AND ur.role IN ('owner', 'receptionist');

  RETURN v_reg;
END;
$$;
GRANT EXECUTE ON FUNCTION request_class_registration(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------
-- 7. approve_class_registration — atomic capacity check → active OR waitlisted
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_class_registration(
  p_reg_id UUID, p_discount_pct NUMERIC DEFAULT 0, p_discount_amount_usd NUMERIC DEFAULT 0
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
    PERFORM _activate_class_registration(p_reg_id, p_discount_pct, p_discount_amount_usd, 'class_approved');
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
GRANT EXECUTE ON FUNCTION approve_class_registration(UUID, NUMERIC, NUMERIC) TO authenticated;

-- -----------------------------------------------------------
-- 8. reject_class_registration — staff, reference reason
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_class_registration(p_reg_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg class_registrations;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Registration % not found', p_reg_id; END IF;
  IF NOT (is_staff() AND v_reg.gym_id = get_user_gym_id()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_reg.status NOT IN ('requested', 'waitlisted') THEN RAISE EXCEPTION 'Cannot reject a % registration', v_reg.status; END IF;
  UPDATE class_registrations
  SET status = 'rejected', waitlist_position = NULL, rejected_reason = p_reason,
      approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_reg_id RETURNING * INTO v_reg;
  PERFORM _recompact_waitlist(v_reg.class_id);
  RETURN v_reg;
END;
$$;
GRANT EXECUTE ON FUNCTION reject_class_registration(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------
-- 9. cancel_class_registration — free cancel (member/staff) → atomic auto-promote
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_class_registration(p_reg_id UUID)
RETURNS class_registrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg      class_registrations;
  v_is_owner BOOLEAN;
  v_was_active BOOLEAN;
BEGIN
  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id FOR UPDATE;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Registration % not found', p_reg_id; END IF;

  v_is_owner := EXISTS (SELECT 1 FROM students s WHERE s.id = v_reg.student_id AND s.profile_id = auth.uid());
  IF NOT (v_is_owner OR (is_staff() AND v_reg.gym_id = get_user_gym_id())) THEN
    RAISE EXCEPTION 'Not authorized to cancel this registration';
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

  SELECT * INTO v_reg FROM class_registrations WHERE id = p_reg_id;
  RETURN v_reg;
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_class_registration(UUID) TO authenticated;
