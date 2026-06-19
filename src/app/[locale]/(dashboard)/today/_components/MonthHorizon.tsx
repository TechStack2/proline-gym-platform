import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { ActionCard, ActionRow } from '@/components/dashboard/action-card'
import { DrillDetails } from '@/components/dashboard/drill-details'
import { horizonEndDate } from '@/lib/finances/horizon'
import { getRevenueByMonth, getOutstandingAging, PRODUCTS, type Product } from '@/lib/finances/owner'
import {
  getMemberMovement, getMonthExtras, getRenewalsInWindow, getRevenueRowsThisMonth, getConvertedLeadsThisMonth,
} from '@/lib/finances/horizon-cards'
import { getFunnel, monthStartISO } from '@/lib/growth/funnel'
import {
  BarChart3, ArrowLeftRight, Target, AlertTriangle, Activity, RefreshCw, Sparkles, ChevronRight, ChevronDown, TrendingUp, TrendingDown,
} from 'lucide-react'

/**
 * This Month — "grow & diagnose" (strategic lens). DRILL-360: every headline
 * card now drills into the rows driving the number (inline `<details>` expand or
 * an ActionRow into the owning surface), and revenue/movement RECONCILE — the
 * drilled rows sum/count to the headline. All read-time; reuses the FIN-1
 * owner/win-back + GRW-1 funnel helpers (rows exposed, no new aggregation).
 */
