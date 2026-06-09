-- ============================================================
-- 000028: RESET DEMO STUDENT BELT (Cycle 5 / C1 — test-support, cross-slice)
-- PRO LINE Gym Platform
--
-- The 24-R activity-loop e2e promotes the demo student one belt per run, and
-- promotion is one-way — so after enough CI runs the student reached the TOP
-- Muay Thai rank and the spec's "next belt above current" lookup returned none
-- (the rank-exhaustion flagged in 24-R's drag read). This resets the demo
-- student (student@prolinegym.lb) to 'white' so the activity-loop spec has
-- headroom again. Historical belt_promotions are left intact (the spec asserts
-- rank == latest promotion, which the next run re-establishes).
--
-- NOTE (durability): this is a one-shot unblock. A durable fix belongs in the
-- 24-R activity-loop spec (reset each run, or use a disposable student) — flagged
-- for a follow-up. Idempotent: re-running just re-asserts 'white'.
-- ============================================================

DO $$
DECLARE
  v_student UUID;
BEGIN
  SELECT s.id INTO v_student
  FROM students s
  JOIN profiles p ON p.id = s.profile_id
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'student@prolinegym.lb'
  LIMIT 1;

  IF v_student IS NOT NULL THEN
    UPDATE students
    SET current_belt_rank = 'white', belt_promotion_date = CURRENT_DATE - 30, updated_at = now()
    WHERE id = v_student;
  END IF;
END $$;
