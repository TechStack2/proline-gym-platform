-- ============================================================
-- 000025: MEMBER ACTIVITY LOOP — atomic promotion (Cycle 5 / Phase 1 / 24-R)
-- PRO LINE Gym Platform
--
-- The belt engine wrote a promotion as TWO separate client calls (insert
-- belt_promotions, then update students.current_belt_rank) with a manual JS
-- rollback — NOT a DB transaction, so a crash between them left rank ↔ history
-- divergent. This replaces that path with a single atomic, staff-only,
-- gym-scoped RPC: insert the promotion AND update the student's rank in ONE
-- transaction (all-or-nothing). Belt-rank ordering is enforced in the client
-- (isValidBeltPromotion) and re-checked here (target sort_order > current).
--
-- BINDING BOUNDARY (analysis-class-attendance-vs-pt-session-seam.md): the Member
-- Activity Loop touches NO PT table and never calls increment_sessions_used.
-- This migration is consistent with that — it only touches belt_promotions +
-- students.
-- ============================================================

CREATE OR REPLACE FUNCTION promote_student(
  p_student_id      UUID,
  p_discipline_id   UUID,
  p_to_hierarchy_id UUID,
  p_coach_id        UUID,
  p_promotion_date  DATE DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
) RETURNS belt_promotions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym       UUID;
  v_from      belt_rank_enum;
  v_to        belt_rank_enum;
  v_from_sort INTEGER;
  v_to_sort   INTEGER;
  v_date      DATE := COALESCE(p_promotion_date, CURRENT_DATE);
  v_promo     belt_promotions;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff may promote students';
  END IF;
  v_gym := get_user_gym_id();
  IF v_gym IS NULL THEN
    RAISE EXCEPTION 'No gym context for caller';
  END IF;

  -- Student must belong to the caller's gym.
  SELECT current_belt_rank INTO v_from
  FROM students WHERE id = p_student_id AND gym_id = v_gym;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student % not found in this gym', p_student_id;
  END IF;

  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'A coach is required to record a promotion';
  END IF;

  -- Target rank from the hierarchy row (must belong to the named discipline).
  SELECT rank, sort_order INTO v_to, v_to_sort
  FROM belt_hierarchies WHERE id = p_to_hierarchy_id AND discipline_id = p_discipline_id;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Belt hierarchy % not found for discipline %', p_to_hierarchy_id, p_discipline_id;
  END IF;

  -- Enforce forward-only promotion (target above current) when current is known.
  IF v_from IS NOT NULL THEN
    SELECT sort_order INTO v_from_sort
    FROM belt_hierarchies WHERE discipline_id = p_discipline_id AND rank = v_from;
    IF v_from_sort IS NOT NULL AND v_to_sort <= v_from_sort THEN
      RAISE EXCEPTION 'Target belt must rank above the current belt';
    END IF;
  END IF;

  -- Write 1: promotion history.
  INSERT INTO belt_promotions (
    student_id, coach_id, discipline_id, belt_hierarchy_id,
    from_rank, to_rank, promotion_date, notes_ar, notes_en, notes_fr
  )
  VALUES (
    p_student_id, p_coach_id, p_discipline_id, p_to_hierarchy_id,
    v_from, v_to, v_date, p_notes, p_notes, p_notes
  )
  RETURNING * INTO v_promo;

  -- Write 2: the student's current rank — SAME transaction (atomic).
  UPDATE students
  SET current_belt_rank = v_to, belt_promotion_date = v_date, updated_at = now()
  WHERE id = p_student_id;

  RETURN v_promo;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_student(UUID, UUID, UUID, UUID, DATE, TEXT) TO authenticated;
