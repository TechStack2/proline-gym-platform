import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import type { Funnel } from '@/lib/growth/funnel'

/**
 * GRW-1 funnel strip (Prospects) — conversion rate (period-scoped, month
 * default) + by-source / by-campaign breakdown (leads → trials → converted).
 * Tables+numbers per docs/design-system.md. Pure render; the parent computes.
 */
// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const Table = ({ title, rows, testid, t, isRTL }: { title: string; rows: Funnel['bySource']; testid: string; t: Awaited<ReturnType<typeof getTranslations>>; isRTL: boolean }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <h3 className={cn('mb-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{title}</h3>
    {rows.length === 0 ? (
      <p className="py-3 text-center text-sm text-gray-400">{t('noData')}</p>
    ) : (
      <table className="w-full text-sm" data-testid={testid}>
        <thead>
          <tr className="border-b text-gray-500">
            <th className="p-1.5 text-start font-medium">{title}</th>
            <th className="p-1.5 text-end font-medium">{t('leads')}</th>
            <th className="p-1.5 text-end font-medium">{t('trials')}</th>
            <th className="p-1.5 text-end font-medium">{t('converted')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0" data-testid={`${testid}-row`} data-key={r.key}>
              <td className="p-1.5 font-medium text-gray-700">{r.label}</td>
              <td className="p-1.5 text-end text-gray-600" data-testid="row-leads">{r.leads}</td>
              <td className="p-1.5 text-end text-gray-600">{r.trials}</td>
              <td className="p-1.5 text-end font-semibold text-green-600" data-testid="row-converted">{r.converted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)
export async function FunnelStrip({ funnel, locale }: { funnel: Funnel; locale: string }) {
  const t = await getTranslations('growth')
  const isRTL = locale === 'ar'
  const pct = (funnel.conversionRate * 100).toFixed(funnel.conversionRate === 0 ? 0 : 1)

  return (
    <div className={cn('space-y-3', isRTL && 'text-right')} data-testid="funnel-strip">
      {/* Conversion headline (this month) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-2xs font-medium uppercase tracking-wider text-gray-400">{t('leadsThisMonth')}</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900" data-testid="funnel-leads">{funnel.totalLeads}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-2xs font-medium uppercase tracking-wider text-gray-400">{t('converted')}</p>
          <p className="mt-0.5 text-2xl font-bold text-green-600" data-testid="funnel-converted">{funnel.converted}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-2xs font-medium uppercase tracking-wider text-gray-400">{t('conversionRate')}</p>
          <p className="mt-0.5 text-2xl font-bold text-primary-700" data-testid="funnel-rate">{pct}%</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Table title={t('bySource')} rows={funnel.bySource} testid="funnel-by-source" t={t} isRTL={isRTL} />
        <Table title={t('byCampaign')} rows={funnel.byCampaign} testid="funnel-by-campaign" t={t} isRTL={isRTL} />
      </div>
    </div>
  )
}
