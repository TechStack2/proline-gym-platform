-- ============================================================
-- 000099: AUDIT-TRIGGERS — close the audit-trail gaps on
--         coaches / classes / camps / user_roles
-- Gym 360 Platform · audit-trail completeness (AUDIT-TRIGGERS slice)
--
-- WHY.
--   The platform already has a generic audit mechanism: audit_trigger_fn()
--   (000005) is an AFTER INSERT/UPDATE/DELETE row trigger that writes one
--   audit_logs row per mutation (operation create/update/delete, old_data +
--   new_data as row_to_json, changed_by = auth.uid()). It is attached to
--   students, invoices, payments, belt_promotions, student_memberships (000005)
--   and pt_assignments (000012). audit_logs is gym-scoped at read time (000070:
--   gym_id auto-filled from the actor's profile, admin SELECT gated by
--   gym_id = get_user_gym_id()).
--
--   But four staff-mutable tables carry NO audit trigger, so staff can change
--   them with no trail:
--     • coaches      — roster, rates, activation (soft-delete via deleted_at)
--     • classes      — schedule/pricing/capacity   (soft-delete via deleted_at)
--     • camps        — product + pricing            (soft-delete via deleted_at)
--     • user_roles   — WHO holds owner/head_coach/coach/reception in a gym.
--       This is the security-relevant gap: a privilege grant/revoke currently
--       leaves no record. user_roles is HARD-deleted (no deleted_at), so a
--       revoke is a DELETE → captured as an 'delete' audit row here.
--
-- SHAPE CHECK (audit_trigger_fn references NEW.id / OLD.id, and audit_logs.
--   record_id is UUID). Verified all four tables have `id UUID PRIMARY KEY`:
--     coaches/classes/camps  (000002/000003) — id UUID PK, deleted_at soft-delete
--     user_roles             (000002)        — id UUID PK, hard DELETE
--   So the existing function fits all four with NO rewrite: a soft-delete is an
--   UPDATE (old_data/new_data show the deleted_at transition); a hard delete is
--   a DELETE. row_to_json handles any row shape.
--
-- POSTURE. No function is created or altered here → the DEFINER-POSTURE guard
--   (000096 / assert-definer-posture.sql) is unaffected: audit_trigger_fn is
--   already SECURITY DEFINER, search_path-pinned, and service_role-only
--   (TRIGGER category; the EXECUTE check is bypassed for trigger invocation).
--   No RLS/ACL change → CATALOG-SCOPE / AUTH-PRIMITIVES guards unaffected.
--
-- SAFETY. Additive + idempotent (DROP TRIGGER IF EXISTS before CREATE), so the
--   from-zero replay is clean and re-apply is a no-op. Trigger convention
--   (name trg_audit_<table>, AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW)
--   matches 000005/000012 exactly.
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_coaches ON coaches;
CREATE TRIGGER trg_audit_coaches AFTER INSERT OR UPDATE OR DELETE ON coaches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_classes ON classes;
CREATE TRIGGER trg_audit_classes AFTER INSERT OR UPDATE OR DELETE ON classes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_camps ON camps;
CREATE TRIGGER trg_audit_camps AFTER INSERT OR UPDATE OR DELETE ON camps
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
