/**
 * Per-method daily collections tally (extracted from D1's /invoices surface so
 * IA-1's /today can reuse the same logic — one cash-drawer truth).
 */
import type { createClient } from '@/lib/supabase/server'

export type DailyTally = Map<string, { usd: number; lbp: number }>

export async function getDailyTally(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date?: string,
): Promise<DailyTally> {
  const day = date ?? new Date().toISOString().slice(0, 10)
  // QUICK-WINS #1: payment_date is TIMESTAMPTZ — a bare .gte(day) had NO upper bound,
  // so "today's" tally silently swept in every FUTURE-dated payment (post-dated cheques
  // are common here). Bound to a true same-day window [day, day+1).
  const next = new Date(`${day}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const dayAfter = next.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('payments')
    .select('amount_usd, amount_lbp, payment_method')
    .gte('payment_date', day)
    .lt('payment_date', dayAfter)
  // A failed read must be LOUD — silently rendering an empty drawer cost a CI
  // diagnosis round (PT-2): error ⇒ empty tally looked like "no payments".
  if (error) console.error('[getDailyTally] read failed:', error.message)

  const tally: DailyTally = new Map()
  for (const p of (data ?? []) as any[]) {
    const cur = tally.get(p.payment_method) ?? { usd: 0, lbp: 0 }
    cur.usd += Number(p.amount_usd ?? 0)
    cur.lbp += Number(p.amount_lbp ?? 0)
    tally.set(p.payment_method, cur)
  }
  return tally
}
