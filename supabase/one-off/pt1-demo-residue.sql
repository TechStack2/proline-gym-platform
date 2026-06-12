-- ============================================================
-- PT-1 ONE-OFF (NOT a migration — applied once via Verify-Foundation run_sql):
-- archive the DEMO gym's accumulated "Single PT Session" test residue the
-- operator hit on Karim's account (journey-pt-360 §3.1). Data cleanup only:
--   · the loose single-session TYPE is archived (kept for sold-row joins);
--   · its stale REQUESTED assignments are cancelled (never-approved noise);
-- nothing is deleted; active/sold packages are untouched. The e2e run gyms
-- are unaffected (their residue dies with teardown).
-- ============================================================
WITH demo AS (SELECT id FROM gyms WHERE slug = 'proline-gym' LIMIT 1)
UPDATE pt_packages
SET is_active = false, show_on_landing = false, updated_at = now()
WHERE gym_id IN (SELECT id FROM demo) AND name_en = 'Single PT Session';

WITH demo AS (SELECT id FROM gyms WHERE slug = 'proline-gym' LIMIT 1)
UPDATE pt_assignments a
SET status = 'cancelled', is_active = false, updated_at = now()
FROM pt_packages p
WHERE a.package_id = p.id
  AND p.gym_id IN (SELECT id FROM demo)
  AND p.name_en = 'Single PT Session'
  AND a.status = 'requested';
