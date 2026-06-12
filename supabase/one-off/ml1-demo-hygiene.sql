-- ============================================================
-- ML-1 ONE-OFF (NOT a migration — applied once via Verify-Foundation run_sql):
-- repair the operator's manual table-editor deletions in the DEMO gym
-- (auditor integrity audit, VF run 27413743680). Before/after counts inline.
-- ============================================================

-- BEFORE counts
SELECT 'BEFORE' AS phase,
  (SELECT count(*) FROM classes c
    WHERE c.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym')
      AND c.is_active AND c.deleted_at IS NULL
      AND (c.coach_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM coaches co WHERE co.id = c.coach_id AND co.is_active AND co.deleted_at IS NULL)))
    AS classes_missing_coach,
  (SELECT count(*) FROM pt_sessions s
    JOIN students st ON st.id = s.student_id
    WHERE st.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym') AND s.assignment_id IS NULL)
    AS orphan_pt_sessions,
  (SELECT count(*) FROM notifications n
    WHERE n.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym'))
    AS demo_notifications;

-- 1. Demo classes pointing at a missing/inactive coach → reassign to an
--    active demo coach (deterministic: the longest-serving active one).
WITH demo AS (SELECT id FROM gyms WHERE slug = 'proline-gym'),
     fallback AS (
       SELECT id FROM coaches
       WHERE gym_id IN (SELECT id FROM demo) AND is_active AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1
     )
UPDATE classes c
SET coach_id = (SELECT id FROM fallback), updated_at = now()
WHERE c.gym_id IN (SELECT id FROM demo)
  AND c.is_active AND c.deleted_at IS NULL
  AND (c.coach_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM coaches co WHERE co.id = c.coach_id AND co.is_active AND co.deleted_at IS NULL))
  AND EXISTS (SELECT 1 FROM fallback);

-- 2. Orphan pt_sessions (no assignment) in the demo gym → cancelled (archive,
--    never delete; they are meaningless without a package — PT-1 §3.1).
WITH demo AS (SELECT id FROM gyms WHERE slug = 'proline-gym')
UPDATE pt_sessions s
SET status = 'cancelled', updated_at = now()
FROM students st
WHERE st.id = s.student_id AND st.gym_id IN (SELECT id FROM demo)
  AND s.assignment_id IS NULL AND s.status <> 'cancelled';

-- 3. Notification residue: keep the latest 20 per demo user, delete the rest.
WITH demo AS (SELECT id FROM gyms WHERE slug = 'proline-gym'),
     ranked AS (
       SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
       FROM notifications WHERE gym_id IN (SELECT id FROM demo)
     )
DELETE FROM notifications WHERE id IN (SELECT id FROM ranked WHERE rn > 20);

-- AFTER counts (same queries)
SELECT 'AFTER' AS phase,
  (SELECT count(*) FROM classes c
    WHERE c.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym')
      AND c.is_active AND c.deleted_at IS NULL
      AND (c.coach_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM coaches co WHERE co.id = c.coach_id AND co.is_active AND co.deleted_at IS NULL)))
    AS classes_missing_coach,
  (SELECT count(*) FROM pt_sessions s
    JOIN students st ON st.id = s.student_id
    WHERE st.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym')
      AND s.assignment_id IS NULL AND s.status <> 'cancelled')
    AS orphan_pt_sessions,
  (SELECT count(*) FROM notifications n
    WHERE n.gym_id = (SELECT id FROM gyms WHERE slug = 'proline-gym'))
    AS demo_notifications;
