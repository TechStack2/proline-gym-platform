/**
 * OFF-3 — the unified offline write queue (façade).
 *
 * ONE entry point for the desk's pending-sync indicator + reconnect flush, over
 * BOTH Tier-1 write paths: G2 attendance (attendance.ts) and OFF-3 payments
 * (payments.ts). Each path keeps its own proven, domain-keyed queue and drains
 * through its own EXISTING idempotent server writer; this façade just composes
 * them so the front desk has a single count + a single "Sync now". No parallel
 * sync mechanism — the same enqueue→flush→idempotent-writer loop, generalized.
 */
import { pendingCount as pendingAttendance, flushPending, type SaveAttendance } from './attendance'
import {
  pendingPaymentsCount,
  flushPayments,
  listPendingPayments,
  type RecordPayment,
} from './payments'

export type OutboxStats = {
  total: number       // pending writes awaiting sync (excludes flagged conflicts)
  attendance: number
  payments: number
  conflicts: number   // payment writes the server rejected — surfaced for review
}

export async function outboxStats(): Promise<OutboxStats> {
  const [attendance, payments, pp] = await Promise.all([
    pendingAttendance(),
    pendingPaymentsCount(),
    listPendingPayments(),
  ])
  const conflicts = pp.filter((p) => p.status === 'conflict').length
  // `payments` counts every queued row incl. conflicts; subtract so `total`
  // reflects what will actually flush.
  return { total: attendance + payments - conflicts, attendance, payments, conflicts }
}

export async function flushOutbox(h: {
  save: SaveAttendance
  record: RecordPayment
}): Promise<{
  attendance: Awaited<ReturnType<typeof flushPending>>
  payments: Awaited<ReturnType<typeof flushPayments>>
}> {
  // Independent paths — a failure in one never blocks the other.
  const attendance = await flushPending(h.save)
  const payments = await flushPayments(h.record)
  return { attendance, payments }
}
