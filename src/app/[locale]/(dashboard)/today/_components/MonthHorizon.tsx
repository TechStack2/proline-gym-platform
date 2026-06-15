import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { ActionCard, ActionRow } from '@/components/dashboard/action-card'
import { horizonEndDate } from '@/lib/finances/horizon'
import { getRevenueByMonth, getOutstandingAging, PRODUCTS } from '@/lib/finances/owner'
import { getMemberMovement, getMonthExtras, getRenewalsInWindow } from '@/lib/finances/horizon-cards'
import { getFunnel, monthStartISO } from '@/lib/growth/funnel'
import {
  BarChart3, ArrowLeftRight, Target, AlertTriangle, Activity, RefreshCw, Sparkles, ChevronRight, TrendingUp, TrendingDown,
} from 'lucide-react'

/**
 * This Month — "grow & diagnose" (strategic lens). A DISTINCT card set: revenue
 * MTD by product vs last month · new members vs churn + win-back recovered ·
 * lead→member conversion · outstanding/aging · active-member trend · renewals
 * due rest-of-month · month-at-a-glance (PT sold · camp signups · avg fill).
 * All read-time, reusing the FIN-1 owner/win-back + GRW-1 funnel helpers.
 */
export async function MonthHorizon({ locale, gymId }: { locale: string; gymId: string }) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const now = new Date()
  const dayStart = now.toISOString().slice(0, 10)
  const monthEnd = horizonEndDate('month', now) // +30d (forward renewals window)

  const [revenue, movement, funnel, aging, renewals, extras] = await Promise.all([
    getRevenueByMonth(supabase, gymId, 2), // [current, last]
    getMemberMovement(supabase, gymId, locale, now),
    getFunnel(supabase, gymId, monthStartISO(now)),
    getOutstandingAging(supabase, gymId, now),
    getRenewalsInWindow(supabase, gymId, locale, dayStart, monthEnd),
    getMonthExtras(supabase, gymId, locale, now),
  ])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale))
  const pct = (n: number) => Math.round(n)
  const cur = revenue[0] ?? { byProduct: { membership: 0, class: 0, pt: 0, camp: 0, other: 0 }, total: 0, month: '' }
  const last = revenue[1] ?? { byProduct: { membership: 0, class: 0, pt: 0, camp: 0, other: 0 }, total: 0, month: '' }
  const revProducts = PRODUCTS.filter((p) => (cur.byProduct[p] ?? 0) > 0)
  const revDelta = cur.total - last.total
  const agingTotal = aging.reduce((s, b) => s + b.usd, 0)
  const agingOpen = aging.filter((b) => b.count > 0)
  const Trend = movement.net > 0 ? TrendingUp : movement.net < 0 ? TrendingDown : Activity

  return (
    <div className="space-y-4">
      {/* ── Revenue MTD by product vs last month ── */}
      <ActionCard icon={BarChart3} title={t('month.revenue')} count={revProducts.length}
        badge={`$${cur.total.toFixed(0)}`} emptyText={t('month.noneRevenue')} testid="revenue-product" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="revenue-product-total">
            <span className="text-xs font-medium text-gray-500">{t('month.vsLastMonth')}</span>
            <span className={cn('text-sm font-bold', revDelta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {revDelta >= 0 ? '+' : '−'}${Math.abs(revDelta).toFixed(2)}
            </span>
          </div>
        }>
        {revProducts.map((p) => {
          const d = (cur.byProduct[p] ?? 0) - (last.byProduct[p] ?? 0)
          return (
            <div key={p} data-testid="revenue-product-row" data-product={p}
              className="flex items-center justify-between gap-3 rounded-xl border bg-gray-50/60 px-3 py-2.5">
              <p className="text-sm font-semibold text-gray-900">{t(`month.product.${p}` as any)}</p>
              <p className="shrink-0 text-xs text-gray-500">
                <span className="text-sm font-bold text-gray-900">${(cur.byProduct[p] ?? 0).toFixed(2)}</span>
                {' '}<span className={cn(d >= 0 ? 'text-emerald-600' : 'text-red-600')}>({d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)})</span>
              </p>
            </div>
          )
        })}
      </ActionCard>

      {/* ── New members vs churn + win-back recovered (net movement) ── */}
      <ActionCard icon={ArrowLeftRight} title={t('month.movement')} count={movement.newMembers + movement.churn + movement.recovered}
        badge={t('month.net', { count: movement.net >= 0 ? `+${movement.net}` : `${movement.net}` })}
        emptyText={t('month.noneMovement')} testid="members-churn" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="members-churn-net">
            <span className="text-xs font-medium text-gray-500">{t('month.netLabel')}</span>
            <span className={cn('text-sm font-bold', movement.net >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {movement.net >= 0 ? '+' : ''}{movement.net}
            </span>
          </div>
        }>
        <div className="grid grid-cols-3 gap-2" data-testid="members-churn-stats">
          <div className="rounded-xl border bg-emerald-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-emerald-700" data-testid="movement-new">{movement.newMembers}</p>
            <p className="text-[11px] text-gray-500">{t('month.newMembers')}</p>
          </div>
          <div className="rounded-xl border bg-red-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-red-700" data-testid="movement-churn">{movement.churn}</p>
            <p className="text-[11px] text-gray-500">{t('month.churned')}</p>
          </div>
          <div className="rounded-xl border bg-primary-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-primary-700" data-testid="movement-recovered">{movement.recovered}</p>
            <p className="text-[11px] text-gray-500">{t('month.recovered')}</p>
          </div>
        </div>
      </ActionCard>

      {/* ── Lead → member conversion (month-scoped) ── */}
      <ActionCard icon={Target} title={t('month.conversion')} count={funnel.totalLeads}
        badge={`${pct(funnel.conversionRate * 100)}%`} emptyText={t('month.noneConversion')} testid="conversion-month" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="conversion-month-rate">
            <span className="text-xs font-medium text-gray-500">{t('month.conversionLabel')}</span>
            <span className="text-sm font-bold text-gray-900">
              {t('month.conversionStat', { converted: funnel.converted, leads: funnel.totalLeads, pct: pct(funnel.conversionRate * 100) })}
            </span>
          </div>
        }>
        <ActionRow href={`/${locale}/leads`} testid="conversion-month-row"
          action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
          <p className="text-sm text-gray-800">{t('month.conversionTrials', { trials: funnel.trials, leads: funnel.totalLeads })}</p>
        </ActionRow>
      </ActionCard>

      {/* ── Outstanding / aging ── */}
      <ActionCard icon={AlertTriangle} title={t('month.aging')} count={agingOpen.reduce((s, b) => s + b.count, 0)}
        badge={`$${agingTotal.toFixed(0)}`} emptyText={t('month.noneAging')} testid="aging-month" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="aging-month-total">
            <span className="text-xs font-medium text-gray-500">{t('month.agingTotal')}</span>
            <span className="text-sm font-bold text-gray-900">${agingTotal.toFixed(2)}</span>
          </div>
        }>
        {agingOpen.map((b) => (
          <ActionRow key={b.key} href={`/${locale}/money?tab=invoices&aging=${b.key}`} testid="aging-month-row"
            action={<span className="shrink-0 text-sm font-bold text-gray-900">${b.usd.toFixed(2)}</span>}>
            <p className="text-sm font-semibold text-gray-900" data-bucket={b.key}>{t(`month.agingBucket.${b.key}` as any)}</p>
            <p className="text-xs text-gray-500">{t('month.agingCount', { count: b.count })}</p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Active-member trend (now vs net this month) ── */}
      <ActionCard icon={Activity} title={t('month.activeTrend')} count={movement.activeNow}
        badge={`${movement.activeNow}`} emptyText={t('month.noneActive')} testid="active-trend" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="active-trend-delta">
            <span className="text-xs font-medium text-gray-500">{t('month.thisMonthLabel')}</span>
            <span className={cn('inline-flex items-center gap-1 text-sm font-bold',
              movement.net > 0 ? 'text-emerald-600' : movement.net < 0 ? 'text-red-600' : 'text-gray-500')}>
              <Trend className="h-3.5 w-3.5" />
              {movement.net > 0 ? t('month.trendUp', { count: movement.net })
                : movement.net < 0 ? t('month.trendDown', { count: movement.net })
                : t('month.trendFlat')}
            </span>
          </div>
        }>
        <div className="rounded-xl border bg-gray-50/60 px-3 py-2.5">
          <p className="text-2xl font-bold text-gray-900" data-testid="active-now">{movement.activeNow}</p>
          <p className="text-xs text-gray-500">{t('month.activeStat')}</p>
        </div>
      </ActionCard>

      {/* ── Renewals due rest-of-month (forward revenue) ── */}
      <ActionCard icon={RefreshCw} title={t('month.renewals')} count={renewals.rows.length}
        emptyText={t('month.noneRenewals')} testid="renewals-month" isRTL={isRTL}
        footer={renewals.rows.length > 0 ? (
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="renewals-month-projected">
            <span className="text-xs font-medium text-gray-500">{t('month.projectedMonth')}</span>
            <span className="text-sm font-bold text-gray-900">${renewals.projectedUsd.toFixed(2)}</span>
          </div>
        ) : undefined}>
        {renewals.rows.map((r, i) => (
          <ActionRow key={`${r.kind}-${r.studentId}-${i}`} href={`/${locale}/students/${r.studentId}`} testid="renewals-month-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="truncate text-sm font-semibold text-gray-900" data-kind={r.kind}>{r.name}</p>
            <p className="text-xs text-gray-500">
              {r.kind === 'membership' ? t('week.membershipKind') : t('week.classKind')}
              {r.label ? ` · ${r.label}` : ''} · {t('week.endsOn', { date: fmtDate(r.endDate) })}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Month at a glance: PT sold · camp signups · avg class fill ── */}
      <ActionCard icon={Sparkles} title={t('month.extras')} count={1}
        badge={`${extras.avgUtilPct}%`} emptyText={t('month.noneExtras')} testid="growth-month" isRTL={isRTL}>
        <div className="grid grid-cols-3 gap-2" data-testid="growth-month-stats">
          <div className="rounded-xl border bg-gray-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-gray-900" data-testid="growth-pt-sold">{extras.ptSold}</p>
            <p className="text-[11px] text-gray-500">{t('month.ptSold')}</p>
          </div>
          <div className="rounded-xl border bg-gray-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-gray-900" data-testid="growth-camp-signups">{extras.campSignups}</p>
            <p className="text-[11px] text-gray-500">{t('month.campSignups')}</p>
          </div>
          <div className="rounded-xl border bg-gray-50/60 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-gray-900" data-testid="growth-utilization">{extras.avgUtilPct}%</p>
            <p className="text-[11px] text-gray-500">{t('month.utilization')}</p>
          </div>
        </div>
      </ActionCard>
    </div>
  )
}
