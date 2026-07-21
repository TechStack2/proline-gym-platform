/**
 * Per-method daily collections tally (extracted from D1's /invoices surface so
 * IA-1's /today can reuse the same logic — one cash-drawer truth).
 *
 * MONEY-TALLY — this read used to return a BARE Map and swallow its own failure:
 * on error it logged one line and returned an EMPTY map, which every caller then
 * rendered as "no payments today". A gym owner saw an empty cash drawer while the
 * cash was in the till, and the e2e gate saw a phantom flake. Two changes make that
 * impossible:
 *
 *  1. The return type is DISCRIMINATED. There is no value that means both "nothing
 *     was collected" and "we could not find out" — a caller must handle `ok: false`
 *     to reach the tally at all, so the silent-empty rendering cannot be written by
 *     accident again.
 *  2. The read goes through the `get_daily_tally` RPC (000108) instead of a table
 *     select. Measured on the gate's own stack, the table read cost 97x its bare
 *     row-reading time at 189 rows and 1,078x at 6,174 — not from the sequential
 *     scan but from the per-row RLS cascade on `payments` (a correlated EXISTS whose
 *     inner tables carry their own RLS, OR'd with a SECURITY DEFINER call taking a
 *     per-row argument). Neither a date index nor an explicit gym predicate fixes
 *     that: RLS quals are security-barrier quals evaluated before a non-leakproof
 *     join can cut anything. The RPC is SECURITY DEFINER, so it replaces N per-row
 *     policy evaluations with ONE session-derived tenant check, and aggregates in
 *     SQL rather than shipping every row.
 */
import type { createClient } from '@/lib/supabase/server'

export type DailyTally = Map<string, { usd: number; lbp: number }>

/**
 * Either the drawer, or the reason there isn't one. Deliberately NOT
 * `DailyTally | null` — a nullable Map invites `?? new Map()` at the call site,
 * which is exactly the bug this replaces.
 */
export type DailyTallyResult =
  | { ok: true; tally: DailyTally }
  | { ok: false; error: string }

export async function getDailyTally(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: { gymId: string | null | undefined; date?: string },
): Promise<DailyTallyResult> {
  // No gym in scope is a FAILURE to answer, not an empty drawer: an unscoped read
  // would cross tenants, and "no payments today" would be a claim we cannot make.
  if (!opts.gymId) return { ok: false, error: 'no gym in scope' }

  // The half-open [day, day+1) window now lives INSIDE the function (000108), in the
  // same session timezone the PostgREST filter used — so the day boundary is
  // unchanged, including QUICK-WINS #1's upper bound that keeps post-dated cheques
  // out of "today".
  const day = opts.date ?? new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase.rpc('get_daily_tally', {
    p_gym_id: opts.gymId,
    p_date: day,
  })

  // A failed read must be LOUD — silently rendering an empty drawer cost a CI
  // diagnosis round (PT-2) and then a whole slice (FLAKE-HEAL-2, where this line was
  // the only witness that the "flake" was a statement timeout). The log stays; it is
  // no longer the only thing that notices.
  if (error) {
    console.error('[getDailyTally] read failed:', error.message)
    return { ok: false, error: error.message }
  }

  const tally: DailyTally = new Map()
  for (const row of (data ?? []) as { payment_method: string; usd: number; lbp: number }[]) {
    // The RPC groups per method, so each method appears once — but summing rather
    // than assigning keeps this correct if that ever changes.
    const cur = tally.get(row.payment_method) ?? { usd: 0, lbp: 0 }
    cur.usd += Number(row.usd ?? 0)
    cur.lbp += Number(row.lbp ?? 0)
    tally.set(row.payment_method, cur)
  }
  return { ok: true, tally }
}
