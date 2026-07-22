import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Banknote, Printer } from 'lucide-react'
import Link from 'next/link'
import { localizedName } from '@/lib/names'
import { METHOD_LABEL } from '@/lib/billing/reconcile'
import { fmtDate as fmtDateLoc } from '@/lib/fmt'
import { fmtUsd, fmtLbp } from '@/lib/billing/currency'

type Props = {
  locale: string
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
export async function PaymentsView({ locale, searchParams }: Props) {
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select(`
      id, student_id, amount_usd, amount_lbp, payment_method, payment_date, reference_number,
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
  const fmtDate = (d: string | null) => fmtDateLoc(d, locale)
  const methodLabel = (m: string) => (locale === 'ar' ? METHOD_LABEL[m]?.ar : locale === 'fr' ? METHOD_LABEL[m]?.fr : METHOD_LABEL[m]?.en) || m

  // §2.6 (W4): the method filter's chip links — preserve the date range, toggle the
  // method (tapping the active chip clears it), same searchParams mechanics as the
  // W3b schedule chips.
  const methodHref = (method: string | undefined) => {
    const p = new URLSearchParams({ tab: 'payments' })
    if (searchParams.from) p.set('from', searchParams.from)
    if (searchParams.to) p.set('to', searchParams.to)
    if (method) p.set('method', method)
    return `/${locale}/money?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3" action={`/${locale}/money`} method="get">
        <input type="hidden" name="tab" value="payments" />
        {searchParams.method && <input type="hidden" name="method" value={searchParams.method} />}
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">{t('From', 'من', 'De')}</label>
          <input type="date" name="from" defaultValue={searchParams.from ?? ''} data-testid="pay-filter-from"
            className="h-9 rounded-md border px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">{t('To', 'إلى', 'À')}</label>
          <input type="date" name="to" defaultValue={searchParams.to ?? ''} data-testid="pay-filter-to"
            className="h-9 rounded-md border px-3 text-sm" />
        </div>
        <button className="h-9 rounded-md bg-primary-700 px-4 text-sm font-medium text-primary-foreground hover:bg-primary-800">{t('Filter', 'تصفية', 'Filtrer')}</button>
        <Link href={`/${locale}/money?tab=payments`} className="h-9 rounded-md border px-4 text-sm leading-9 hover:bg-muted">{t('Clear', 'مسح', 'Effacer')}</Link>
      </form>

      {/* §2.6 (W4): the ≤8-method filter is apply-on-tap chip LINKS (server-rendered,
          RTL-safe) — the container keeps the historical testid. */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="pay-filter-method">
        {[{ value: '', label: t('All methods', 'كل الطرق', 'Toutes les méthodes') }, ...METHODS.map((m) => ({ value: m as string, label: methodLabel(m) }))].map((m) => {
          const active = m.value ? searchParams.method === m.value : !searchParams.method
          return (
            <Link key={m.value || 'all'} href={methodHref(!m.value || searchParams.method === m.value ? undefined : m.value)}
              data-testid="pay-method-chip" data-method={m.value} data-active={active || undefined}
              className={cn(
                'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
                active
                  ? 'border-primary-700 bg-primary-700 text-primary-foreground'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
              )}>
              {m.label}
            </Link>
          )
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        {t('Total (USD)', 'الإجمالي (دولار)', 'Total (USD)')}: <span className="font-bold text-foreground" data-testid="pay-total">${totalUsd.toFixed(2)}</span> · {rows.length} {t('payments', 'دفعة', 'paiements')}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <Banknote className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-muted-foreground">{t('No payments found.', 'لا توجد مدفوعات.', 'Aucun paiement trouvé.')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-start">
              <th className="p-3">{t('Date', 'التاريخ', 'Date')}</th><th className="p-3">{t('Member', 'العضو', 'Membre')}</th>
              <th className="p-3">{t('Invoice', 'الفاتورة', 'Facture')}</th><th className="p-3">{t('Method', 'الطريقة', 'Méthode')}</th>
              <th className="p-3">{t('Reference', 'المرجع', 'Référence')}</th><th className="p-3">{t('Amount', 'المبلغ', 'Montant')}</th>
            </tr></thead>
            <tbody data-testid="payments-history">
              {rows.map((p: any) => {
                const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
                const stu = Array.isArray(p.students) ? p.students[0] : p.students
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/40" data-testid="payment-row">
                    <td className="p-3 text-muted-foreground">{fmtDate(p.payment_date)}</td>
                    <td className="p-3">
                      <Link href={`/${locale}/students/${p.student_id}`} data-testid="payment-member-link" className="hover:underline">
                        {localizedName(stu?.profiles, locale)}
                      </Link>
                    </td>
                    <td className="p-3">
                      {inv ? (
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono text-primary-700 hover:underline">{inv.invoice_number}</Link>
                          <Link href={`/${locale}/invoices/${inv.id}/receipt`} data-testid="payment-receipt-link"
                            title={t('Print receipt', 'طباعة الإيصال', 'Imprimer le reçu')}
                            className="text-muted-foreground hover:text-foreground">
                            <Printer className="h-3.5 w-3.5" />
                          </Link>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-3">{methodLabel(p.payment_method)}</td>
                    <td className="p-3 text-muted-foreground">{p.reference_number || '—'}</td>
                    <td className="p-3 font-medium">{fmtUsd(Number(p.amount_usd))}{p.amount_lbp ? ` · ${fmtLbp(Number(p.amount_lbp))}` : ''}</td>
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
