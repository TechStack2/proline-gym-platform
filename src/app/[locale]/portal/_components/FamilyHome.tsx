import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtTime, fmtWeekday } from '@/lib/fmt'
import { fmtUsd } from '@/lib/billing/currency'
import { Ltr, Bdi } from '@/components/ui/bdi'
import { StatusChip } from '@/components/ui/status-chip'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/shared/avatar'
import { DeskGrid, PortalCard } from '@/components/portal/portal-kit'
import { CalendarDays, CreditCard, ClipboardList, Wallet } from 'lucide-react'
import { NavChevron } from '@/components/ui/nav-chevron'
import { PageHeader } from '@/components/ui/page-header'
import { getFamilySummaries, type FamilySummary } from '@/lib/family/aggregate'

/**
 * GUARDIAN-360 R2 — the PORTAL family home. Field finding 13: a guardian saw one
 * child at a time with no combined view. When a guardian account has 2+ dependents
 * (or dependents + their own membership), the home now LEADS with this overview —
 * per child: next class, end of the current billing cycle, active registrations,
 * outstanding balance — plus ONE combined week schedule for the whole family
 * (each entry chipped per child) and tap-through to the existing per-child views.
 * Single-child guardians keep today's behaviour (this component isn't reached).
 * Every read rides the additive guardian RLS; no new model.
 */

// W3a §1.3: family members are CATEGORICAL identities — they wear the fixed
// DISC-COLOR tint machinery (`cat-tint` + data-cat), which is dark-correct by
// construction; the light-pinned -100 chip palette dies. Membership state colour
// comes from the member vocabulary via StatusChip (§2.3).
const MEMBER_CAT = ['1', '2', '4', '3', '6', '7']

