/**
 * Gym-wide outstanding obligations — the /money "Outstanding" + "Outstanding
 * renewals" cards, computed COMPLETELY and gym-scoped in SQL.
 *
 * MONEY-OUTSTANDING — the old computation was a 2-round-trip JS join that could be
 * silently wrong three ways, all measured on the gate's own stack:
 *
 *   1. `invoices … .in('status',[open]).limit(500)` — no ORDER BY. Past 500 open
 *      invoices, an arbitrary subset was summed. Every open invoice owes a positive
 *      amount, so a dropped invoice can only make the drawer read LOW.
 *   2. `payments … .in('invoice_id', ids)` — no `.limit()`, so PostgREST applied its
 *      own `max_rows` cap (1000) with no ORDER BY. Past 1000 payments on the open
 *      set, an arbitrary subset of PAYMENTS was subtracted — a dropped payment leaves
 *      its invoice looking unpaid, so the drawer reads HIGH. This is the shape of the
 *      $20-partial flake that first surfaced the bug.
 *   3. No gym predicate in SQL on the invoices read (RLS-only), and the two reads ran
 *      in separate snapshots, so a concurrent write could straddle them.
 *
 * The fix is the MONEY-TALLY idiom: one SECURITY DEFINER aggregate (`get_gym_outstanding`,
 * 000109) that scopes to the caller's session gym, sums the per-invoice balance in SQL
 * with no row ceiling, and returns the same discriminated result so a failed read can
 * never be rendered as "$0 outstanding". The RPC groups by whether each open invoice is
 * a renewal invoice, so the page still gets both the all-invoices total and the
 * renewal-only subset (plus their counts) from a single call.
 */
import type { createClient } from '@/lib/supabase/server'

export type OutstandingTotals = {
  /** Σ over ALL open invoices (renewal + non-renewal). */
  usd: number
  lbp: number
  invoiceCount: number
  /** Σ over the renewal-invoice subset only (⊆ the totals above). */
  renewalUsd: number
  renewalLbp: number
  renewalCount: number
}

/**
 * Either the totals, or the reason there isn't one. Deliberately NOT
 * `OutstandingTotals | null` — a nullable value invites `?? { usd: 0, … }` at the
 * call site, which renders "nothing is owed" for "we could not find out": the exact
 * MONEY-TALLY defect, here on the obligation side of the ledger.
 */
export type OutstandingResult =
  | { ok: true; totals: OutstandingTotals }
  | { ok: false; error: string }

type Row = {
  is_renewal: boolean
  n_invoices: number | string
  usd: number | string | null
  lbp: number | string | null
}

export async function getGymOutstanding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: { gymId: string | null | undefined },
): Promise<OutstandingResult> {
  // No gym in scope is a FAILURE to answer, not a zero balance: an unscoped read
  // would cross tenants, and "nothing is owed" is a claim we cannot make.
  if (!opts.gymId) return { ok: false, error: 'no gym in scope' }

  const { data, error } = await supabase.rpc('get_gym_outstanding', { p_gym_id: opts.gymId })

  if (error) {
    console.error('[getGymOutstanding] read failed:', error.message)
    return { ok: false, error: error.message }
  }

  const totals: OutstandingTotals = {
    usd: 0, lbp: 0, invoiceCount: 0, renewalUsd: 0, renewalLbp: 0, renewalCount: 0,
  }
  for (const row of (data ?? []) as Row[]) {
    const usd = Number(row.usd ?? 0)
    const lbp = Number(row.lbp ?? 0)
    const n = Number(row.n_invoices ?? 0)
    totals.usd += usd
    totals.lbp += lbp
    totals.invoiceCount += n
    if (row.is_renewal) {
      totals.renewalUsd += usd
      totals.renewalLbp += lbp
      totals.renewalCount += n
    }
  }
  // Round the summed USD to cents (the RPC clamps + rounds per invoice; this guards the
  // float add of the two groups). LBP is whole-piastre already.
  totals.usd = Math.round(totals.usd * 100) / 100
  totals.renewalUsd = Math.round(totals.renewalUsd * 100) / 100
  totals.lbp = Math.round(totals.lbp)
  totals.renewalLbp = Math.round(totals.renewalLbp)
  return { ok: true, totals }
}
