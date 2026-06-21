/**
 * OFF-3b — offline lead capture: pending-intent queue + flush.
 *
 * The third outbox path, mirroring OFF-3 payments (payments.ts) and G2 attendance.
 * A walk-in lead captured offline is a PendingLeadIntent in Dexie keyed by a client
 * op_id; the flush drains oldest-first through the EXISTING addLead writer, passing
 * op_id as the idempotency key (000064) so a re-push / dropped-ACK settles EXACTLY
 * ONE lead. A server rejection flags `conflict` (resolvable via the OFF-4 loop —
 * re-submit / discard-with-audit), never a silent drop.
 *
 * Client-only (IndexedDB). Reuses the existing writer — no new lead business logic.
 */
import { getOfflineDB } from '@/lib/db/schema'
import type { PendingLeadIntent } from '@/lib/db/schema'

const db = () => getOfflineDB()

export type CreateLead = (input: {
  first_name: string; last_name: string; phone: string; email: string | null
  source: string; source_detail: string | null; discipline_id: string | null
  notes: string | null; clientUuid: string
}) => Promise<{ ok: true } | { ok: false; error: string }>

export type DiscardLead = (input: {
  opId: string; name: string; reason: string
}) => Promise<{ ok: true } | { ok: false; error: string }>

/** Queue (or replace) an offline lead intent. op_id is the idempotency key. */
export async function queueLead(l: Omit<PendingLeadIntent, 'client_ts' | 'status'>): Promise<void> {
  await db().pending_leads.put({ ...l, client_ts: new Date().toISOString(), status: 'pending' })
}

export async function pendingLeadsCount(): Promise<number> {
  return db().pending_leads.count()
}

export async function listPendingLeads(): Promise<PendingLeadIntent[]> {
  return db().pending_leads.orderBy('client_ts').toArray()
}

// ── Flush: drain oldest-first through addLead (idempotent on op_id) ─────────────
export async function flushLeads(
  create: CreateLead,
): Promise<{ flushed: number; remaining: number; conflicts: number }> {
  const items = (await listPendingLeads()).filter((i) => i.status !== 'conflict')
  let flushed = 0
  let conflicts = 0
  for (const it of items) {
    try {
      const res = await create({
        first_name: it.first_name, last_name: it.last_name, phone: it.phone, email: it.email,
        source: it.source, source_detail: it.source_detail, discipline_id: it.discipline_id,
        notes: it.notes, clientUuid: it.op_id,
      })
      if (res.ok) {
        await db().pending_leads.delete(it.op_id) // confirmed (or idempotent no-op)
        flushed += 1
      } else {
        await db().pending_leads.update(it.op_id, { status: 'conflict', last_error: res.error })
        conflicts += 1
      }
    } catch {
      // Transient (lost connection mid-flush): leave pending; the op_id makes the
      // next re-push safe even if the server actually committed this one.
    }
  }
  return { flushed, remaining: await pendingLeadsCount(), conflicts }
}

// ── OFF-4-style resolution (re-submit / discard-with-audit) ────────────────────
/** Re-submit a conflicted lead under the SAME op_id → back to pending for the next
 *  flush (idempotency holds — the lead was never created). */
export async function resubmitLead(op_id: string): Promise<void> {
  await db().pending_leads.update(op_id, { status: 'pending', last_error: undefined })
}

/** Discard a conflicted lead WITH an audit trail (never a silent drop). */
export async function discardLead(
  op_id: string, reason: string, discard: DiscardLead,
): Promise<{ ok: boolean; error?: string }> {
  const row = await db().pending_leads.get(op_id)
  if (!row) return { ok: true }
  const name = `${row.first_name} ${row.last_name}`.trim()
  const res = await discard({ opId: op_id, name, reason })
  if (res.ok) { await db().pending_leads.delete(op_id); return { ok: true } }
  return { ok: false, error: res.error }
}
