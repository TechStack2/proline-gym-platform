import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { fmtUsdCompact, fmtLbpCompact } from '@/lib/fmt'
import { METHOD_LABEL } from '@/lib/billing/reconcile'
import { type CurrencyPref } from '@/lib/billing/currency'
import { getRevenueByMonth, getCollectionsByMethod, getOutstandingAging, PRODUCTS, type Product } from '@/lib/finances/owner'
import { getChurnByMonth } from '@/lib/finances/winback'
import { getEnabledProducts } from '@/lib/gym/products'
import { fmtDate, fmtMoney } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'

/**
 * FIN-1 owner dashboard (Money → Overview). Tables + numbers only (no chart
 * dep), per docs/design-system.md: revenue by month × product, collections by
 * method (this month), outstanding aging with drill-down, churn by month. All
 * reads over D1's ledger + ML-1 state + the FIN-1 churn timestamps.
 */
export async function OwnerFinances({ locale, gymId, pref = 'USD' }: { locale: string; gymId: string; pref?: CurrencyPref }) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('ownerFinances')
  const supabase = await createClient()

  const [revenue, methods, aging, churn, products] = await Promise.all([
    getRevenueByMonth(supabase, gymId, 6),
    getCollectionsByMethod(supabase, gymId),
    getOutstandingAging(supabase, gymId),
    getChurnByMonth(supabase, gymId, 6),
    getEnabledProducts(supabase, gymId),
  ])
  // NO-MEMBERSHIP: drop the membership revenue column + the membership-churn
  // (lapsed) column when the gym doesn't sell membership.
  const revProducts = products.membership ? PRODUCTS : PRODUCTS.filter((p) => p !== 'membership')

  const monthLabel = (mk: string) => fmtDate(`${mk}-01`, locale, 'monthYear')
  const productLabel = (p: Product) => t(`product.${p}` as Parameters<typeof t>[0])
  // MONEY-LBP — compact, whole-figure, preference-aware pair for the dense revenue
  // table (keeps the terse look; adds the LBP line only where it belongs per pref).
  // NOTE: MonthHorizon carries a byte-identical copy of this helper. Folding both
  // into a `fmtMoney` compact mode is Wave-3 work — W1 only isolates the renders.
  const compact = (u: number, l: number): { primary: string; secondary: string | null } => {
    const usdC = fmtUsdCompact(u)
    const lbpC = fmtLbpCompact(l)
    if (pref === 'LBP') return { primary: lbpC, secondary: usdC }
    if (pref === 'BOTH') return { primary: usdC, secondary: lbpC }
    return { primary: usdC, secondary: l !== 0 ? lbpC : null }
  }

  const agingTone: Record<string, string> = {
    current: 'text-gray-700', d1_30: 'text-amber-600', d31_60: 'text-orange-600', d60_plus: 'text-red-600',
  }

  return (
    <div className="mt-6 space-y-6" data-testid="owner-finances">
      {/* ── Revenue by month × product ── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className={cn('mb-3 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('revenueTitle')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="revenue-table">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="p-2 text-start font-medium">{t('month')}</th>
                {revProducts.map((p) => <th key={p} className="p-2 text-end font-medium">{productLabel(p)}</th>)}
                <th className="p-2 text-end font-medium">{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((row) => {
                const totalMoney = compact(row.total, row.totalLbp)
                return (
                <tr key={row.month} className="border-b last:border-0" data-testid="revenue-row" data-month={row.month}>
                  <td className="p-2 font-medium text-gray-700">{monthLabel(row.month)}</td>
                  {revProducts.map((p) => (
                    <td key={p} className="p-2 text-end text-gray-600" data-product={p}>
                      {(row.byProduct[p] > 0 || row.byProductLbp[p] > 0)
                        ? <Ltr>{compact(row.byProduct[p], row.byProductLbp[p]).primary}</Ltr>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="p-2 text-end font-bold text-gray-900" data-testid="revenue-row-total">
                    <Ltr>{totalMoney.primary}</Ltr>
                    {totalMoney.secondary && <span className="block text-2xs font-semibold text-gray-500" data-testid="revenue-row-total-lbp"><Ltr>{totalMoney.secondary}</Ltr></span>}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Collections by method (this month) ── */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className={cn('mb-3 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('methodTitle')}</h2>
          {methods.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">{t('noCollections')}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="method-table">
              {methods.map((m) => {
                const dm = fmtMoney(m.usd, m.lbp, pref)
                return (
                <li key={m.method} className="flex items-center justify-between text-sm" data-testid="method-row" data-method={m.method}>
                  <span className="text-gray-600">{(locale === 'ar' ? METHOD_LABEL[m.method]?.ar : locale === 'fr' ? METHOD_LABEL[m.method]?.fr : METHOD_LABEL[m.method]?.en) || m.method}</span>
                  {/* DA-7: `dir="ltr"` set a base direction but did not ISOLATE, so
                      the two amounts still reordered around the separator. */}
                  <span className="font-semibold text-gray-900" dir="ltr" data-testid="method-amount">
                    <Ltr>{dm.primary}</Ltr>{dm.secondary ? <> · <Ltr>{dm.secondary}</Ltr></> : ''}
                  </span>
                </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Outstanding aging (drill-down) ── */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className={cn('mb-3 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('agingTitle')}</h2>
          <div className="grid grid-cols-2 gap-2" data-testid="aging-grid">
            {aging.map((b) => {
              const dm = fmtMoney(b.usd, b.lbp, pref)
              return (
              <Link key={b.key} href={`/${locale}/money?tab=invoices&aging=${b.key}`}
                data-testid="aging-bucket" data-bucket={b.key}
                className="rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100">
                <p className="text-2xs font-medium uppercase tracking-wider text-gray-500">{t(`aging.${b.key}` as Parameters<typeof t>[0])}</p>
                <p className={cn('mt-0.5 text-lg font-bold', agingTone[b.key])} data-testid="aging-usd"><Ltr>{dm.primary}</Ltr></p>
                {dm.secondary && <p className="text-2xs font-semibold text-gray-500" data-testid="aging-lbp"><Ltr>{dm.secondary}</Ltr></p>}
                <p className="text-2xs text-gray-400">{t('invoiceCount', { count: b.count })}</p>
              </Link>
              )
            })}
          </div>
        </section>
      </div>

      {/* ── Churn by month ── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className={cn('mb-3 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('churnTitle')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="churn-table">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="p-2 text-start font-medium">{t('month')}</th>
                {products.membership && <th className="p-2 text-end font-medium">{t('churn.lapsed')}</th>}
                {/* NO-MEMBERSHIP-GAPS: the churn breakdown is membership-domain
                    framing (audit) — a classes+PT gym keeps only the total. */}
                {products.membership && <th className="p-2 text-end font-medium">{t('churn.cancelled')}</th>}
                {products.membership && <th className="p-2 text-end font-medium">{t('churn.suspended')}</th>}
                <th className="p-2 text-end font-medium">{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {churn.map((row) => {
                const total = row.lapsed + row.cancelled + row.suspended
                return (
                  <tr key={row.month} className="border-b last:border-0" data-testid="churn-row" data-month={row.month}>
                    <td className="p-2 font-medium text-gray-700">{monthLabel(row.month)}</td>
                    {products.membership && <td className="p-2 text-end text-gray-600" data-testid="churn-lapsed">{row.lapsed || <span className="text-gray-300">—</span>}</td>}
                    {products.membership && <td className="p-2 text-end text-gray-600">{row.cancelled || <span className="text-gray-300">—</span>}</td>}
                    {products.membership && <td className="p-2 text-end text-gray-600">{row.suspended || <span className="text-gray-300">—</span>}</td>}
                    <td className="p-2 text-end font-bold text-gray-900">{total || <span className="text-gray-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {products.membership && (
          <Link href={`/${locale}/money?tab=winback`} data-testid="churn-winback-link"
            className="mt-3 inline-block text-xs font-medium text-primary-600 hover:underline">
            {t('toWinback')}
          </Link>
        )}
      </section>
    </div>
  )
}
