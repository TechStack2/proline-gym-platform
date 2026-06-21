import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { dateLocale } from '@/lib/utils/locale-format'
import { cn } from '@/lib/utils'
import {
  Calendar, Clock, Users, MapPin, ArrowRight, CheckCircle2,
  CalendarDays, Award, Dumbbell, CalendarClock, Megaphone, Eye, EyeOff, BookOpen,
} from 'lucide-react'
import Link from 'next/link'
import { PortalCard, PortalCardTitle, PortalEmpty } from '@/components/portal/portal-kit'
import { ActionCard } from '@/components/dashboard/action-card'
import { DrillDetails, type DrillRow } from '@/components/dashboard/drill-details'

type Props = { params: { locale: string } }

/**
 * COACH360-PORTAL — the coach's own premium, drillable Coach-360 hub (portal home).
 *
 * Mirrors the staff Coach-360 (TEAM-1) + the DRILL-360 "card → reconciling rows →
 * drill" pattern (ActionCard/DrillDetails) from the member portal, adapted to the
 * coach's self-view: Today · This Week (teaching load) · My Students (by
 * discipline/belt, who's due to test) · PT · Trials pipeline · My Profile/landing.
 * Read-time / display only — zero schema, no write paths (attendance/PT/trial
 * writes stay in their tabs; the landing publish gate is untouched). Brand theme
 * via the PORTAL-FND kit; i18n ar/en/fr + RTL; mobile and desktop.
 *
 * NB the today's-trials block keeps the `coach-home-trials` / `coach-home-trial-row`
 * testids UX-2 drives — do not rename.
 */
function lf(obj: Record<string, string> | null | undefined, locale: string, base: string): string {
  if (!obj) return ''
  const v = obj[`${base}_${locale}`]
  if (typeof v === 'string' && v.trim()) return v
  const en = obj[`${base}_en`]
  return typeof en === 'string' && en.trim() ? en : ''
}
const beltLabel = (rank?: string | null) =>
  rank ? rank.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''
const one = (x: any) => (Array.isArray(x) ? x[0] : x)
const DUE_TO_TEST_DAYS = 120 // heuristic: no promotion in 4 months ⇒ surface "due to test"

