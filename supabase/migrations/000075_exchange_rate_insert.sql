-- ============================================================
-- 000075: SETTINGS-LIVE — staff-gated exchange-rate insert RPC
-- PRO LINE Gym Platform
--
-- WHY. The Settings → Exchange Rates "Add rate" form was an inert stub and NO
-- rate-insert path existed in the app. exchange_rates is a GLOBAL table (no
-- gym_id; UNIQUE(rate_date, source)) — per the auditor's instruction we do NOT
-- add table policies; writes go through this SECURITY DEFINER RPC gated on
-- is_staff().
--
-- RLS NOTE (gyms — the other half of SETTINGS-LIVE): NO gyms policy change is
-- needed. 000004's `gyms_staff_own ON gyms FOR ALL USING (id = get_user_gym_id()
-- AND is_staff())` already permits staff to UPDATE their OWN gym row (FOR ALL
-- covers UPDATE; the absent WITH CHECK defaults to USING, so the row cannot be
-- re-pointed at another gym). The pre-approved owner-only-update policy is
-- therefore unnecessary — the saveGymSettings server action rides caller RLS.
--
-- Semantics: UPSERT on (rate_date, source) — re-submitting the same day+source
-- CORRECTS that day's rate (a legit front-desk workflow) instead of erroring on
-- the unique constraint. entered_by is stamped from auth.uid(). The existing
-- validation trigger (000005 trg_validate_exchange_rate) still fires.
--
-- ADDITIVE + idempotent (CREATE OR REPLACE); replay-clean from zero.
-- ============================================================

CREATE OR REPLACE FUNCTION insert_exchange_rate(
  p_rate      NUMERIC,
  p_rate_date DATE DEFAULT CURRENT_DATE,
  p_source    TEXT DEFAULT 'manual',
  p_notes     TEXT DEFAULT NULL
)
RETURNS exchange_rates
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row exchange_rates;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may record an exchange rate';
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Rate must be a positive number';
  END IF;

  INSERT INTO exchange_rates (rate, rate_date, source, entered_by, notes)
  VALUES (
    p_rate,
    COALESCE(p_rate_date, CURRENT_DATE),
    COALESCE(NULLIF(trim(p_source), ''), 'manual'),
    auth.uid(),
    p_notes
  )
  ON CONFLICT (rate_date, source) DO UPDATE
    SET rate = EXCLUDED.rate, entered_by = EXCLUDED.entered_by, notes = EXCLUDED.notes
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION insert_exchange_rate(NUMERIC, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_exchange_rate(NUMERIC, DATE, TEXT, TEXT) TO authenticated;
