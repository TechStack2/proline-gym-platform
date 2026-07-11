import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * AUTH-DEPTH (REQ3) — audit-parity writer.
 *
 * The audit trail already exists (audit_logs + audit_trigger_fn on the 6 billing/
 * enrollment tables + explicit inserts in the invoice/payment RPCs). Those cover
 * data-plane mutations by an AUTHENTICATED actor (auth.uid()). The high-privilege
 * staff/vendor actions that run through the SERVICE-ROLE admin client — where
 * auth.uid() is null, so a trigger would record no actor and no gym — had no trail.
 *
 * This is the explicit-attribution writer for exactly those service-role paths: it
 * passes changed_by + gym_id itself (the BEFORE-INSERT audit_logs_set_gym trigger is
 * set-if-null, so the explicit gym_id survives → the tenant's owner sees the row under
 * the 000070 read policy). Reuses the EXISTING audit_logs table — no new subsystem.
 *
 * BEST-EFFORT: an audit write must NEVER fail or block the privileged action it
 * records. All errors are swallowed to a server log.
 */
export type AuditOperation = 'create' | 'update' | 'delete' | 'payment' | 'refund' | 'export'

export type AuditEvent = {
  tableName: string
  recordId: string
  operation: AuditOperation
  gymId: string
  changedBy: string
  oldData?: unknown
  newData?: unknown
}

/** Write one audit_logs row via the service-role client. Never throws. */
export async function recordAudit(admin: SupabaseClient, e: AuditEvent): Promise<void> {
  try {
    const { error } = await admin.from('audit_logs').insert({
      table_name: e.tableName,
      record_id: e.recordId,
      operation: e.operation,
      gym_id: e.gymId,
      changed_by: e.changedBy,
      old_data: (e.oldData ?? null) as never,
      new_data: (e.newData ?? null) as never,
    })
    if (error) console.error('[audit] write failed (non-blocking):', error.message)
  } catch (err) {
    console.error('[audit] write threw (non-blocking):', err)
  }
}