export default async function CoachHomePage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations({ locale, namespace: 'coachHub' })
  const tct = await getTranslations({ locale, namespace: 'coachTrials' })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, landing_visible, landing_status, has_pending_changes, profiles:profile_id (first_name_ar, first_name_en, first_name_fr)')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!coach) {
    return (
      <div className={cn('p-4', isRTL && 'rtl')}>
        <PortalCard>
          <PortalEmpty icon={Calendar}>{t('noCoach')}</PortalEmpty>
        </PortalCard>
      </div>
    )
  }

  const firstName = lf(one((coach as any).profiles), locale, 'first_name')
  const now = new Date()
  const dow = now.getDay()
  const todayIso = now.toISOString().slice(0, 10)

  // ── The coach's active classes (with weekly schedules + discipline) — one read
  //    feeds Today, This Week, and My Students.
  const { data: classesRaw } = await supabase
    .from('classes')
    .select(`id, room, max_capacity, name_ar, name_en, name_fr,
      disciplines:discipline_id (name_ar, name_en, name_fr),
      class_schedules (id, day_of_week, start_time, end_time, is_active)`)
    .eq('coach_id', coach.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  const classes = (classesRaw || []) as any[]
  const classIds = classes.map((c) => c.id)

  // enrollment counts per class + today's marked-attendance per class
  const enrollMap: Record<string, number> = {}
  const markedMap: Record<string, number> = {}
  if (classIds.length) {
    const [{ data: enr }, { data: att }] = await Promise.all([
      supabase.from('class_enrollments').select('class_id, student_id').in('class_id', classIds).eq('is_active', true),
      supabase.from('attendance_records').select('class_id').in('class_id', classIds).eq('attendance_date', todayIso),
    ])
    for (const e of (enr || [])) enrollMap[e.class_id] = (enrollMap[e.class_id] || 0) + 1
    for (const a of (att || [])) markedMap[a.class_id] = (markedMap[a.class_id] || 0) + 1
  }

  const schedMins = (s: any) => {
    if (!s?.start_time || !s?.end_time) return 0
    const [sh, sm] = s.start_time.split(':').map(Number)
    const [eh, em] = s.end_time.split(':').map(Number)
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
  }

  // ── TODAY — schedules occurring today, ordered by start. ──
  type TodayRow = { schedId: string; classId: string; name: string; disc: string; room: string; start: string; end: string; enrolled: number; marked: number; cap: number }
  const todayRows: TodayRow[] = []
  for (const c of classes) {
    for (const s of (c.class_schedules || [])) {
      if (s.is_active === false || s.day_of_week !== dow) continue
      todayRows.push({
        schedId: s.id, classId: c.id, name: lf(c, locale, 'name'), disc: lf(one(c.disciplines), locale, 'name'),
        room: c.room || '', start: (s.start_time || '').slice(0, 5), end: (s.end_time || '').slice(0, 5),
        enrolled: enrollMap[c.id] || 0, marked: markedMap[c.id] || 0, cap: c.max_capacity || 0,
      })
    }
  }
  todayRows.sort((a, b) => a.start.localeCompare(b.start))

  // ── THIS WEEK — teaching load: schedule occurrences across the week + hours. ──
  type WeekRow = { classId: string; name: string; day: number; start: string; end: string; mins: number }
  const weekRows: WeekRow[] = []
  for (const c of classes) {
    for (const s of (c.class_schedules || [])) {
      if (s.is_active === false) continue
      weekRows.push({ classId: c.id, name: lf(c, locale, 'name'), day: s.day_of_week, start: (s.start_time || '').slice(0, 5), end: (s.end_time || '').slice(0, 5), mins: schedMins(s) })
    }
  }
  weekRows.sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start))
  const weekHours = Math.round((weekRows.reduce((s, r) => s + r.mins, 0) / 60) * 10) / 10
  const weekdayName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(dateLocale(locale), { weekday: 'short' })

  // ── MY STUDENTS — distinct active students across the coach's classes, by
  //    discipline + belt; flag who's due to test. Rows reconcile to the headline. ──
  type Stu = { id: string; name: string; disc: string; belt: string; due: boolean }
  const students: Stu[] = []
  if (classIds.length) {
    const { data: enrRows } = await supabase
      .from('class_enrollments')
      .select(`student_id,
        classes:class_id (disciplines:discipline_id (name_ar, name_en, name_fr)),
        students:student_id (id, current_belt_rank, belt_promotion_date,
          profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .in('class_id', classIds)
      .eq('is_active', true)
    const seen = new Set<string>()
    for (const e of (enrRows || []) as any[]) {
      const st = one(e.students)
      if (!st || seen.has(st.id)) continue
      seen.add(st.id)
      const p = one(st.profiles)
      const disc = lf(one(one(e.classes)?.disciplines), locale, 'name')
      const promo = st.belt_promotion_date ? new Date(st.belt_promotion_date) : null
      const due = !promo || (now.getTime() - promo.getTime()) / 864e5 > DUE_TO_TEST_DAYS
      students.push({
        id: st.id,
        name: [lf(p, locale, 'first_name'), lf(p, locale, 'last_name')].filter(Boolean).join(' ').trim() || '—',
        disc, belt: st.current_belt_rank || '', due,
      })
    }
  }
  students.sort((a, b) => a.disc.localeCompare(b.disc) || a.name.localeCompare(b.name))
  const dueCount = students.filter((s) => s.due).length
  // discipline distribution chips (sum to the headline)
  const byDisc = students.reduce<Record<string, number>>((m, s) => { const k = s.disc || t('students.noDiscipline'); m[k] = (m[k] || 0) + 1; return m }, {})

  // ── PT — the coach's active assignments (sessions remaining), via the definer reader. ──
  const { data: ptRoster } = await supabase.rpc('get_coach_pt_roster')
  const pt = ((ptRoster || []) as any[]).map((r) => ({
    id: r.assignment_id, name: r.student_name,
    remaining: r.sessions_remaining ?? 0, total: r.sessions_total ?? 0,
    low: (r.sessions_remaining ?? 0) <= 1,
  }))
  const ptRemaining = pt.reduce((s, r) => s + r.remaining, 0)

  // ── TRIALS — assigned trials; today's keep the UX-2 surface, upcoming feed the pipeline. ──
  const { data: trialsRaw } = await supabase.rpc('get_coach_trials')
  const trials = ((trialsRaw || []) as any[]).filter((tr) => tr.status === 'scheduled')
  const todaysTrials = trials.filter((tr) => tr.scheduled_date === todayIso)
  const upcomingTrials = trials
    .filter((tr) => tr.scheduled_date > todayIso)
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')))

  // ── landing status (display only; the publish gate is untouched). ──
  const landing = (coach as any).has_pending_changes
    ? { key: 'pending', label: t('profile.pending'), cls: 'bg-amber-100 text-amber-800', Icon: Clock }
    : (coach as any).landing_visible
      ? (coach as any).landing_status === 'coming_soon'
        ? { key: 'coming_soon', label: t('profile.comingSoon'), cls: 'bg-blue-100 text-blue-700', Icon: Eye }
        : { key: 'live', label: t('profile.live'), cls: 'bg-green-100 text-green-700', Icon: Eye }
      : { key: 'hidden', label: t('profile.notVisible'), cls: 'bg-gray-100 text-gray-600', Icon: EyeOff }

  const totalToday = todayRows.length
  const completedToday = todayRows.filter((r) => r.cap >= 0 && r.enrolled > 0 && r.marked >= r.enrolled).length

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl text-right')} data-testid="coach-360-portal">
      {/* Header */}
      <div>
        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {firstName ? t('helloName', { name: firstName }) : t('hello')}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      {/* Premium scan bar — 4 headline numbers, each scoped to a card below */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Calendar} value={totalToday} label={t('stats.today')} tone="text-blue-600" bg="bg-blue-50" />
        <Stat icon={Users} value={students.length} label={t('stats.students')} tone="text-[#cd1419]" bg="bg-red-50" brand />
        <Stat icon={CalendarDays} value={weekRows.length} label={t('stats.week')} tone="text-violet-600" bg="bg-violet-50" />
        <Stat icon={Dumbbell} value={ptRemaining} label={t('stats.ptSessions')} tone="text-emerald-600" bg="bg-emerald-50" />
      </div>

      {/* ── TODAY ── */}
      <ActionCard
        icon={Calendar} title={t('today.title')} count={totalToday}
        badge={totalToday ? `${completedToday}/${totalToday}` : '0'}
        emptyText={t('today.empty')} testid="coach-today" isRTL={isRTL}
      >
        {todayRows.map((r) => {
          const complete = r.enrolled > 0 && r.marked >= r.enrolled
          return (
            <div key={r.schedId} data-testid="coach-today-row"
              className="flex items-center justify-between gap-3 rounded-xl border bg-gray-50/60 px-3 py-2.5">
              <Link href={`/${locale}/coach/attendance?classId=${r.classId}`} className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />{r.start}–{r.end}
                  <span className="truncate">· {r.name}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                  {r.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.room}</span>}
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{r.marked}/{r.enrolled} {t('today.marked')}</span>
                </span>
              </Link>
              <Link href={`/${locale}/coach/attendance?classId=${r.classId}`} data-testid="coach-today-attendance"
                className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium',
                  complete ? 'bg-green-50 text-green-700' : 'bg-[#cd1419] text-white hover:bg-[#b01216]')}>
                {complete ? <CheckCircle2 className="h-4 w-4" /> : <>{t('today.startAttendance')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} /></>}
              </Link>
            </div>
          )
        })}
      </ActionCard>

      {/* Today's trials — keep the UX-2 surface (testids unchanged) */}
      {todaysTrials.length > 0 && (
        <PortalCard className="space-y-2" data-testid="coach-home-trials">
          <PortalCardTitle icon={CalendarClock}
            right={<Link href={`/${locale}/coach/trials`} className="text-xs font-medium text-[#cd1419]">{tct('openTab')}</Link>}>
            {tct('todayTitle')}
          </PortalCardTitle>
          {todaysTrials.map((tr) => (
            <Link key={tr.id} href={`/${locale}/coach/trials`} data-testid="coach-home-trial-row" data-lead-name={tr.lead_name}
              className="flex items-center justify-between rounded-xl border px-3 py-2 hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-800">{tr.lead_name}</span>
              <span className="text-xs text-gray-500">{tr.scheduled_time ? tr.scheduled_time.slice(0, 5) : ''}</span>
            </Link>
          ))}
        </PortalCard>
      )}

      {/* ── THIS WEEK — teaching load ── */}
      <ActionCard
        icon={CalendarDays} title={t('week.title')} count={weekRows.length}
        emptyText={t('week.empty')} testid="coach-week" isRTL={isRTL}
        footer={weekRows.length > 0 ? (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500" data-testid="coach-week-summary">
            <span>{t('week.sessions', { n: weekRows.length })}</span>
            <span>{t('week.hours', { h: weekHours })}</span>
            <span>{t('week.roster', { n: students.length })}</span>
          </p>
        ) : undefined}
      >
        <DrillDetails
          testid="coach-week-drill" rowTestid="coach-week-row" isRTL={isRTL}
          summary={<span className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-700">{t('week.load', { n: weekRows.length, h: weekHours })}</span>
            <span className="text-xs text-gray-500">{t('week.acrossClasses', { n: classes.length })}</span>
          </span>}
          rows={weekRows.map((r): DrillRow => ({
            href: `/${locale}/coach/attendance?classId=${r.classId}`,
            left: <span><span className="font-medium">{weekdayName(r.day)}</span> {r.start}–{r.end} · {r.name}</span>,
          }))}
        />
      </ActionCard>

      {/* ── MY STUDENTS — by discipline/belt; who's due to test. Rows reconcile to count. ── */}
      <ActionCard
        icon={Users} title={t('students.title')} count={students.length}
        emptyText={t('students.empty')} testid="coach-students" isRTL={isRTL}
        footer={students.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="coach-students-bydisc">
            {Object.entries(byDisc).map(([d, n]) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <BookOpen className="h-3 w-3" />{d} · {n}
              </span>
            ))}
            {dueCount > 0 && (
              <span data-testid="coach-students-due" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                <Award className="h-3 w-3" />{t('students.dueToTest', { n: dueCount })}
              </span>
            )}
          </div>
        ) : undefined}
      >
        <DrillDetails
          testid="coach-students-drill" rowTestid="coach-students-row" isRTL={isRTL}
          summary={<span className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-700">{t('students.headline', { n: students.length })}</span>
            {dueCount > 0 && <span className="text-xs font-medium text-amber-700">{t('students.dueToTest', { n: dueCount })}</span>}
          </span>}
          rows={students.map((s): DrillRow => ({
            // Coaches are redirected away from /dashboard/* by middleware, so drill
            // to the coach's OWN students tab, focused on this student via ?q=.
            href: `/${locale}/coach/students?q=${encodeURIComponent(s.name)}`,
            left: (
              <span className="inline-flex items-center gap-2">
                {s.name}
                {s.due && <span data-testid="coach-student-due-chip" className="rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-medium text-amber-800">{t('students.due')}</span>}
              </span>
            ),
            right: (
              <span className="inline-flex items-center gap-2 text-xs">
                {s.belt && <span className="inline-flex items-center gap-1 text-gray-500"><Award className="h-3 w-3" />{beltLabel(s.belt)}</span>}
                {s.disc && <span className="text-gray-400">{s.disc}</span>}
              </span>
            ),
          }))}
        />
      </ActionCard>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── PT ── */}
        <ActionCard
          icon={Dumbbell} title={t('pt.title')} count={pt.length}
          emptyText={t('pt.empty')} testid="coach-pt" isRTL={isRTL}
          footer={<Link href={`/${locale}/coach/pt`} data-testid="coach-pt-open" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#cd1419]">{t('pt.manage')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} /></Link>}
        >
          <DrillDetails
            testid="coach-pt-drill" rowTestid="coach-pt-row" isRTL={isRTL}
            summary={<span className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-gray-700">{t('pt.headline', { n: pt.length })}</span>
              <span className="text-xs text-gray-500">{t('pt.remaining', { n: ptRemaining })}</span>
            </span>}
            rows={pt.map((r): DrillRow => ({
              href: `/${locale}/coach/pt`,
              left: r.name,
              right: <span className={cn('font-medium', r.low ? 'text-amber-700' : 'text-gray-600')}>{r.remaining}/{r.total}</span>,
            }))}
          />
        </ActionCard>

        {/* ── TRIALS pipeline ── */}
        <ActionCard
          icon={CalendarClock} title={t('trials.title')} count={upcomingTrials.length}
          emptyText={t('trials.empty')} testid="coach-trials" isRTL={isRTL}
          footer={<Link href={`/${locale}/coach/trials`} data-testid="coach-trials-open" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#cd1419]">{t('trials.manage')}<ArrowRight className={cn('h-3.5 w-3.5', isRTL && 'rotate-180')} /></Link>}
        >
          <DrillDetails
            testid="coach-trials-drill" rowTestid="coach-trials-row" isRTL={isRTL}
            summary={<span className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-gray-700">{t('trials.headline', { n: upcomingTrials.length })}</span>
            </span>}
            rows={upcomingTrials.map((tr): DrillRow => ({
              href: `/${locale}/coach/trials`,
              left: tr.lead_name,
              right: <span className="text-xs text-gray-500" dir="ltr">{new Date(tr.scheduled_date).toLocaleDateString(dateLocale(locale), { month: 'short', day: 'numeric' })}{tr.scheduled_time ? ` ${tr.scheduled_time.slice(0, 5)}` : ''}</span>,
            }))}
          />
        </ActionCard>
      </div>

      {/* ── MY PROFILE / LANDING — display only (publish gate unchanged) ── */}
      <PortalCard data-testid="coach-profile-status">
        <PortalCardTitle icon={Megaphone}
          right={<Link href={`/${locale}/coach/profile`} data-testid="coach-profile-open" className="text-xs font-medium text-[#cd1419]">{t('profile.manage')}</Link>}>
          {t('profile.title')}
        </PortalCardTitle>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{t('profile.landingLabel')}</p>
          <span data-testid="coach-landing-status" data-status={landing.key}
            className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', landing.cls)}>
            <landing.Icon className="h-3 w-3" />{landing.label}
          </span>
        </div>
      </PortalCard>
    </div>
  )
}

function Stat({ icon: Icon, value, label, tone, bg, brand }: {
  icon: any; value: number; label: string; tone: string; bg: string; brand?: boolean
}) {
  return (
    <PortalCard className="text-center">
      <div className={cn('mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full', bg)}>
        <Icon data-testid={brand ? 'portal-brand' : undefined} className={cn('h-5 w-5', tone)} />
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 truncate text-xs text-gray-500">{label}</p>
    </PortalCard>
  )
}
