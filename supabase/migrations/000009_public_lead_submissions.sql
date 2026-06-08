-- ============================================================
-- 000009: PUBLIC LEAD SUBMISSIONS
-- Allows anonymous visitors to submit leads from the landing page
-- ============================================================

-- RPC: Submit a lead from the public website (no auth required)
-- Looks up the gym_id from the slug so the form doesn't need it
CREATE OR REPLACE FUNCTION submit_public_lead(
  p_first_name TEXT,
  p_phone TEXT,
  p_source TEXT DEFAULT 'website',
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gym_id UUID;
  v_lead_id UUID;
BEGIN
  -- Get the first active gym (PRO LINE Gym)
  SELECT id INTO v_gym_id FROM gyms WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
  
  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No active gym found';
  END IF;

  INSERT INTO leads (gym_id, first_name, phone, source, notes, status)
  VALUES (v_gym_id, p_first_name, p_phone, p_source, p_notes, 'new')
  RETURNING id INTO v_lead_id;
  
  RETURN v_lead_id;
END;
$$;

-- Allow public (anon) access to the submit function
GRANT EXECUTE ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_public_lead(TEXT, TEXT, TEXT, TEXT) TO authenticated;