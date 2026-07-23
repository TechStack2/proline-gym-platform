import type { SupabaseClient } from '@supabase/supabase-js'
import { OPEN_INVOICE_STATUSES, balanceUsd, invoiceTypeLabel } from '@/lib/billing/reconcile'
import { daysPastDue, agingBucketFor, type AgingKey } from '@/lib/finances/aging'

/**
 * MEMBER-360-ACTIONABLE §4 — the STAFF-ONLY family billing decomposition.
 *
 * Deliberately a SEPARATE aggregation from `getFamilySummaries`: that read is
 * shared with the PORTAL FamilyHome, and this slice must not change a portal
 * read shape by one byte (§4.5 exclusion). This one runs only on the staff
 * guardian page, under staff RLS.
 *
 * Per child: the open invoices oldest-due-first (id + age bucket + balance —
 * the same 000110 bucket truth as everywhere else), the oldest age, the last
 * payment, and the DRIVER fragments (§4.2 — "the sentence staff say out loud":
 * open balances grouped by product type).
 */

export type FamilyOpenInvoice = {
  id: string
  studentId: string
  invoiceNumber: string
  invoiceType: string | null
  dueDate: string | null
  balanceUsd: number
  exchangeRate: number | null
  bucket: AgingKey
  ageDays: number
}

export type ChildBillingDetail = {
  studentId: string
  openInvoices: FamilyOpenInvoice[]
  oldestDays: number
  oldestInvoiceId: string | null
  lastPayment: { date: string; amountUsd: number; invoiceId: string | null } | null
  /** localized "PT package $300 + 2× class month" driver sentence */
  driver: string
  /** the nearest upcoming bill: boundary date + that product's fee (§4.4 slot) */
  nextBill: { date: string; amountUsd: number | null } | null
}

export async function getFamilyBillingDetail(
  supabase: SupabaseClient,
  studentIds: string[],
  locale: string,
): Promise<Map<string, ChildBillingDetail>> {
  const out = new Map<string, ChildBillingDetail>()
  if (studentIds.length === 0) return out

  const [{ data: invRows }, { data: lastPays }, { data: regRows }, { data: memRows }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, student_id, invoice_number, invoice_type, total_usd, due_date, exchange_rate')
      .in('student_id', studentIds)
      .in('status', [...OPEN_INVOICE_STATUSES])
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('payments')
      .select('student_id, invoice_id, amount_usd, payment_date')
      .in('student_id', studentIds)
      .order('payment_date', { ascending: false })
      .limit(Math.max(50, studentIds.length * 10)),
    supabase
      .from('class_registrations')
      .select('student_id, status, monthly_fee_usd, discount_pct, discount_amount_usd, paid_until, end_date')
      .in('student_id', studentIds)
      .eq('status', 'active'),
    supabase
      .from('student_memberships')
      .select('student_id, status, end_date, membership_plans:plan_id (price_usd)')
      .in('student_id', studentIds)
      .eq('status', 'active'),
  ])

  const openIds = ((invRows ?? []) as any[]).map((i) => i.id)
  const { data: pays } = openIds.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', openIds)
    : { data: [] as any[] }
  const paidBy = new Map<string, number>()
  for (const p of (pays ?? []) as any[]) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))

  const byStudent = new Map<string, FamilyOpenInvoice[]>()
  for (const inv of ((invRows ?? []) as any[])) {
    const bal = balanceUsd(inv.total_usd, [{ amount_usd: paidBy.get(inv.id) ?? 0 }])
    if (bal <= 0.005) continue
    const list = byStudent.get(inv.student_id) ?? []
    list.push({
      id: inv.id,
      studentId: inv.student_id,
      invoiceNumber: inv.invoice_number,
      invoiceType: inv.invoice_type ?? null,
      dueDate: inv.due_date ?? null,
      balanceUsd: bal,
      exchangeRate: inv.exchange_rate ?? null,
      bucket: agingBucketFor(inv.due_date),
      ageDays: daysPastDue(inv.due_date),
    })
    byStudent.set(inv.student_id, list)
  }

  const lastPayBy = new Map<string, any>()
  for (const p of ((lastPays ?? []) as any[])) {
    if (!lastPayBy.has(p.student_id)) lastPayBy.set(p.student_id, p)
  }

  for (const sid of studentIds) {
    const open = byStudent.get(sid) ?? []
    // driver fragments: balance per product type, largest first
    const byType = new Map<string, { n: number; usd: number }>()
    for (const inv of open) {
      const key = inv.invoiceType ?? 'other'
      const cur = byType.get(key) ?? { n: 0, usd: 0 }
      cur.n += 1
      cur.usd += inv.balanceUsd
      byType.set(key, cur)
    }
    const driver = [...byType.entries()]
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([ty, v]) => `${v.n > 1 ? `${v.n}× ` : ''}${invoiceTypeLabel(ty, locale)} $${v.usd.toFixed(2)}`)
      .join(' + ')
    const lp = lastPayBy.get(sid)
    // nearest upcoming boundary across the child's ACTIVE products, with its fee
    const todayIso = new Date().toISOString().slice(0, 10)
    const bills: { date: string; amountUsd: number | null }[] = []
    for (const r of ((regRows ?? []) as any[]).filter((row) => row.student_id === sid)) {
      const d = r.paid_until ?? r.end_date
      if (!d) continue
      const fee = r.monthly_fee_usd != null
        ? Math.max(0, Number(r.monthly_fee_usd) * (1 - Number(r.discount_pct ?? 0) / 100) - Number(r.discount_amount_usd ?? 0))
        : null
      bills.push({ date: String(d).slice(0, 10), amountUsd: fee })
    }
    for (const m of ((memRows ?? []) as any[]).filter((row) => row.student_id === sid)) {
      if (!m.end_date) continue
      const priceRaw = (Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans)?.price_usd
      bills.push({ date: String(m.end_date).slice(0, 10), amountUsd: priceRaw != null ? Number(priceRaw) : null })
    }
    bills.sort((a, b) => a.date.localeCompare(b.date))
    const nextBill = bills.find((b) => b.date >= todayIso) ?? bills[bills.length - 1] ?? null
    out.set(sid, {
      studentId: sid,
      openInvoices: open,
      oldestDays: open.length ? open[0].ageDays : 0,
      oldestInvoiceId: open.length ? open[0].id : null,
      lastPayment: lp ? { date: lp.payment_date, amountUsd: Number(lp.amount_usd ?? 0), invoiceId: lp.invoice_id ?? null } : null,
      driver,
      nextBill,
    })
  }
  return out
}