export async function MonthHorizon({ locale, gymId }: { locale: string; gymId: string }) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const now = new Date()
  const dayStart = now.toISOString().slice(0, 10)
  const monthEnd = horizonEndDate('month', now) // +30d (forward renewals window)

  const [revenue, revenueRows, movement, funnel, converted, aging, renewals, extras] = await Promise.all([
    getRevenueByMonth(supabase, gymId, 2), // [current, last]
    getRevenueRowsThisMonth(supabase, gymId, locale, now),
    getMemberMovement(supabase, gymId, locale, now),
    getFunnel(supabase, gymId, monthStartISO(now)),
    getConvertedLeadsThisMonth(supabase, gymId, now),
    getOutstandingAging(supabase, gymId, now),
    getRenewalsInWindow(supabase, gymId, locale, dayStart, monthEnd),
    getMonthExtras(supabase, gymId, locale, now),
  ])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale))
  const pct = (n: number) => Math.round(n)
  const blank = { byProduct: { membership: 0, class: 0, pt: 0, camp: 0, other: 0 }, total: 0, month: '' }
  const cur = revenue[0] ?? blank
  const last = revenue[1] ?? blank
  const revProducts = PRODUCTS.filter((p) => (cur.byProduct[p] ?? 0) > 0)
  const revDelta = cur.total - last.total
  const agingTotal = aging.reduce((s, b) => s + b.usd, 0)
  const agingOpen = aging.filter((b) => b.count > 0)
  const Trend = movement.net > 0 ? TrendingUp : movement.net < 0 ? TrendingDown : Activity
  const stu = (id: string) => `/${locale}/students/${id}`
  const revByProduct = (p: Product) => revenueRows.filter((r) => r.product === p)

  return (
    <div className="space-y-4">
      {/* ── Revenue MTD by product vs last month — each product expands to the
          payments that sum to it (RECONCILES) ── */}
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
          const amt = cur.byProduct[p] ?? 0
          const d = amt - (last.byProduct[p] ?? 0)
          const rows = revByProduct(p)
          return (
            <details key={p} className="rounded-xl border bg-gray-50/60" data-testid="revenue-product-row" data-product={p}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-gray-900">{t(`month.product.${p}` as any)}</span>
                <span className="flex items-center gap-1.5 shrink-0 text-xs text-gray-500">
                  <span className="text-sm font-bold text-gray-900" data-testid="revenue-amount" data-v={amt.toFixed(2)}>${amt.toFixed(2)}</span>
                  <span className={cn(d >= 0 ? 'text-emerald-600' : 'text-red-600')}>({d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)})</span>
                  <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden />
                </span>
              </summary>
              <div className="space-y-1 border-t px-2 py-2">
                {rows.map((r, i) => (
                  <Link key={i} href={stu(r.studentId)} data-testid="revenue-drill-row" data-v={r.amount.toFixed(2)}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                    <span className="min-w-0 truncate text-gray-800">{r.name} · {fmtDate(r.date)}</span>
                    <span className="shrink-0 font-medium text-gray-600">${r.amount.toFixed(2)}</span>
                  </Link>
                ))}
              </div>
            </details>
          )
        })}
      </ActionCard>

      {/* ── New members vs churn + win-back recovered — each segment expands to
          its member set (RECONCILES) ── */}
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
        <DrillDetails testid="movement-drill-new" rowTestid="movement-new-row" isRTL={isRTL} emptyText={t('month.noneNew')}
          summary={<span className="flex items-baseline gap-2"><span className="text-lg font-bold text-emerald-700" data-testid="movement-new">{movement.newMembers}</span><span className="text-sm text-gray-500">{t('month.newMembers')}</span></span>}
          rows={movement.newRows.map((m) => ({ href: stu(m.studentId), left: m.name }))} />
        <DrillDetails testid="movement-drill-churned" rowTestid="movement-churned-row" isRTL={isRTL} emptyText={t('month.noneChurned')}
          summary={<span className="flex items-baseline gap-2"><span className="text-lg font-bold text-red-700" data-testid="movement-churn">{movement.churn}</span><span className="text-sm text-gray-500">{t('month.churned')}</span></span>}
          rows={movement.churnedRows.map((m) => ({ href: stu(m.studentId), left: m.name }))} />
        <DrillDetails testid="movement-drill-recovered" rowTestid="movement-recovered-row" isRTL={isRTL} emptyText={t('month.noneRecovered')}
          summary={<span className="flex items-baseline gap-2"><span className="text-lg font-bold text-primary-700" data-testid="movement-recovered">{movement.recovered}</span><span className="text-sm text-gray-500">{t('month.recovered')}</span></span>}
          rows={movement.recoveredRows.map((m) => ({ href: stu(m.studentId), left: m.name }))} />
      </ActionCard>

      {/* ── Lead → member conversion — expands to the converted leads this month ── */}
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
        <DrillDetails testid="conversion-drill" rowTestid="conversion-drill-row" isRTL={isRTL} emptyText={t('month.noneConverted')}
          summary={<span className="flex items-baseline gap-2"><span className="text-sm font-bold text-gray-900" data-testid="conversion-converted-count">{converted.length}</span><span className="text-sm text-gray-500">{t('month.convertedThisMonth')}</span></span>}
          rows={converted.map((c) => ({
            href: c.studentId ? stu(c.studentId) : `/${locale}/leads`,
            left: c.name, right: c.source ?? undefined,
          }))} />
        <ActionRow href={`/${locale}/leads`} testid="conversion-month-row"
          action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
          <p className="text-sm text-gray-800">{t('month.conversionTrials', { trials: funnel.trials, leads: funnel.totalLeads })}</p>
        </ActionRow>
      </ActionCard>

      {/* ── Outstanding / aging — each bucket drills to its overdue invoices ── */}
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

      {/* ── Active-member trend — expands to the active members (RECONCILES) ── */}
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
        <DrillDetails testid="active-trend-drill" rowTestid="active-trend-row" isRTL={isRTL} emptyText={t('month.noneActive')}
          summary={<span className="flex items-baseline gap-2"><span className="text-2xl font-bold text-gray-900" data-testid="active-now">{movement.activeNow}</span><span className="text-xs text-gray-500">{t('month.activeStat')}</span></span>}
          rows={movement.activeRows.map((m) => ({ href: stu(m.studentId), left: m.name }))} />
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
          <ActionRow key={`${r.kind}-${r.studentId}-${i}`} href={stu(r.studentId)} testid="renewals-month-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="truncate text-sm font-semibold text-gray-900" data-kind={r.kind}>{r.name}</p>
            <p className="text-xs text-gray-500">
              {r.kind === 'membership' ? t('week.membershipKind') : t('week.classKind')}
              {r.label ? ` · ${r.label}` : ''} · {t('week.endsOn', { date: fmtDate(r.endDate) })}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Month at a glance: PT sold + camp signups expand to their lists ── */}
      <ActionCard icon={Sparkles} title={t('month.extras')} count={1}
        badge={`${extras.avgUtilPct}%`} emptyText={t('month.noneExtras')} testid="growth-month" isRTL={isRTL}>
        <DrillDetails testid="growth-drill-pt" rowTestid="growth-pt-row" isRTL={isRTL} emptyText={t('month.nonePtSold')}
          summary={<span className="flex items-baseline gap-2"><span className="text-lg font-bold text-gray-900" data-testid="growth-pt-sold">{extras.ptSold}</span><span className="text-sm text-gray-500">{t('month.ptSold')}</span></span>}
          rows={extras.ptRows.map((r) => ({ href: stu(r.studentId), left: r.name, right: r.detail }))} />
        <DrillDetails testid="growth-drill-camp" rowTestid="growth-camp-row" isRTL={isRTL} emptyText={t('month.noneCampSignups')}
          summary={<span className="flex items-baseline gap-2"><span className="text-lg font-bold text-gray-900" data-testid="growth-camp-signups">{extras.campSignups}</span><span className="text-sm text-gray-500">{t('month.campSignups')}</span></span>}
          rows={extras.campRows.map((r) => ({ href: stu(r.studentId), left: r.name, right: r.detail }))} />
        <Link href={`/${locale}/classes`} data-testid="growth-utilization-row"
          className="flex items-center justify-between gap-3 rounded-xl border bg-gray-50/60 px-3 py-2.5 hover:bg-gray-50">
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gray-900" data-testid="growth-utilization">{extras.avgUtilPct}%</span>
            <span className="text-sm text-gray-500">{t('month.utilization')}</span>
          </span>
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />
        </Link>
      </ActionCard>
    </div>
  )
}
