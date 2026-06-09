-- ============================================================
-- 000026: DEMO CLASS — schedule on every weekday (Cycle 5 / 24-R test support)
-- PRO LINE Gym Platform
--
-- The coach attendance view only lists classes scheduled for TODAY's day-of-week
-- (loadClasses filters on class_schedules.day_of_week = today.getDay()). The demo
-- "Muay Thai Beginner" class was seeded only Mon/Wed (000017), so on any other
-- day the coach has no class to mark — which makes the activity-loop behavior
-- test (and a real coach on a Tue/Thu/weekend) unable to take attendance.
--
-- This forward-only, idempotent migration ensures the demo class has a schedule
-- for all 7 weekdays so attendance is always reachable. Test-support seed, in the
-- same spirit as 000019 (demo PT package). Safe to re-run.
-- ============================================================

DO $$
DECLARE
  v_gym   UUID;
  v_class UUID;
  d       INTEGER;
BEGIN
  SELECT id INTO v_gym FROM gyms WHERE slug = 'proline-gym';
  IF v_gym IS NULL THEN
    RAISE NOTICE '000026: proline-gym not found — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_class FROM classes
  WHERE gym_id = v_gym AND name_en = 'Muay Thai Beginner' LIMIT 1;
  IF v_class IS NULL THEN
    RAISE NOTICE '000026: demo class not found — skipping';
    RETURN;
  END IF;

  FOR d IN 0..6 LOOP
    INSERT INTO class_schedules (class_id, day_of_week, start_time, end_time, is_active)
    SELECT v_class, d, '18:00', '19:30', true
    WHERE NOT EXISTS (
      SELECT 1 FROM class_schedules WHERE class_id = v_class AND day_of_week = d
    );
  END LOOP;
END $$;
