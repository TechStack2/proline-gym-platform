import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dateLocale } from '@/lib/utils/locale-format'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/shared/avatar'
import { PortalCard } from '@/components/portal/portal-kit'
import { CalendarDays, CreditCard, ClipboardList, Wallet, ChevronRight, Users } from 'lucide-react'
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

const MEMBER_CHIP = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]
const STATE_CHIP: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  overdue: 'bg-orange-100 text-orange-700',
  lapsed: 'bg-red-100 text-red-700',
  frozen: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-500',
}

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
  const colorOf = new Map(members.map((m, i) => [m.id, MEMBER_CHIP[i % MEMBER_CHIP.length]]))

  const dayNames = isRTL
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : locale === 'fr'
      ? ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = (diff: number) => diff === 0 ? t('today') : new Date(Date.now() + diff * 864e5).toLocaleDateString(dateLocale(locale), { weekday: 'long' })
  const fmtDate = (d: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(dateLocale(locale), { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—')
  const nextClassLabel = (s: FamilySummary) => s.nextClass ? `${weekday(s.nextClass.dayDiff)} ${s.nextClass.start}` : t('noSchedule')

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
  const todayDow = new Date().getDay()
  const hasAnySlot = week.some((d) => d.length > 0)

  return (
    <div className={cn('space-y-6 p-4', isRTL && 'rtl')} data-testid="family-overview">
      {/* Combined family balance — nothing owed = no card (BILL-GUARDS idiom). */}
      {householdOutstanding > 0.005 && (
        <Link href={`/${locale}/portal/billing`} data-testid="family-outstanding-total" data-amount={householdOutstanding.toFixed(2)}
          className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600"><Wallet className="h-5 w-5" aria-hidden /></div>
            <div>
              <p className={cn('text-sm font-semibold text-red-800', isRTL && 'font-arabic')}>{t('familyBalance')}</p>
              <p className={cn('text-xs text-red-600', isRTL && 'font-arabic')}>{th('outstandingCount', { count: householdOpenCount })}</p>
            </div>
          </div>
          <span className="text-lg font-bold text-red-800" dir="ltr">${householdOutstanding.toFixed(2)}</span>
        </Link>
      )}

      <div>
        <h1 className={cn('flex items-center gap-2 text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          <Users className="h-6 w-6 text-primary-700" />{t('overviewTitle')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t('overviewSubtitle')}</p>
      </div>

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
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold', colorOf.get(m.id))}>{initials(s.name)}</span>
                  <div className="min-w-0">
                    <p className={cn('truncate font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {s.name}{m.self && <span className="ms-1.5 text-[10px] font-medium text-primary-600">· {t('me')}</span>}
                    </p>
                    <span data-testid="family-child-membership" className={cn('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', STATE_CHIP[s.membershipStateValue])}>
                      {t(`msState.${s.membershipStateValue}`)}
                    </span>
                  </div>
                </div>
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-gray-300', isRTL && 'rotate-180')} aria-hidden />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-nextclass" className="truncate text-gray-700" dir="ltr">{nextClassLabel(s)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-cycle-end" className="truncate text-gray-700" dir="ltr">{s.cycleEnd ? `${t('cycleEnds')} ${fmtDate(s.cycleEnd)}` : '—'}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-regs" className="text-gray-700">{t('registrations')}: {s.activeRegCount}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
                  <dd data-testid="family-child-outstanding" data-amount={s.outstanding.toFixed(2)} className={cn('font-medium', s.outstanding > 0.005 ? 'text-red-700' : 'text-emerald-600')} dir="ltr">
                    {s.outstanding > 0.005 ? `$${s.outstanding.toFixed(2)}` : t('settled')}
                  </dd>
                </div>
              </dl>
            </Link>
          )
        })}
      </div>

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
                  <span className={cn('w-10 shrink-0 pt-0.5 text-xs font-semibold', day === todayDow ? 'text-primary-700' : 'text-gray-400')}>{dayNames[day]}</span>
                  <span className="flex flex-1 flex-wrap gap-1.5">
                    {slots.map((sl, i) => (
                      <span key={i} data-testid="family-week-slot" data-student-id={sl.memberId}
                        className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', colorOf.get(sl.memberId))}>
                        <span className="font-bold">{initials(sl.memberName)}</span>
                        <span dir="ltr">{sl.start}</span>
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
    </div>
  )
}
