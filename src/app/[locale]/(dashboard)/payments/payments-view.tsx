import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Banknote, Printer } from 'lucide-react'
import Link from 'next/link'
import { localizedName } from '@/lib/names'
import { METHOD_LABEL } from '@/lib/billing/reconcile'
import { fmtDate as fmtDateLoc, fmtWeekday } from '@/lib/fmt'
import { fmtUsd, fmtLbp } from '@/lib/billing/currency'
import { Ltr } from '@/components/ui/bdi'
import { PaymentsRangeDialog } from './payments-range-dialog'

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
 * RLS (payments_staff_gym). Filterable by date range + method. Arabic-RTL.
 *
 * MONEY-MOBILE (§5): below 768px the history renders as CARD rows so nothing floats
 * past a 390px viewport; at ≥768px the table returns inside an overflow-x container
 * (the page body never scrolls horizontally). R4: the two native date inputs become
 * an 8-day quick-range chip row (the W3a coach pattern) plus a Custom-range Dialog
 * that keeps the natives wrapped; the ≤8 method chips + their date-preservation are
 * unchanged.
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

  // R4: the date filter as an 8-day quick-range (the W3a coach pattern) — today back
  // through −7, newest first. Each chip filters to that single day (from=to=day) and
  // preserves the method; tapping the active chip clears the date filter. Arbitrary
  // ranges live in the Custom-range Dialog below (the natives stay wrapped there).
  const dayChips: string[] = Array.from({ length: 8 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  const todayStr = dayChips[0]
  const rangeHref = (d: string | undefined) => {
    const p = new URLSearchParams({ tab: 'payments' })
    if (searchParams.method) p.set('method', searchParams.method)
    if (d) { p.set('from', d); p.set('to', d) }
    return `/${locale}/money?${p.toString()}`
  }
  const dayActive = (d: string) => searchParams.from === d && searchParams.to === d

  const methodChips = [{ value: '', label: t('All methods', 'كل الطرق', 'Toutes les méthodes') }, ...METHODS.map((m) => ({ value: m as string, label: methodLabel(m) }))]

  const receiptLink = (inv: { id: string; invoice_number: string } | null) =>
    inv ? (
      <span className="inline-flex items-center gap-2">
        <Link href={`/${locale}/invoices/${inv.id}`} className="whitespace-nowrap font-mono tabular-nums text-primary-700 hover:underline">{inv.invoice_number}</Link>
        <Link href={`/${locale}/invoices/${inv.id}/receipt`} data-testid="payment-receipt-link"
          title={t('Print receipt', 'طباعة الإيصال', 'Imprimer le reçu')}
          className="text-muted-foreground hover:text-foreground">
          <Printer className="h-3.5 w-3.5" />
        </Link>
      </span>
    ) : <span className="text-muted-foreground">—</span>

  return (
    <div className="space-y-6">
      {/* R4: date filter → 8-day quick-range chips + a Custom-range Dialog (wrapped natives). */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="pay-filter-range">
        {dayChips.map((d, i) => (
          <Link key={d} href={rangeHref(dayActive(d) ? undefined : d)}
            data-testid="pay-range-chip" data-date={d} data-active={dayActive(d) || undefined}
            className={cn(
              'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
              dayActive(d)
                ? 'border-primary-700 bg-primary-700 text-primary-foreground'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
            )}>
            {i === 0
              ? t('Today', 'اليوم', "Aujourd'hui")
              : <Ltr>{`${fmtWeekday(new Date(d + 'T12:00:00Z').getUTCDay(), locale)} ${fmtDateLoc(d, locale, 'dayMonth')}`}</Ltr>}
          </Link>
        ))}
        <PaymentsRangeDialog
          locale={locale}
          from={searchParams.from}
          to={searchParams.to}
          method={searchParams.method}
          labels={{
            trigger: t('Custom range', 'نطاق مخصص', 'Plage personnalisée'),
            title: t('Custom date range', 'نطاق تاريخ مخصص', 'Plage de dates'),
            from: t('From', 'من', 'De'),
            to: t('To', 'إلى', 'À'),
            apply: t('Apply', 'تطبيق', 'Appliquer'),
            clear: t('Clear', 'مسح', 'Effacer'),
          }}
        />
      </div>

      {/* §2.6 (W4): the ≤8-method filter is apply-on-tap chip LINKS (server-rendered,
          RTL-safe) — the container keeps the historical testid. */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="pay-filter-method">
        {methodChips.map((m) => {
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
        {t('Total (USD)', 'الإجمالي (دولار)', 'Total (USD)')}: <span className="font-bold tabular-nums text-foreground" data-testid="pay-total">${totalUsd.toFixed(2)}</span> · {rows.length} {t('payments', 'دفعة', 'paiements')}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <Banknote className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-muted-foreground">{t('No payments found.', 'لا توجد مدفوعات.', 'Aucun paiement trouvé.')}</p>
        </div>
      ) : (
        <>
          {/* MOBILE (<768): card rows — hidden at ≥md so the table is the only visible
              `payment-row` there (the double-shell `:visible` rule). */}
          <ul className="space-y-3 md:hidden" data-testid="payments-history">
            {rows.map((p: any) => {
              const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
              const stu = Array.isArray(p.students) ? p.students[0] : p.students
              return (
                <li key={p.id} data-testid="payment-row" className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</span>
                    <span className="text-end font-medium tabular-nums">{fmtUsd(Number(p.amount_usd))}{p.amount_lbp ? ` · ${fmtLbp(Number(p.amount_lbp))}` : ''}</span>
                  </div>
                  <div className="mt-2 text-sm">
                    <Link href={`/${locale}/students/${p.student_id}`} data-testid="payment-member-link" className="hover:underline">
                      {localizedName(stu?.profiles, locale)}
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">{methodLabel(p.payment_method)}</span>
                    {receiptLink(inv)}
                  </div>
                  {p.reference_number && <p className="mt-1 text-[11px] text-muted-foreground">{p.reference_number}</p>}
                </li>
              )
            })}
          </ul>

          {/* DESKTOP (≥768): the table inside an overflow-x container — it scrolls
              within its own card, never the page body. */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-start">
                <th className="p-3">{t('Date', 'التاريخ', 'Date')}</th><th className="p-3">{t('Member', 'العضو', 'Membre')}</th>
                <th className="p-3">{t('Invoice', 'الفاتورة', 'Facture')}</th><th className="p-3">{t('Method', 'الطريقة', 'Méthode')}</th>
                <th className="p-3">{t('Reference', 'المرجع', 'Référence')}</th><th className="p-3 text-end">{t('Amount', 'المبلغ', 'Montant')}</th>
              </tr></thead>
              {/* `payments-history` rides BOTH variants (one is display:none per width)
                  so `:visible` always finds the shown list — ar-admin / member360. */}
              <tbody data-testid="payments-history">
                {rows.map((p: any) => {
                  const inv = Array.isArray(p.invoices) ? p.invoices[0] : p.invoices
                  const stu = Array.isArray(p.students) ? p.students[0] : p.students
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/40" data-testid="payment-row">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtDate(p.payment_date)}</td>
                      <td className="p-3">
                        <Link href={`/${locale}/students/${p.student_id}`} data-testid="payment-member-link" className="hover:underline">
                          {localizedName(stu?.profiles, locale)}
                        </Link>
                      </td>
                      <td className="p-3">{receiptLink(inv)}</td>
                      <td className="p-3 whitespace-nowrap">{methodLabel(p.payment_method)}</td>
                      <td className="p-3 text-muted-foreground">{p.reference_number || '—'}</td>
                      <td className="p-3 text-end font-medium tabular-nums">{fmtUsd(Number(p.amount_usd))}{p.amount_lbp ? ` · ${fmtLbp(Number(p.amount_lbp))}` : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
