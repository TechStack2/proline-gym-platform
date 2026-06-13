-- ============================================================
-- 000049: UX-2 — trials outcome field + belt-ladder archive (V1 / UX-2)
-- PRO LINE Gym Platform
--
-- REAL-COLUMNS AUDIT (all three tables verified BEFORE this file):
--   · trial_classes: lead_id, class_id, assigned_coach_id, scheduled_date/
--     time, status trial_status_enum (scheduled|completed|no_show|cancelled),
--     show_up BOOLEAN, feedback TEXT. The outcome + note columns the prompt
--     anticipated ALREADY EXIST (status/show_up + feedback). MISSING for the
--     Showed flow only: `interested`.
--   · belt_hierarchies: discipline_id, rank belt_rank_enum, names ×3,
--     sort_order, min_months/classes, is_black_belt, stripe_count. NO archive
--     column → ladder rows referenced by history could only be hard-deleted.
--     ADDED: is_active (archive pattern).
--   · membership_plans: complete (is_active + deleted_at already there) —
--     nothing added.
--   RLS verified gym-scoped on all three (belts via discipline, plans direct,
--   trials via lead — re-scoped in 000023). NOTHING tightened — first slice
--   where the sweep found zero bare policies.
-- ============================================================

ALTER TABLE trial_classes
  ADD COLUMN IF NOT EXISTS interested BOOLEAN;

ALTER TABLE belt_hierarchies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- -----------------------------------------------------------
-- record_trial_outcome v2 — + p_interested (Showed flow) + staff notify.
-- The staff emit lives IN the RPC (like 000023's anon lead_new) because the
-- recording caller may be the assigned COACH, who is excluded from the leads
-- RLS and so cannot resolve the lead name app-side; the definer can, and the
-- emit stays atomic with the stage flip. Dedup: one outcome notification per
-- trial (re-records update the row, not re-ping the desk).
-- next_action_date is FD-1's DERIVED model (leads has no column): the stage
-- flip + updated_at bump below IS what re-derives it (trial_completed → decide
-- +3d; contacted → follow-up +7d) — zero schema, named here for the audit.
-- -----------------------------------------------------------
DROP FUNCTION IF EXISTS record_trial_outcome(UUID, trial_status_enum, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION record_trial_outcome(
  p_trial_id   UUID,
  p_status     trial_status_enum,
  p_show_up    BOOLEAN,
  p_feedback   TEXT,
  p_interested BOOLEAN DEFAULT NULL
) RETURNS trial_classes
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym       UUID;
  v_trial     trial_classes;
  v_lead_name TEXT;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may record trial outcomes';
  END IF;
  v_gym := get_user_gym_id();

  SELECT t.* INTO v_trial
  FROM trial_classes t
  JOIN leads l ON l.id = t.lead_id
  WHERE t.id = p_trial_id AND l.gym_id = v_gym;

  IF v_trial.id IS NULL THEN
    RAISE EXCEPTION 'Trial % not found in this gym', p_trial_id;
  END IF;

  UPDATE trial_classes
  SET status = p_status, show_up = p_show_up,
      feedback = NULLIF(p_feedback, ''),
      interested = p_interested,
      updated_at = now()
  WHERE id = p_trial_id
  RETURNING * INTO v_trial;

  UPDATE leads
  SET status = CASE
                 WHEN p_status = 'completed' THEN 'trial_completed'::lead_status_enum
                 WHEN p_status = 'no_show'   THEN 'contacted'::lead_status_enum
                 ELSE status
               END,
      updated_at = now()
  WHERE id = v_trial.lead_id
  RETURNING TRIM(first_name || ' ' || COALESCE(last_name, '')) INTO v_lead_name;

  -- trial_outcome → desk staff (owner + receptionist), F2 keys, dedup-guarded.
  IF p_status IN ('completed', 'no_show') THEN
    BEGIN
      INSERT INTO notifications (user_id, gym_id, type, title_key, body_key, params, entity_type, entity_id, action_url, dedup_key)
      SELECT ur.user_id, v_gym, 'trial_outcome',
             'messages.trial_outcome.title', 'messages.trial_outcome.body',
             jsonb_build_object('leadName', v_lead_name, 'outcome', p_status::TEXT,
                                'interested', COALESCE(p_interested, false)),
             'trial', v_trial.id, '/leads',
             -- per-recipient key: a single shared key would self-conflict across
             -- the multi-row SELECT and reach only the first staff member
             'trial_outcome_' || v_trial.id || '_' || ur.user_id
      FROM user_roles ur
      WHERE ur.gym_id = v_gym AND ur.role IN ('owner', 'receptionist')
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN v_trial;
END;
$$;
