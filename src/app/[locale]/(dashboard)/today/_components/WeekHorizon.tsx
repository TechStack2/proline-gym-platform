import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { dateLocale } from '@/lib/utils/locale-format'
import { ActionCard, ActionRow } from '@/components/dashboard/action-card'
import { horizonEndDate } from '@/lib/finances/horizon'
import {
  getScheduleFill, getRenewalsInWindow, getTrialsThisWeek, getCoachLoad,
} from '@/lib/finances/horizon-cards'
import { getRenewalsDue } from '@/lib/pt/refill'
import { getFunnel } from '@/lib/growth/funnel'
import {
  CalendarRange, RefreshCw, UserCheck, Dumbbell, Users, ChevronRight, TrendingUp, DollarSign,
} from 'lucide-react'

/**
 * This Week — "plan & chase" (tactical lens). A DISTINCT card set from Today:
 * schedule fill % (promote underfilled) · renewals due this week (+ projected) ·
 * trials this week · PT running low → re-sell · coach load (plain list; TEAM-1
 * wires Coach-360) · new leads + weekly conversion. All read-time; window is
 * today → +7d (the FIN-1 horizon helper).
 */
export async function WeekHorizon({ locale, gymId }: { locale: string; gymId: string }) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const now = new Date()
  const dayStart = now.toISOString().slice(0, 10)
  const weekEnd = horizonEndDate('week', now) // +7d (YYYY-MM-DD)
  const fromISO = `${dayStart}T00:00:00`
  const toISO = `${weekEnd}T23:59:59`
  const weekAgoISO = new Date(now.getTime() - 7 * 864e5).toISOString()

  const [fill, renewals, trials, ptLow, coachLoad, funnel] = await Promise.all([
    getScheduleFill(supabase, gymId, locale),
    getRenewalsInWindow(supabase, gymId, locale, dayStart, weekEnd),
    getTrialsThisWeek(supabase, gymId, locale, dayStart, weekEnd),
    getRenewalsDue(supabase, gymId, locale), // PT refill-due (low credits OR closing window)
    getCoachLoad(supabase, gymId, locale, fromISO, toISO),
    getFunnel(supabase, gymId, weekAgoISO),
  ])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale))
  const hhmm = (v: string | null) => (v || '').slice(0, 5)
  const pct = (n: number) => Math.round(n)
  const underfilledCount = fill.filter((f) => f.underfilled).length

  return (
    <div className="space-y-4">
      {/* ── Schedule fill % (underfilled = promote) ── */}
      <ActionCard icon={CalendarRange} title={t('week.scheduleFill')} count={fill.length}
        badge={underfilledCount > 0 ? `${underfilledCount} ${t('week.underfilled')}` : `${fill.length}`}
        emptyText={t('week.noneSchedule')} testid="schedule-fill" isRTL={isRTL}>
        {fill.map((f) => (
          <ActionRow key={f.classId} href={`/${locale}/classes/${f.classId}`} testid="schedule-fill-row"
            action={
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                f.underfilled ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}
                data-underfilled={f.underfilled}>
                {f.fillPct}%
              </span>
            }>
            <p className="truncate text-sm font-semibold text-gray-900">{f.name}</p>
            <p className="text-xs text-gray-500">
              {t('week.fillStat', { enrolled: f.enrolled, capacity: f.capacity })}
              {f.underfilled ? ` · ${t('week.promote')}` : ''}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Renewals due this week (memberships + class regs) + projected ── */}
      <ActionCard icon={RefreshCw} title={t('week.renewals')} count={renewals.rows.length}
        emptyText={t('week.noneRenewals')} testid="renewals-week" isRTL={isRTL}
        footer={renewals.rows.length > 0 ? (
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="renewals-week-projected">
            <span className="text-xs font-medium text-gray-500">{t('week.projectedWeek')}</span>
            <span className="text-sm font-bold text-gray-900">${renewals.projectedUsd.toFixed(2)}</span>
          </div>
        ) : undefined}>
        {renewals.rows.map((r, i) => (
          <ActionRow key={`${r.kind}-${r.studentId}-${i}`} href={`/${locale}/students/${r.studentId}`} testid="renewals-week-row"
            action={
              <Link href={`/${locale}/students/${r.studentId}`} data-testid="renewals-week-renew"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-[#a81014]">
                <RefreshCw className="h-3.5 w-3.5" /> {t('week.renew')}
              </Link>
            }>
            <p className="truncate text-sm font-semibold text-gray-900" data-kind={r.kind}>{r.name}</p>
            <p className="text-xs text-gray-500">
              {r.kind === 'membership' ? t('week.membershipKind') : t('week.classKind')}
              {r.label ? ` · ${r.label}` : ''} · {t('week.endsOn', { date: fmtDate(r.endDate) })}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Trials this week ── */}
      <ActionCard icon={UserCheck} title={t('week.trials')} count={trials.length}
        emptyText={t('week.noneTrials')} testid="trials-week" isRTL={isRTL}>
        {trials.map((tr) => (
          <ActionRow key={tr.trialId} href={`/${locale}/leads`} testid="trials-week-row"
            action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
            <p className="truncate text-sm font-semibold text-gray-900">{tr.leadName}</p>
            <p className="text-xs text-gray-500" dir={isRTL ? 'rtl' : 'ltr'}>
              {fmtDate(tr.date)}{tr.time ? ` · ${hhmm(tr.time)}` : ''} ·{' '}
              {tr.coachName ? t('week.trialWith', { coach: tr.coachName }) : t('week.trialNoCoach')}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── PT running low / expiring this week → re-sell (PT-1) ── */}
      <ActionCard icon={Dumbbell} title={t('week.ptLow')} count={ptLow.length}
        emptyText={t('week.nonePtLow')} testid="pt-low-week" isRTL={isRTL}>
        {ptLow.map((r) => (
          <ActionRow key={r.assignmentId} href={`/${locale}/students/${r.studentId}`} testid="pt-low-week-row"
            action={
              <Link href={`/${locale}/students/${r.studentId}?sellpt=${r.packageId}`} data-testid="pt-low-week-resell"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-[#a81014]">
                <RefreshCw className="h-3.5 w-3.5" /> {t('week.resell')}
              </Link>
            }>
            <p className="truncate text-sm font-semibold text-gray-900">{r.studentName}</p>
            <p className="text-xs text-gray-500">
              {r.packageName} · {r.remaining}/{r.total}
              {r.daysLeft !== null ? ` · ${t('cards.daysLeft', { days: r.daysLeft })}` : ''}
            </p>
          </ActionRow>
        ))}
      </ActionCard>

      {/* ── Coach load this week → each coach drills into their Coach-360 (TEAM-1) ── */}
      <ActionCard icon={Users} title={t('week.coachLoad')} count={coachLoad.length}
        emptyText={t('week.noneCoachLoad')} testid="coach-load-week" isRTL={isRTL}>
        <div className="space-y-2" data-testid="coach-load-list">
          {coachLoad.map((c) => (
            <ActionRow key={c.coachId} href={`/${locale}/coaches/${c.coachId}`} testid="coach-load-row"
              action={
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-500" data-total={c.total}>
                    {t('week.coachLoadStat', { classes: c.classes, pt: c.ptSessions })}
                  </span>
                  <ChevronRight className={cn('h-4 w-4 text-gray-400', isRTL && 'rotate-180')} />
                </span>
              }>
              <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
            </ActionRow>
          ))}
        </div>
      </ActionCard>

      {/* ── New leads + weekly conversion (GRW-1) ── */}
      <ActionCard icon={TrendingUp} title={t('week.leads')} count={funnel.totalLeads}
        emptyText={t('week.noneLeads')} testid="leads-week" isRTL={isRTL}
        footer={
          <div className="mt-3 flex items-center justify-between border-t pt-2" data-testid="leads-week-conversion">
            <span className="text-xs font-medium text-gray-500">{t('week.conversionLabel')}</span>
            <span className="text-sm font-bold text-gray-900">
              {t('week.conversion', { converted: funnel.converted, leads: funnel.totalLeads, pct: pct(funnel.conversionRate * 100) })}
            </span>
          </div>
        }>
        <ActionRow href={`/${locale}/leads`} testid="leads-week-row"
          action={<ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-400', isRTL && 'rotate-180')} />}>
          <p className="text-sm text-gray-800">{t('week.newLeads', { count: funnel.totalLeads })}</p>
        </ActionRow>
      </ActionCard>
    </div>
  )
}
