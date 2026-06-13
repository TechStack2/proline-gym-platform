/**
 * FIN-1 owner finances — reads over D1's ledger (invoices + payments). The
 * product of any money line is the invoice's own `invoice_type` (the enum
 * already carries `class_registration`, added 000033) — a one-hop join, no new
 * money table. PT folds pt_package+pt_session; rental/event/other fold to an
 * honest "other/legacy" bucket. Balances follow the D1 canon (Σ amount_usd).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Product = 'membership' | 'class' | 'pt' | 'camp' | 'other'
export const PRODUCTS: Product[] = ['membership', 'class', 'pt', 'camp', 'other']

export function productOf(invoiceType: string): Product {
  switch (invoiceType) {
    case 'membership': return 'membership'
    case 'class_registration': return 'class'
    case 'pt_package': case 'pt_session': return 'pt'
    case 'camp': return 'camp'
    default: return 'other' // rental / event / other
  }
}

export type RevenueMonth = { month: string; byProduct: Record<Product, number>; total: number }

/** Collected USD by month × product for the last `months` (newest first). */
export async function getRevenueByMonth(
  supabase: SupabaseClient, gymId: string, months = 6,
): Promise<RevenueMonth[]> {
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - (months - 1), 1)
  since.setUTCHours(0, 0, 0, 0)

  const { data: pays } = await supabase
    .from('payments')
    .select('amount_usd, payment_date, invoices:invoice_id!inner (gym_id, invoice_type)')
    .eq('invoices.gym_id', gymId)
    .gte('payment_date', since.toISOString())
    .limit(5000)

  const buckets = new Map<string, RevenueMonth>()
  const blank = (): Record<Product, number> => ({ membership: 0, class: 0, pt: 0, camp: 0, other: 0 })
  for (const p of (pays ?? []) as any[]) {
    const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
    if (!inv) continue
    const mk = String(p.payment_date).slice(0, 7)
    if (!buckets.has(mk)) buckets.set(mk, { month: mk, byProduct: blank(), total: 0 })
    const row = buckets.get(mk)!
    const usd = Number(p.amount_usd ?? 0)
    row.byProduct[productOf(inv.invoice_type)] += usd
    row.total += usd
  }

  const out: RevenueMonth[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date()
    d.setUTCMonth(d.getUTCMonth() - i, 1)
    const mk = d.toISOString().slice(0, 7)
    out.push(buckets.get(mk) ?? { month: mk, byProduct: blank(), total: 0 })
  }
  return out
}

export type MethodTotal = { method: string; usd: number; lbp: number }

/** Collections by payment method for the given month (YYYY-MM, default current). */
export async function getCollectionsByMethod(
  supabase: SupabaseClient, gymId: string, month?: string,
): Promise<MethodTotal[]> {
  const mk = month ?? new Date().toISOString().slice(0, 7)
  const start = `${mk}-01T00:00:00Z`
  const endD = new Date(`${mk}-01T00:00:00Z`)
  endD.setUTCMonth(endD.getUTCMonth() + 1)

  const { data: pays } = await supabase
    .from('payments')
    .select('amount_usd, amount_lbp, payment_method, payment_date, invoices:invoice_id!inner (gym_id)')
    .eq('invoices.gym_id', gymId)
    .gte('payment_date', start)
    .lt('payment_date', endD.toISOString())
    .limit(5000)

  const by = new Map<string, MethodTotal>()
  for (const p of (pays ?? []) as any[]) {
    const m = p.payment_method as string
    if (!by.has(m)) by.set(m, { method: m, usd: 0, lbp: 0 })
    const t = by.get(m)!
    t.usd += Number(p.amount_usd ?? 0)
    t.lbp += Number(p.amount_lbp ?? 0)
  }
  return [...by.values()].sort((a, b) => b.usd - a.usd)
}

export type AgingBucket = { key: 'current' | 'd1_30' | 'd31_60' | 'd60_plus'; count: number; usd: number }

/**
 * Outstanding aging: open-invoice balances bucketed by days past due_date.
 * Balance is reconciled per the D1 canon (total − Σ payments.amount_usd).
 */
export async function getOutstandingAging(
  supabase: SupabaseClient, gymId: string, now = new Date(),
): Promise<AgingBucket[]> {
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, total_usd, due_date, status')
    .eq('gym_id', gymId)
    .in('status', ['pending', 'partial', 'overdue'])
    .limit(2000)

  const ids = (openInvoices ?? []).map((i: any) => i.id)
  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as any[] }
  const paidBy = new Map<string, number>()
  for (const p of (pays ?? []) as any[]) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))

  const today = now.toISOString().slice(0, 10)
  const buckets: Record<AgingBucket['key'], AgingBucket> = {
    current: { key: 'current', count: 0, usd: 0 },
    d1_30: { key: 'd1_30', count: 0, usd: 0 },
    d31_60: { key: 'd31_60', count: 0, usd: 0 },
    d60_plus: { key: 'd60_plus', count: 0, usd: 0 },
  }
  for (const inv of (openInvoices ?? []) as any[]) {
    const bal = Number(inv.total_usd ?? 0) - (paidBy.get(inv.id) ?? 0)
    if (bal <= 0.005) continue
    const due = String(inv.due_date)
    let k: AgingBucket['key']
    if (due >= today) k = 'current'
    else {
      const daysPast = Math.floor((new Date(today + 'T12:00:00Z').getTime() - new Date(due + 'T12:00:00Z').getTime()) / 864e5)
      k = daysPast <= 30 ? 'd1_30' : daysPast <= 60 ? 'd31_60' : 'd60_plus'
    }
    buckets[k].count++
    buckets[k].usd += bal
  }
  return [buckets.current, buckets.d1_30, buckets.d31_60, buckets.d60_plus]
}
