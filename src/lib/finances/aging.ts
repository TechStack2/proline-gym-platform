/**
 * Outstanding AGING buckets — the /money owner-finances aging grid, computed
 * COMPLETELY and gym-scoped in SQL.
 *
 * OUTSTANDING-AGING — the old `getOutstandingAging` (owner.ts) was the same truncation
 * class MONEY-OUTSTANDING killed, in per-bucket shape:
 *   invoices … .in(status,[open]).limit(2000)   (no ORDER BY)
 *   payments … .in('invoice_id', ids)           (no .limit → PostgREST max_rows=1000)
 * then it bucketed (total − Σ payments) by days-past-due in JS. Past 2000 open invoices
 * the buckets silently drop invoices (read LOW); past 1000 payments they drop payments
 * (read HIGH). And on a failed read it returned zeroed buckets — indistinguishable from
 * "nothing is overdue".
 *
 * The fix is the MONEY-OUTSTANDING idiom: one SECURITY DEFINER aggregate
 * (`get_gym_outstanding_aging`, 000110) that scopes to the caller's session gym, buckets
 * in SQL with no row ceiling, and returns a discriminated result so a failed read can
 * never be rendered as a calm empty aging grid.
 */
import type { createClient } from '@/lib/supabase/server'
import type { AgingBucket } from './owner'

export type { AgingBucket }

/** The four buckets, always in this fixed order (the render maps them positionally). */
export const AGING_KEYS = ['current', 'd1_30', 'd31_60', 'd60_plus'] as const

export type AgingKey = (typeof AGING_KEYS)[number]

/**
 * MEMBER-360-ACTIONABLE: whole days past due for ONE invoice (0 when due today
 * or later). `current_date` basis, mirroring 000110's SQL.
 */
export function daysPastDue(dueDate: string | null | undefined, today = new Date()): number {
  if (!dueDate) return 0
  const due = new Date(String(dueDate).slice(0, 10) + 'T00:00:00Z')
  const now = new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z')
  const days = Math.floor((now.getTime() - due.getTime()) / 864e5)
  return days > 0 ? days : 0
}

/**
 * The per-invoice twin of 000110's bucketing — the ONE aging truth. Boundaries
 * byte-match the SQL: due today-or-later = current; else ≤30 / ≤60 / beyond.
 */
export function agingBucketFor(dueDate: string | null | undefined, today = new Date()): AgingKey {
  const d = daysPastDue(dueDate, today)
  if (d <= 0) return 'current'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  return 'd60_plus'
}

export type AgingResult =
  | { ok: true; buckets: AgingBucket[] }
  | { ok: false; error: string }

type Row = {
  bucket: string
  n_invoices: number | string
  usd: number | string | null
  lbp: number | string | null
}

export async function getGymOutstandingAging(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: { gymId: string | null | undefined },
): Promise<AgingResult> {
  // No gym in scope is a FAILURE to answer, not an empty aging grid: an unscoped read
  // would cross tenants, and "nothing is overdue" is a claim we cannot make.
  if (!opts.gymId) return { ok: false, error: 'no gym in scope' }

  const { data, error } = await supabase.rpc('get_gym_outstanding_aging', { p_gym_id: opts.gymId })

  if (error) {
    console.error('[getGymOutstandingAging] read failed:', error.message)
    return { ok: false, error: error.message }
  }

  // Zero-fill so the render always gets all four buckets in order, even for a gym that
  // owes nothing (a genuine ZERO, distinct from the ok:false failure above).
  const byKey = new Map<string, AgingBucket>(
    AGING_KEYS.map((k) => [k, { key: k, count: 0, usd: 0, lbp: 0 }]),
  )
  for (const row of (data ?? []) as Row[]) {
    const b = byKey.get(row.bucket)
    if (!b) continue // an unknown bucket label would be a contract drift, not a render
    b.count += Number(row.n_invoices ?? 0)
    b.usd += Number(row.usd ?? 0)
    b.lbp += Number(row.lbp ?? 0)
  }
  // Round the summed USD to cents (the RPC sums raw per-invoice balances; this guards the
  // float add). LBP is whole-piastre already.
  const buckets = AGING_KEYS.map((k) => {
    const b = byKey.get(k)!
    return { ...b, usd: Math.round(b.usd * 100) / 100, lbp: Math.round(b.lbp) }
  })
  return { ok: true, buckets }
}
