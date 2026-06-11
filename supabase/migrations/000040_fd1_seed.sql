-- ============================================================
-- 000040: FD-1 SEED TWEAK — deterministic Today-card data (V1 / FD-1)
-- PRO LINE Gym Platform
--
-- SEED-ONLY: no table, column, policy or RPC change. Wraps the B3 seeder so
-- every e2e run gym carries:
--   · one membership ENDING TODAY (Karim, cheapest plan) → the Expiring card
--     always has a row, and the members-list "expiring" badge/chip is provable;
--   · one open invoice DUE TODAY (Karim, $45 membership, via the canonical
--     _system_issue_invoice) → the Money card "due today" row + the Member-360
--     record-payment modal pre-selection + the "owing" chip are provable.
-- Teardown unchanged (same %+slug@e2e.local pattern owns all run-gym rows).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym')
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'seed_e2e_gym_b3') THEN
    ALTER FUNCTION seed_e2e_gym(TEXT, TEXT) RENAME TO seed_e2e_gym_b3;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION seed_e2e_gym(p_slug TEXT, p_password TEXT DEFAULT 'E2eTestPass!23')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_gym   UUID;
  v_karim UUID;
  v_plan  UUID;
BEGIN
  v_gym := seed_e2e_gym_b3(p_slug, p_password);

  SELECT s.id INTO v_karim
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE s.gym_id = v_gym AND p.first_name_en = 'Karim'
  LIMIT 1;
  IF v_karim IS NULL THEN
    RETURN v_gym; -- defensive: base seed changed shape; skip the tweak
  END IF;

  -- Idempotent: skip if this run gym already carries the FD-1 fixtures.
  IF EXISTS (
    SELECT 1 FROM student_memberships sm
    JOIN students s ON s.id = sm.student_id
    WHERE s.gym_id = v_gym AND sm.end_date = CURRENT_DATE AND sm.status = 'active'
  ) THEN
    RETURN v_gym;
  END IF;

  SELECT id INTO v_plan FROM membership_plans
  WHERE gym_id = v_gym AND is_active = true
  ORDER BY price_usd ASC LIMIT 1;

  IF v_plan IS NOT NULL THEN
    INSERT INTO student_memberships (student_id, plan_id, start_date, end_date, status)
    VALUES (v_karim, v_plan, CURRENT_DATE - 30, CURRENT_DATE, 'active');
  END IF;

  -- Open invoice DUE TODAY via the canonical issuance path (number/TVA/
  -- notification all standard; payer auto-resolve is a no-op for an adult).
  PERFORM _system_issue_invoice(
    v_gym, v_karim, 'membership'::invoice_type_enum,
    45, 0, NULL, NULL, NULL, CURRENT_DATE,
    'FD-1 seed — due today', 'بذرة FD-1 — تستحق اليوم', 'Seed FD-1 — échéance aujourd''hui',
    NULL
  );

  RETURN v_gym;
END;
$$;
REVOKE ALL ON FUNCTION seed_e2e_gym(TEXT, TEXT) FROM PUBLIC;