export async function FamilyHome({
  locale, kids, ownStudentId, householdOutstanding = 0, householdOpenCount = 0,
}: {
  locale: string
  kids: { id: string; name: string; avatarUrl?: string | null }[]
  ownStudentId: string | null
  householdOutstanding?: number
  householdOpenCount?: number
}) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('family')
  const th = await getTranslations('portalHome')
  const supabase = await createClient()

  const kidIds = kids.map((k) => k.id)
  const allIds = [...kidIds, ...(ownStudentId ? [ownStudentId] : [])]
  const summaries = await getFamilySummaries(supabase, allIds, locale)

  // Family members in display order: children first, then the guardian's own card.
  type Member = { id: string; s: FamilySummary; self: boolean; href: string }
  const members: Member[] = []
  for (const k of kids) {
    const s = summaries.get(k.id)
    if (s) members.push({ id: k.id, s, self: false, href: `/${locale}/portal?kid=${k.id}` })
  }
  if (ownStudentId && summaries.get(ownStudentId)) {
    members.push({ id: ownStudentId, s: summaries.get(ownStudentId)!, self: true, href: `/${locale}/portal?me=1` })
  }
  const catOf = new Map(members.map((m, i) => [m.id, MEMBER_CAT[i % MEMBER_CAT.length]]))

  // W3a §2.7: weekday/date/clock through the fmt module — the hand-rolled
  // day-name arrays + two local formatters die.
  const todayDow = new Date().getDay()
  const weekday = (diff: number) => diff === 0 ? t('today') : fmtWeekday((todayDow + diff) % 7, locale, 'long')
  const nextClassLabel = (s: FamilySummary) => s.nextClass ? `${weekday(s.nextClass.dayDiff)} ${fmtTime(s.nextClass.start, locale)}` : t('noSchedule')

  // Combined week schedule — every member's slots merged onto one 7-day grid.
  const initials = (name: string) => (name || '?').trim().charAt(0).toUpperCase()
  type WeekSlot = { memberId: string; memberName: string; start: string; className: string }
  const week: WeekSlot[][] = Array.from({ length: 7 }, () => [])
  for (const m of members) {
    for (const sl of m.s.schedule) {
      week[sl.day].push({ memberId: m.id, memberName: m.s.name, start: sl.start, className: sl.className })
    }
  }
  for (const day of week) day.sort((a, b) => a.start.localeCompare(b.start))
  const hasAnySlot = week.some((d) => d.length > 0)

  return (
    /* W3a R3: the undefined `rtl` class swept (DA-61). */
    <div className="space-y-6 p-4" data-testid="family-overview">
    {/* W2a §4.2 Rule 1: main = balance + overview + switcher + per-child glance
        cards (the mobile flow); aside = the combined family week schedule (last
        on mobile — DOM order unchanged). */}
    <DeskGrid gap="space-y-6" main={<>
      {/* Combined family balance — nothing owed = no card (BILL-GUARDS idiom). */}
      {householdOutstanding > 0.005 && (
        <Link href={`/${locale}/portal/billing`} data-testid="family-outstanding-total" data-amount={householdOutstanding.toFixed(2)}
          className="flex items-center justify-between rounded-2xl border border-danger-500/25 bg-danger-500/10 p-4 transition-colors hover:bg-danger-500/15">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-500/15 text-danger-600"><Wallet className="h-5 w-5" aria-hidden /></div>
            <div>
              <p className={cn('text-sm font-semibold text-[color:rgb(var(--c-danger-tint-fg))]', isRTL && 'font-arabic')}>{t('familyBalance')}</p>
              <p className={cn('text-xs text-danger-600', isRTL && 'font-arabic')}>{th('outstandingCount', { count: householdOpenCount })}</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <Ltr className="text-lg font-bold text-[color:rgb(var(--c-danger-tint-fg))]">{fmtUsd(householdOutstanding)}</Ltr>
            <NavChevron />
          </span>
        </Link>
      )}

      {/* W2b R3: the ONE title primitive (testid `page-title`; the inline icon
          goes, per the primitive's contract). `always`: the guardian overview
          title IS the surface's identity on every breakpoint (as before). */}
      <PageHeader title={t('overviewTitle')} subtitle={t('overviewSubtitle')} visibility="always" />

      {/* Switcher — kept so the per-child chip flow (and existing specs) survive. */}
      <div className="flex flex-wrap gap-2" data-testid="kid-switcher">
        {ownStudentId && (
          <Link href={`/${locale}/portal?me=1`} data-testid="kid-chip-me"
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">{t('me')}</Link>
        )}
        {kids.map((k) => (
          <Link key={k.id} href={`/${locale}/portal?kid=${k.id}`} data-testid="kid-chip" data-kid-id={k.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300">
            <Avatar url={k.avatarUrl} name={k.name} size="xs" />{k.name}
          </Link>
        ))}
      </div>

      {/* Per-child (and own) glance cards. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const s = m.s
          return (
            <Link key={m.id} href={m.href} data-testid={m.self ? 'family-self-card' : 'family-child-card'} data-student-id={m.id}
              className="block rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-primary-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span data-cat={catOf.get(m.id)} className="cat-tint flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">{initials(s.name)}</span>
                  <div className="min-w-0">
                    <p className={cn('truncate font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {s.name}{m.self && <span className="ms-1.5 text-[10px] font-medium text-primary-600">· {t('me')}</span>}
                    </p>
                    <StatusChip domain="member" status={s.membershipStateValue}
                      label={t(`msState.${s.membershipStateValue}`)}
                      data-testid="family-child-membership" size="sm" className="mt-0.5 text-[10px]" />
                  </div>
                </div>
                <NavChevron className="text-gray-300" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  {/* DA-7: first-strong — the Arabic weekday reads RTL; digits are neutral. */}
                  <dd data-testid="family-child-nextclass" className="truncate text-gray-700"><Bdi>{nextClassLabel(s)}</Bdi></dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-cycle-end" className="truncate text-gray-700"><Bdi>{s.cycleEnd ? <>{t('cycleEnds')} <Ltr>{fmtDate(s.cycleEnd, locale, 'dayMonth')}</Ltr></> : '—'}</Bdi></dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-regs" className="text-gray-700">{t('registrations')}: {s.activeRegCount}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  {/* §2.4: settled is a calm fact, not a green celebration. */}
                  <dd data-testid="family-child-outstanding" data-amount={s.outstanding.toFixed(2)} className={cn('font-medium', s.outstanding > 0.005 ? 'text-danger-700' : 'text-gray-500')}>
                    {s.outstanding > 0.005 ? <Ltr>{fmtUsd(s.outstanding)}</Ltr> : t('settled')}
                  </dd>
                </div>
              </dl>
            </Link>
          )
        })}
      </div>
    </>} aside={<>
      {/* One combined week schedule for the whole family — each entry chipped per child. */}
      <PortalCard data-testid="family-week-schedule">
        <h2 className={cn('mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <CalendarDays className="h-4 w-4 text-primary-600" />{t('weekSchedule')}
        </h2>
        {!hasAnySlot ? (
          <p className="py-3 text-center text-sm text-gray-400">{t('noSchedule')}</p>
        ) : (
          <ul className="space-y-2">
            {week.map((slots, day) => (
              slots.length === 0 ? null : (
                <li key={day} className="flex flex-wrap items-start gap-2" data-testid="family-week-day" data-day={day}>
                  <span className={cn('w-10 shrink-0 pt-0.5 text-xs font-semibold', day === todayDow ? 'text-primary-700' : 'text-gray-400')}>{fmtWeekday(day, locale)}</span>
                  <span className="flex flex-1 flex-wrap gap-1.5">
                    {slots.map((sl, i) => (
                      <span key={i} data-testid="family-week-slot" data-student-id={sl.memberId}
                        data-cat={catOf.get(sl.memberId)}
                        className="cat-tint inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                        <span className="font-bold">{initials(sl.memberName)}</span>
                        <Ltr>{fmtTime(sl.start, locale)}</Ltr>
                        <span className="max-w-[8rem] truncate opacity-80">{sl.className}</span>
                      </span>
                    ))}
                  </span>
                </li>
              )
            ))}
          </ul>
        )}
      </PortalCard>
    </>} />
    </div>
  )
}
