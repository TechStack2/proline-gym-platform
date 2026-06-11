import { createClient } from '@/lib/supabase/server'
import { WorkspaceSegments } from '@/components/layout/WorkspaceSegments'
import { cn } from '@/lib/utils'
import { Banknote } from 'lucide-react'
import Link from 'next/link'
import { localizedName } from '@/lib/names'
import { METHOD_LABEL } from '@/lib/billing/reconcile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: { locale: string }
  searchParams: { method?: string; from?: string; to?: string }
}

const METHODS = ['cash_usd', 'cash_lbp', 'omt', 'whish', 'bank_transfer', 'bob_finance'] as const

/**
 * Payments-history / audit view (Cycle 5 / V1 / AR — rebuild of the DOA husk).
 *
 * The legacy page queried payments.amount/.currency/.status and students.first_name
 * — none of which exist — and filtered with a top-level .or() over embedded columns,
 * so it never rendered. Rebuilt against the real schema: each payment row written by
 * D1's record_payment carries date · method · reference · amount (USD+LBP) · the
 * linked invoice # · the member (via students→profiles). Staff-only + gym-scoped by
 * RLS (payments_staff_gym). Filterable by date range + method (pairs with D1's
 * per-method daily tally on /invoices). Arabic-RTL.
 */
export default async function PaymentsHistoryPage({ params: { locale }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string) => (isRTL ? ar : en)
  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select(`
      id, amount_usd, amount_lbp, payment_method, payment_date, reference_number,
      invoices(id, invoice_number),
      students(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))
    `)
    .order('payment_date', { ascending: false })
    .limit(200)

  if (searchParams.method) query = query.eq('payment_method', searchParams.method)
  if (searchParams.from) query = query.gte('payment_date', searchParams.from)
  if (searchParams.to) query = query.lte('payment_date', searchParams.to)

  const { data: payments } = await query
  const rows = payments ?? []

  const totalUsd = rows.reduce((s, p: any) => s + Number(p.amount_usd ?? 0), 0)
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US') : '—')
  const methodLabel = (m: string) => (isRTL ? METHOD_LABEL[m]?.ar : METHOD_LABEL[m]?.en) || m

  return (
    <div className={cn('space-y-6 p-6', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('Payments', 'المدفوعات')}</h1>
          <p className="text-muted-foreground">{t('Recorded payments across the gym — the settlement audit trail.', 'المدفوعات المسجّلة في النادي — سجل تدقيق التسويات.')}</p>
        </div>
        <WorkspaceSegments
          locale={locale}
          active="payments"
          segments={[
            { key: 'payments', label: t('Payments', 'المدفوعات'), path: '/payments' },
            { key: 'invoices', label: t('Invoices', 'الفواتير'), path: '/invoices' },
          ]}
        />
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3" action={`/${locale}/payments`} method="get">
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">{t('From', 'من')}</label>
          <input type="date" name="from" defaultValue={searchParams.from ?? ''} data-testid="pay-filter-from"
            className="h-9 rounded-md border px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">{t('To', 'إلى')}</label>
          <input type="date" name="to" defaultValue={searchParams.to ?? ''} data-testid="pay-filter-to"
            className="h-9 rounded-md border px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">{t('Method', 'الطريقة')}</label>
          <select name="method" defaultValue={searchParams.method ?? ''} data-testid="pay-filter-method"
            className="h-9 rounded-md border px-3 text-sm">
            <option value="">{t('All methods', 'كل الطرق')}</option>
            {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
          </select>
        </div>
        <button className="h-9 rounded-md bg-[#cd1419] px-4 text-sm font-medium text-white hover:bg-[#a81014]">{t('Filter', 'تصفية')}</button>
        <Link href={`/${locale}/payments`} className="h-9 rounded-md border px-4 text-sm leading-9 hover:bg-muted">{t('Clear', 'مسح')}</Link>
      </form>

      <p className="text-sm text-muted-foreground">
        {t('Total (USD)', 'الإجمالي (دولار)')}: <span className="font-bold text-foreground" data-testid="pay-total">${totalUsd.toFixed(2)}</span> · {rows.length} {t('payments', 'دفعة')}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <Banknote className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-muted-foreground">{t('No payments found.', 'لا توجد مدفوعات.')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left">
              <th className="p-3">{t('Date', 'التاريخ')}</th><th className="p-3">{t('Member', 'العضو')}</th>
              <th className="p-3">{t('Invoice', 'الفاتورة')}</th><th className="p-3">{t('Method', 'الطريقة')}</th>
              <th className="p-3">{t('Reference', 'المرجع')}</th><th className="p-3">{t('Amount', 'المبلغ')}</th>
            </tr></thead>
            <tbody data-testid="payments-history">
              {rows.map((p: any) => {
                const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
                const stu = Array.isArray(p.students) ? p.students[0] : p.students
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/40" data-testid="payment-row">
                    <td className="p-3 text-muted-foreground">{fmtDate(p.payment_date)}</td>
                    <td className="p-3">{localizedName(stu?.profiles, locale)}</td>
                    <td className="p-3">
                      {inv ? (
                        <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-[#cd1419] hover:underline">{inv.invoice_number}</Link>
                      ) : '—'}
                    </td>
                    <td className="p-3">{methodLabel(p.payment_method)}</td>
                    <td className="p-3 text-muted-foreground">{p.reference_number || '—'}</td>
                    <td className="p-3 font-medium">${Number(p.amount_usd).toFixed(2)}{p.amount_lbp ? ` · ${Number(p.amount_lbp).toLocaleString()} LBP` : ''}</td>
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
