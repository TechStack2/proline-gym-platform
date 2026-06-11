import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Plus, FileText } from 'lucide-react'
import { balanceUsd, localizedName, STATUS_BADGE, statusLabel, METHOD_LABEL } from '@/lib/billing/reconcile'

type Props = { locale: string; searchParams: { search?: string; status?: string } }

/**
 * /invoices (D1 repair). The as-is page was DOA — it queried students.first_name
 * (name lives on profiles), invoice.issue_date (the column is created_at), and an
 * embedded PostgREST .or() across a join (unsupported). Rebuilt against the real
 * schema with the canonical reconcile: status + balance are derived from
 * Σ payments. Adds an outstanding-balances summary and a per-method daily tally
 * (the cash drawer: USD/LBP/OMT/Whish/…).
 */
export async function InvoicesView({ locale, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string) => (isRTL ? ar : en)
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, total_usd, status, due_date, created_at, student_id, payer_profile_id,
      students(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
    .order('created_at', { ascending: false })
    .limit(100)

  const invList = invoices ?? []
  const ids = invList.map((i) => i.id)

  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }

  const paidByInvoice = new Map<string, number>()
  for (const p of pays ?? []) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }
  const balOf = (inv: { id: string; total_usd: number | null }) =>
    balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])

  // Outstanding = Σ balance over still-collectible invoices.
  const outstanding = invList
    .filter((i) => ['pending', 'partial', 'overdue'].includes(i.status))
    .reduce((s, i) => s + balOf(i), 0)

  // Per-method daily tally (today's drawer).
  const today = new Date().toISOString().slice(0, 10)
  const { data: todayPays } = await supabase
    .from('payments')
    .select('amount_usd, amount_lbp, payment_method')
    .gte('payment_date', today)
  const tally = new Map<string, { usd: number; lbp: number }>()
  for (const p of (todayPays ?? []) as any[]) {
    const cur = tally.get(p.payment_method) ?? { usd: 0, lbp: 0 }
    cur.usd += Number(p.amount_usd ?? 0)
    cur.lbp += Number(p.amount_lbp ?? 0)
    tally.set(p.payment_method, cur)
  }

  const search = (searchParams.search ?? '').toLowerCase()
  const statusFilter = searchParams.status ?? ''
  const filtered = invList.filter((inv: any) => {
    const profRow = inv.students?.profiles
    const profile = Array.isArray(profRow) ? profRow[0] : profRow
    const name = localizedName(profile, locale).toLowerCase()
    const matchSearch = !search || name.includes(search) || (inv.invoice_number || '').toLowerCase().includes(search)
    const matchStatus = !statusFilter || inv.status === statusFilter
    return matchSearch && matchStatus
  })

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US') : '—')

  return (
    <div className={cn('space-y-6', isRTL && 'rtl text-right')}>
      <div className="flex items-center justify-end">
        <Link href={`/${locale}/invoices/new`} data-testid="new-invoice-btn"
          className="inline-flex items-center rounded-md bg-[#cd1419] px-4 py-2 text-sm font-medium text-white hover:bg-[#a81014]">
          <Plus className="mr-2 h-4 w-4" /> {t('New invoice', 'فاتورة جديدة')}
        </Link>
      </div>

      {/* Outstanding + daily tally */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('Outstanding balance', 'الرصيد المستحق')}</p>
          <p className="mt-1 text-2xl font-bold text-red-600" data-testid="outstanding-total">${outstanding.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-xs text-muted-foreground">{t("Today's collections (by method)", 'تحصيلات اليوم (حسب الطريقة)')}</p>
          <div className="flex flex-wrap gap-3 text-sm" data-testid="daily-tally">
            {tally.size === 0 ? (
              <span className="text-muted-foreground">{t('No payments today.', 'لا مدفوعات اليوم.')}</span>
            ) : (
              [...tally.entries()].map(([method, v]) => (
                <span key={method} className="rounded-full bg-muted px-3 py-1">
                  {(isRTL ? METHOD_LABEL[method]?.ar : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}{v.lbp ? ` · ${v.lbp.toLocaleString()} LBP` : ''}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <form className="flex gap-2" action={`/${locale}/money`} method="get">
        <input type="hidden" name="tab" value="invoices" />
        <input name="search" defaultValue={searchParams.search ?? ''} placeholder={t('Search name or number…', 'ابحث بالاسم أو الرقم…')}
          className="h-9 flex-1 rounded-md border px-3 text-sm" data-testid="invoice-search" />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">{t('Search', 'بحث')}</button>
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-muted-foreground">{t('No invoices found.', 'لا توجد فواتير.')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left">
              <th className="p-3">{t('Number', 'الرقم')}</th><th className="p-3">{t('Member', 'العضو')}</th>
              <th className="p-3">{t('Total', 'الإجمالي')}</th><th className="p-3">{t('Balance', 'الرصيد')}</th>
              <th className="p-3">{t('Due', 'الاستحقاق')}</th><th className="p-3">{t('Status', 'الحالة')}</th>
            </tr></thead>
            <tbody data-testid="invoice-list">
              {filtered.map((inv: any) => {
                const profRow = inv.students?.profiles
                const profile = Array.isArray(profRow) ? profRow[0] : profRow
                const bal = balOf(inv)
                return (
                  <tr key={inv.id} className="border-b hover:bg-muted/40" data-testid="invoice-row" data-invoice-number={inv.invoice_number}>
                    <td className="p-3">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono font-medium text-[#cd1419] hover:underline">{inv.invoice_number}</Link>
                    </td>
                    <td className="p-3">
                      <Link href={`/${locale}/students/${inv.student_id}`} data-testid="invoice-member-link" className="hover:underline">
                        {localizedName(profile, locale)}
                      </Link>
                      {inv.payer_profile_id && (
                        <span className="block text-[10px] text-gray-400" data-testid="invoice-payer">
                          {t('Payer', 'الدافع')}: {localizedName(Array.isArray(inv.payer) ? inv.payer[0] : inv.payer, locale)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-medium">${Number(inv.total_usd).toFixed(2)}</td>
                    <td className={cn('p-3 font-medium', bal > 0 ? 'text-red-600' : 'text-green-600')}>${bal.toFixed(2)}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(inv.due_date)}</td>
                    <td className="p-3"><span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[inv.status])}>{statusLabel(inv.status, locale)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
