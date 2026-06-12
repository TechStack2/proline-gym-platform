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
  const { data, error } = await supabase
    .from('payments')
    .select('amount_usd, amount_lbp, payment_method')
    .gte('payment_date', day)
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
