/**
 * OFF-3 — offline payments: pending-intent queue + flush.
 *
 * Generalizes G2's attendance queue (attendance.ts) to the money path. A payment
 * recorded offline is enqueued as a PendingPaymentIntent keyed by a client op_id
 * (= the record_payment idempotency key). The flush drains oldest-first through
 * the EXISTING record_payment writer, passing op_id as p_client_uuid, so a
 * double-flush — or a re-push after a dropped ACK — settles EXACTLY ONCE (000062).
 *
 * A server rejection (overpayment / cancelled invoice / …) flags the row
 * `conflict` and KEEPS it (surfaced for review) — the locked money decision is to
 * never silently drop a money record. A transient mid-flush failure leaves the row
 * pending to retry; the idempotency key makes that retry safe.
 *
 * Client-only (IndexedDB). Reuses the existing writer — no new business logic.
 */
import { getOfflineDB } from '@/lib/db/schema'
import type { PendingPaymentIntent } from '@/lib/db/schema'

const db = () => getOfflineDB()

export type RecordPayment = (input: {
  invoiceId: string
  amountUsd: number
  amountLbp: number
  method: string
  reference: string | null
  exchangeRate: number | null
  paymentDate: string
  clientUuid: string
}) => Promise<{ ok: true } | { ok: false; error: string }>

/** Queue (or replace) an offline payment intent. op_id is the idempotency key —
 *  re-queuing the same op_id overwrites it (local LWW), client_ts refreshed. */
export async function queuePayment(
  p: Omit<PendingPaymentIntent, 'client_ts' | 'status'>,
): Promise<void> {
  await db().pending_payments.put({ ...p, client_ts: new Date().toISOString(), status: 'pending' })
}

export async function pendingPaymentsCount(): Promise<number> {
  return db().pending_payments.count()
}

export async function listPendingPayments(): Promise<PendingPaymentIntent[]> {
  return db().pending_payments.orderBy('client_ts').toArray()
}

// ── Flush: drain oldest-first through record_payment (idempotent on op_id) ──────
export async function flushPayments(
  record: RecordPayment,
): Promise<{ flushed: number; remaining: number; conflicts: number }> {
  // Skip rows already flagged conflict (a known-bad write awaiting review / OFF-4)
  // so a hard rejection doesn't re-fire every flush; they stay queued + visible.
  const items = (await listPendingPayments()).filter((i) => i.status !== 'conflict')
  let flushed = 0
  let conflicts = 0
  for (const it of items) {
    try {
      const res = await record({
        invoiceId: it.invoice_id,
        amountUsd: it.amount_usd,
        amountLbp: it.amount_lbp,
        method: it.method,
        reference: it.reference,
        exchangeRate: it.exchange_rate,
        paymentDate: it.payment_date,
        clientUuid: it.op_id,
      })
      if (res.ok) {
        // Confirmed — or an idempotent no-op (server already had op_id). Either
        // way exactly one canonical payment exists; drop the queue row.
        await db().pending_payments.delete(it.op_id)
        flushed += 1
      } else {
        // Server rejected → never drop a money record. Flag for review.
        await db().pending_payments.update(it.op_id, { status: 'conflict', last_error: res.error })
        conflicts += 1
      }
    } catch {
      // Transient (lost connection mid-flush): leave pending. The op_id makes the
      // next re-push safe even if the server actually committed this one.
    }
  }
  return { flushed, remaining: await pendingPaymentsCount(), conflicts }
}
