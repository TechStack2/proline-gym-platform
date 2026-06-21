/**
 * The unified offline write queue (façade).
 *
 * ONE entry point for the desk's pending-sync indicator + reconnect flush, over the
 * Tier-1 write paths: G2 attendance (attendance.ts), OFF-3 payments (payments.ts),
 * and OFF-3b leads (leads.ts). Each path keeps its own proven, domain-keyed queue
 * and drains through its own EXISTING idempotent server writer; this façade composes
 * them so the front desk has a single count + a single "Sync now". No parallel sync
 * mechanism — the same enqueue→flush→idempotent-writer loop, generalized.
 */
import { pendingCount as pendingAttendance, flushPending, type SaveAttendance } from './attendance'
import {
  pendingPaymentsCount,
  flushPayments,
  listPendingPayments,
  type RecordPayment,
} from './payments'
import {
  pendingLeadsCount,
  flushLeads,
  listPendingLeads,
  type CreateLead,
} from './leads'

export type OutboxStats = {
  total: number       // pending writes awaiting sync (excludes flagged conflicts)
  attendance: number
  payments: number
  leads: number
  conflicts: number   // payment + lead writes the server rejected — surfaced for review
}

export async function outboxStats(): Promise<OutboxStats> {
  const [attendance, payments, pp, leads, pl] = await Promise.all([
    pendingAttendance(),
    pendingPaymentsCount(),
    listPendingPayments(),
    pendingLeadsCount(),
    listPendingLeads(),
  ])
  const conflicts =
    pp.filter((p) => p.status === 'conflict').length +
    pl.filter((l) => l.status === 'conflict').length
  // The per-path counts include conflicts; subtract so `total` reflects what will
  // actually flush.
  return { total: attendance + payments + leads - conflicts, attendance, payments, leads, conflicts }
}

export async function flushOutbox(h: {
  save: SaveAttendance
  record: RecordPayment
  create: CreateLead
}): Promise<{
  attendance: Awaited<ReturnType<typeof flushPending>>
  payments: Awaited<ReturnType<typeof flushPayments>>
  leads: Awaited<ReturnType<typeof flushLeads>>
}> {
  // Independent paths — a failure in one never blocks the others.
  const attendance = await flushPending(h.save)
  const payments = await flushPayments(h.record)
  const leads = await flushLeads(h.create)
  return { attendance, payments, leads }
}
