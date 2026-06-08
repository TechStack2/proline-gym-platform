-- ============================================================
-- 000019: SINGLE-SESSION DEMO PT PACKAGE (Cycle 5 / Phase 1 / Prompt 22-R)
-- PRO LINE Gym Platform
--
-- The PT cross-portal harness spec must prove the credit-consumption boundary:
-- `increment_sessions_used()` decrements by 1 and is REJECTED at 0. The seeded
-- demo packages are 5/10/20 sessions, so exhausting one in a test would take
-- many log clicks. This adds a coherent 1-session package to the demo gym so the
-- "log session → decrements → blocks at 0" path is reachable in a single log.
--
-- Forward-only and idempotent (matched by gym + name_en). PT-slice-scoped: it
-- only adds a row to pt_packages; no schema, RLS, or auth change.
-- ============================================================

INSERT INTO pt_packages (gym_id, name_ar, name_en, name_fr, session_count, price_usd, price_lbp, validity_days, is_active)
SELECT g.id, 'جلسة تدريب خاص واحدة', 'Single PT Session', 'Séance Coaching Unique', 1, 35.00, 0, 30, true
FROM gyms g
WHERE g.slug = 'proline-gym'
  AND NOT EXISTS (
    SELECT 1 FROM pt_packages p
    WHERE p.gym_id = g.id AND p.name_en = 'Single PT Session'
  );
