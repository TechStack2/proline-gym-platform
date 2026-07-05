import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { WorkspaceSegments } from '@/components/layout/WorkspaceSegments'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { Avatar } from '@/components/shared/avatar'
import { DiaryBookPt, type DiaryAssignment } from './diary-book-pt'
import { openAvailabilityGaps, hmInTz, type Interval } from '@/lib/coach/availability'
import { CalendarRange, CalendarClock, Dumbbell, Clock, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = {
  params: { locale: string }
  searchParams: { view?: string; date?: string; discipline?: string; coach?: string }
}

/**
 * /schedule — one calendar, two views (IA-3, read-side only).
 *
 * The two calendar species (cohesion-audit Addendum): recurring group classes
 * are a weekly TEMPLATE (classes + class_schedules.day_of_week); PT appointments
 * are individual BOOKINGS (pt_sessions at a concrete date/time). Industry shape:
 * separate editing models, ONE viewing surface —
 *  - Week · Timetable (default): the recurring grid, discipline-colored,
 *    discipline/coach filters, chip → class detail. Class CRUD stays at /classes.
 *  - Day · Coach diary: resource columns per coach stacking that day's class
 *    slots AND non-cancelled PT sessions → multi-coach PT legibility. PT block →
 *    the C1 lifecycle surface (/pt); class block → the class roster.
 * Zero schema, zero write paths — every event is an existing verified read.
 */

// Mon-first day order (column order flips visually under RTL via dir).
const WEEK_DOWS = [1, 2, 3, 4, 5, 6, 0] as const

// Tenant-clean discipline palette: stable hue per discipline by sort position.
// CSP-SWEEP: the prod CSP (style-src strict-dynamic, no unsafe-inline) STRIPS inline
// style="" attributes, so a runtime `style={{ backgroundColor }}` is dropped in prod
// (chips render default red) AND floods the console with violations. Use build-time
// Tailwind bg CLASSES (JIT-scanned from src/**) instead — CSP-safe, [[prod-csp-strips-inline-style-attrs]].
const DISCIPLINE_BG = [
  'bg-[#cd1419]', 'bg-[#2563eb]', 'bg-[#059669]', 'bg-[#d97706]',
  'bg-[#7c3aed]', 'bg-[#db2777]', 'bg-[#0891b2]', 'bg-[#65a30d]',
]

const hhmm = (v: string | null) => (v || '').slice(0, 5)

export default async function SchedulePage({ params: { locale }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('scheduleView')
  // TEAM-1: floor-lens strings (open gaps / Coach-360 link) live under `team.*`.
  const tTeam = await getTranslations('team')
  const supabase = await createClient()

  const view = searchParams.view === 'day' ? 'day' : 'week'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = me?.gym_id
  if (!gymId) return null

  const [{ data: disciplines }, { data: coaches }, { data: classesRaw }] = await Promise.all([
    supabase.from('disciplines').select('id, name_ar, name_en, name_fr, sort_order')
      .eq('gym_id', gymId).eq('is_active', true).order('sort_order'),
    supabase.from('coaches')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url)')
      .eq('gym_id', gymId).eq('is_active', true),
    supabase.from('classes')
      .select(`id, name_ar, name_en, name_fr, discipline_id, coach_id, max_capacity,
        schedules:class_schedules(id, day_of_week, start_time, end_time, is_active)`)
      .eq('gym_id', gymId).eq('is_active', true),
  ])

  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')
  const coachName = (id: string | null) => localizedName(one((coaches ?? []).find((c: any) => c.id === id)?.profiles), locale)
  // Maps discipline → a Tailwind bg CLASS (not a hex → not an inline style).
  const disciplineColor = new Map<string, string>(
    (disciplines ?? []).map((d: any, i: number) => [d.id, DISCIPLINE_BG[i % DISCIPLINE_BG.length]]),
  )

  // Filters apply to both views.
  const fDiscipline = searchParams.discipline || ''
  const fCoach = searchParams.coach || ''
  const classes = (classesRaw ?? []).filter((c: any) =>
    (!fDiscipline || c.discipline_id === fDiscipline) && (!fCoach || c.coach_id === fCoach))

  const dayNames = [
    t('days.sun'), t('days.mon'), t('days.tue'), t('days.wed'), t('days.thu'), t('days.fri'), t('days.sat'),
  ]

  // ── Day view data ──
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : new Date().toISOString().slice(0, 10)
  let diary: { coachId: string; classes: any[]; pts: any[]; gaps: Interval[] }[] = []
  let tz = 'Asia/Beirut' // hoisted so the PT label (render) shares the gap math's gym TZ
  if (view === 'day') {
    const dow = new Date(`${dateStr}T12:00:00`).getDay()
    // TEAM-1: gym timezone resolves PT timestamps into the same clock the
    // (naive TIME) class slots + availability windows live in, for gap math.
    const [{ data: ptsRaw }, { data: availRows }, { data: ovRows }, { data: gym }] = await Promise.all([
      supabase
        .from('pt_sessions')
        .select(`id, coach_id, scheduled_at, duration_minutes, status,
          students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
          coaches:coach_id (gym_id)`)
        .gte('scheduled_at', `${dateStr}T00:00:00`)
        .lt('scheduled_at', `${dateStr}T23:59:59`)
        .neq('status', 'cancelled')
        .order('scheduled_at'),
      // Published bookable windows for this weekday (PT-2 coach_availability).
      supabase.from('coach_availability')
        .select('coach_id, day_of_week, start_time, end_time')
        .eq('gym_id', gymId).eq('is_active', true).eq('day_of_week', dow),
      // Per-date exceptions (block/extra) that reshape the windows for THIS date.
      supabase.from('coach_availability_overrides')
        .select('coach_id, date, kind, start_time, end_time')
        .eq('gym_id', gymId).eq('date', dateStr),
      supabase.from('gyms').select('timezone').eq('id', gymId).single(),
    ])
    tz = (gym as any)?.timezone || 'Asia/Beirut'
    const pts = (ptsRaw ?? []).filter((s: any) => one(s.coaches)?.gym_id === gymId)
      .filter((s: any) => !fCoach || s.coach_id === fCoach)

    const slotsByCoach = new Map<string, any[]>()
    for (const c of classes) {
      for (const s of (c as any).schedules ?? []) {
        if (s.is_active === false || s.day_of_week !== dow) continue
        const list = slotsByCoach.get((c as any).coach_id) ?? []
        list.push({ cls: c, slot: s })
        slotsByCoach.set((c as any).coach_id, list)
      }
    }
    const ptsByCoach = new Map<string, any[]>()
    for (const s of pts) {
      const list = ptsByCoach.get(s.coach_id) ?? []
      list.push(s)
      ptsByCoach.set(s.coach_id, list)
    }
    const availByCoach = new Map<string, any[]>()
    for (const w of (availRows ?? []) as any[]) {
      if (fCoach && w.coach_id !== fCoach) continue
      const list = availByCoach.get(w.coach_id) ?? []
      list.push(w)
      availByCoach.set(w.coach_id, list)
    }
    // Columns: coaches with any class/PT/published-window that day; fallback all.
    let coachIds = [...new Set([...slotsByCoach.keys(), ...ptsByCoach.keys(), ...availByCoach.keys()])]
    if (coachIds.length === 0) coachIds = (coaches ?? []).map((c: any) => c.id)
    if (fCoach) coachIds = coachIds.filter((id) => id === fCoach)
    diary = coachIds.map((coachId) => {
      const coachClasses = (slotsByCoach.get(coachId) ?? []).sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time))
      const coachPts = ptsByCoach.get(coachId) ?? []
      // Busy = recurring class slots that day + booked PT (resolved to gym clock).
      const busy: Interval[] = [
        ...coachClasses.map(({ slot }: any) => ({ start: slot.start_time, end: slot.end_time })),
        ...coachPts.map((s: any) => {
          const start = hmInTz(s.scheduled_at, tz)
          const [h, m] = start.split(':').map(Number)
          const endMin = h * 60 + m + (s.duration_minutes ?? 60)
          return { start, end: `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` }
        }),
      ]
      const gaps = openAvailabilityGaps({
        date: dateStr, dow,
        windows: availByCoach.get(coachId) ?? [],
        overrides: (ovRows ?? []).filter((o: any) => o.coach_id === coachId) as any,
        busy,
      })
      return { coachId, classes: coachClasses, pts: coachPts, gaps }
    })
  }

  // ── Week view rows: distinct (start,end) slots ──
  const slotMap = new Map<string, { start: string; end: string; cells: Map<number, any[]> }>()
  if (view === 'week') {
    for (const c of classes) {
      for (const s of (c as any).schedules ?? []) {
        if (s.is_active === false) continue
        const key = `${s.start_time}-${s.end_time}`
        let row = slotMap.get(key)
        if (!row) {
          row = { start: s.start_time, end: s.end_time, cells: new Map() }
          slotMap.set(key, row)
        }
        const cell = row.cells.get(s.day_of_week) ?? []
        cell.push(c)
        row.cells.set(s.day_of_week, cell)
      }
    }
  }
  const weekRows = [...slotMap.values()].sort((a, b) => a.start.localeCompare(b.start))

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = { view, date: view === 'day' ? dateStr : undefined, discipline: fDiscipline || undefined, coach: fCoach || undefined, ...overrides }
    for (const [k, v] of Object.entries(merged)) if (v && v !== 'week') p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  const fmtDay = new Date(`${dateStr}T12:00:00`)

    // PT-2: active assignments per coach for the diary Book-PT picker.
  const { data: diaryAssignRows } = await supabase
    .from('pt_assignments')
    .select(`id, coach_id, sessions_remaining, status, is_active, expires_at,
      students:student_id (gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('status', 'active')
    .eq('is_active', true)
  const diaryAssignByCoach = new Map<string, DiaryAssignment[]>()
  for (const a of (diaryAssignRows ?? []) as any[]) {
    if (!a.coach_id || (a.sessions_remaining ?? 0) <= 0) continue
    if (a.expires_at && new Date(a.expires_at) < new Date()) continue
    if (one(a.students)?.gym_id !== gymId) continue
    const list = diaryAssignByCoach.get(a.coach_id) ?? []
    list.push({ id: a.id, studentName: localizedName(one(one(a.students)?.profiles), locale), remaining: a.sessions_remaining ?? 0 })
    diaryAssignByCoach.set(a.coach_id, list)
  }

  return (
    <div className={cn('space-y-6', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={cn('hidden md:block text-2xl font-bold', isRTL && 'font-arabic')}>{t('title')}</h1>
        <WorkspaceSegments
          locale={locale}
          active="schedule"
          segments={[
            { key: 'schedule', label: t('segSchedule'), path: '/schedule' },
            { key: 'classes', label: t('segClasses'), path: '/classes' },
          ]}
        />
      </div>

      {/* View switcher + filters (GET — server-rendered, RTL-safe) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border bg-gray-50 p-1" data-testid="schedule-views">
          <Link href={`/${locale}/schedule${qs({ view: undefined, date: undefined })}`} data-testid="view-week"
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium',
              view === 'week' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
            <CalendarRange className="h-4 w-4" /> {t('weekView')}
          </Link>
          <Link href={`/${locale}/schedule${qs({ view: 'day', date: dateStr })}`} data-testid="view-day"
            className={cn('inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium',
              view === 'day' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
            <CalendarClock className="h-4 w-4" /> {t('dayView')}
          </Link>
        </div>

        <form method="get" action={`/${locale}/schedule`} className="flex flex-wrap items-center gap-2">
          {view === 'day' && <input type="hidden" name="view" value="day" />}
          {view === 'day' && (
            <input type="date" name="date" defaultValue={dateStr} data-testid="diary-date"
              className="h-9 rounded-lg border px-3 text-sm" />
          )}
          <select name="discipline" defaultValue={fDiscipline} data-testid="filter-discipline"
            className="h-9 rounded-lg border bg-white px-3 text-sm">
            <option value="">{t('allDisciplines')}</option>
            {(disciplines ?? []).map((d: any) => <option key={d.id} value={d.id}>{lname(d)}</option>)}
          </select>
          <select name="coach" defaultValue={fCoach} data-testid="filter-coach"
            className="h-9 rounded-lg border bg-white px-3 text-sm">
            <option value="">{t('allCoaches')}</option>
            {(coaches ?? []).map((c: any) => <option key={c.id} value={c.id}>{localizedName(one(c.profiles), locale)}</option>)}
          </select>
          <button className="h-9 rounded-lg bg-[#cd1419] px-4 text-sm font-medium text-white hover:bg-[#a81014]">{t('apply')}</button>
        </form>
      </div>

      {view === 'week' ? (
        /* ── Week · Timetable ── */
        weekRows.length === 0 ? (
          <p className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 shadow-sm">{t('noEvents')}</p>
        ) : (
          <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
            <table className="w-full min-w-[760px] border-separate border-spacing-1.5" data-testid="week-grid">
              <thead>
                <tr>
                  <th className="w-28 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('time')}</th>
                  {WEEK_DOWS.map((d) => (
                    <th key={d} className={cn('rounded-lg bg-gray-900 px-3 py-2 text-center text-xs font-bold text-white', isRTL && 'font-arabic')}>
                      {dayNames[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekRows.map((row) => (
                  <tr key={`${row.start}-${row.end}`}>
                    <td className="rounded-lg bg-gray-100 px-3 py-2 align-top text-xs font-medium text-gray-600 whitespace-nowrap" dir="ltr">
                      {hhmm(row.start)}–{hhmm(row.end)}
                    </td>
                    {WEEK_DOWS.map((d) => {
                      const cell = row.cells.get(d) ?? []
                      return (
                        <td key={d} className="align-top">
                          {cell.length === 0 ? (
                            <div className="min-h-[2.5rem] rounded-lg bg-gray-50" />
                          ) : (
                            <div className="space-y-1.5">
                              {cell.map((c: any) => (
                                <Link key={c.id} href={`/${locale}/classes/${c.id}`}
                                  data-testid="week-chip" data-class-en={c.name_en}
                                  className={cn('block rounded-lg px-2.5 py-2 text-xs font-medium text-white ring-1 ring-black/5 transition-transform hover:scale-[1.02]',
                                    disciplineColor.get(c.discipline_id) || 'bg-[#cd1419]')}>
                                  <span className="block truncate font-semibold">{lname(c)}</span>
                                  <span className="block truncate opacity-80" dir="ltr">{hhmm(row.start)} · {coachName(c.coach_id)}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ── Day · Coach diary ── */
        <div>
          <p className="mb-3 text-sm text-gray-500">
            {fmtDay.toLocaleDateString(dateLocale(locale), { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {diary.length === 0 ? (
            <p className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-400 shadow-sm">{t('noEvents')}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="coach-diary">
              {diary.map((col) => (
                <div key={col.coachId} className="rounded-2xl border bg-white p-3 shadow-sm" data-testid="diary-coach-column" data-coach-id={col.coachId}>
                  {/* TEAM-1: the column header is the door into the coach's file. */}
                  <Link href={`/${locale}/coaches/${col.coachId}`} data-testid="diary-coach-header" data-coach-link="1"
                    className={cn('mb-2 flex items-center gap-2 border-b pb-2 text-sm font-bold text-gray-900 hover:text-[#cd1419]', isRTL && 'font-arabic')}>
                    <Avatar
                      url={one((coaches ?? []).find((c: any) => c.id === col.coachId)?.profiles)?.avatar_url}
                      name={coachName(col.coachId) || '—'}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{coachName(col.coachId) || '—'}</span>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-gray-300', isRTL && 'rotate-180')} />
                  </Link>
                  {col.classes.length === 0 && col.pts.length === 0 && col.gaps.length === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-400">{t('noEventsCoach')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {col.classes.map(({ cls, slot }: any) => (
                        <Link key={slot.id} href={`/${locale}/classes/${cls.id}`}
                          data-testid="diary-class-block"
                          className={cn('block rounded-lg px-2.5 py-2 text-xs font-medium text-white',
                            disciplineColor.get(cls.discipline_id) || 'bg-[#cd1419]')}>
                          <span className="block truncate font-semibold">{lname(cls)}</span>
                          <span className="block opacity-80" dir="ltr">{hhmm(slot.start_time)}–{hhmm(slot.end_time)}</span>
                        </Link>
                      ))}
                      {col.pts.map((s: any) => (
                        <Link key={s.id} href={`/${locale}/pt`}
                          data-testid="diary-pt-block" data-status={s.status}
                          className="block rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100">
                          <span className="flex items-center gap-1 font-semibold"><Dumbbell className="h-3 w-3" /> {t('ptSession')} · {localizedName(one(one(s.students)?.profiles), locale)}</span>
                          <span className="block opacity-70" dir="ltr">
                            {hmInTz(s.scheduled_at, tz)}
                            {` · ${s.duration_minutes ?? 60}${t('min')}`}
                          </span>
                        </Link>
                      ))}
                      {/* TEAM-1: PUBLISHED-but-unbooked windows — the PT-upsell signal. */}
                      {col.gaps.map((g, i) => (
                        <div key={`gap-${i}`} data-testid="diary-availability-gap"
                          className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-700">
                          <span className="flex items-center gap-1 font-semibold"><Clock className="h-3 w-3" /> {tTeam('diary.openGap')}</span>
                          <span className="block opacity-80" dir="ltr">{g.start}–{g.end}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* "Who's free" → book it: empty-state hint + the PT-2 picker. */}
                  {col.pts.length === 0 && (
                    <p className="mt-2 text-center text-[11px] text-gray-400" data-testid="diary-no-pt">{tTeam('diary.noPt')}</p>
                  )}
                  <DiaryBookPt assignments={diaryAssignByCoach.get(col.coachId) ?? []} locale={locale} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
