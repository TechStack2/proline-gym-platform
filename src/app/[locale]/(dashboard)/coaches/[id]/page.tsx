import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { Avatar } from '@/components/shared/avatar'
import { dateLocale } from '@/lib/utils/locale-format'
import {
  Phone, MessageCircle, Award, CalendarDays, Users, Dumbbell,
  Gauge, ChevronRight, CalendarCheck,
} from 'lucide-react'
import { AvailabilityEditor, type AvailabilityRow, type OverrideRow } from '../../../coach/pt/availability-editor'
import { CoachActions } from './coach-actions'
import { CoachPublishPanel } from './CoachPublishPanel'
import type { DiaryAssignment } from '../../schedule/diary-book-pt'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string }; searchParams: { sched?: string } }

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const hhmm = (v: string | null) => (v || '').slice(0, 5)

/**
 * Coach 360 (TEAM-1) — THE coach file, the mirror of Member-360. Every panel
 * reads live data through existing tables/RLS; every action delegates to an
 * existing verified writer (coach_availability writes via the PT-2 editor;
 * book_pt_session via the shared picker; class assignment via the wizard;
 * deactivate via the role-gated setCoachActive). Reachable from the Team list
 * and the Day Diary floor lens. Zero new schema.
 */
export default async function Coach360Page({ params: { locale, id }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('coach360')
  const tc = await getTranslations('coaches')
  const supabase = await createClient()

  const { data: coach } = await supabase
    .from('coaches')
    .select(`*, profiles!inner (id, first_name_ar, first_name_en, first_name_fr,
      last_name_ar, last_name_en, last_name_fr, phone, avatar_url)`)
    .eq('id', id)
    .maybeSingle()
  if (!coach) notFound()
  const gymId = (coach as any).gym_id
  const prof: any = one((coach as any).profiles)

  // Caller role → the deactivate guardrail (owner/head_coach only).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: roleRow } = user
    ? await supabase.from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
    : { data: null }
  const callerRole = (roleRow as any)?.role ?? ''
  const canDeactivate = ['owner', 'head_coach'].includes(callerRole)
  // COACH-LP: the coach's pending profile draft (if any) for the publish panel.
  const { data: coachPending } = await supabase
    .from('coach_profile_pending').select('*').eq('coach_id', id).maybeSingle()

  // COACH-PHOTO-GATE: sign the staged draft photo (PRIVATE bucket) so staff can
  // review the before/after; RLS lets in-gym staff read it.
  let draftPhotoUrl: string | null = null
  if ((coachPending as any)?.avatar_url) {
    const { data: signed } = await supabase.storage
      .from('coach-avatar-drafts')
      .createSignedUrl((coachPending as any).avatar_url, 3600)
    draftPhotoUrl = signed?.signedUrl ?? null
  }

  // Schedule window (day/week toggle).
  const schedView = searchParams?.sched === 'day' ? 'day' : 'week'
  const now = new Date()
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  const dow = now.getDay()
  const weekStart = new Date(startOfToday); weekStart.setDate(startOfToday.getDate() - (dow === 0 ? 6 : dow - 1))
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const todayEnd = new Date(startOfToday); todayEnd.setDate(startOfToday.getDate() + 1)
  const ptWinStart = schedView === 'day' ? startOfToday : weekStart
  const ptWinEnd = schedView === 'day' ? todayEnd : weekEnd

  const profSel = `id, profiles:profile_id (id, first_name_ar, first_name_en, first_name_fr,
    last_name_ar, last_name_en, last_name_fr, avatar_url)`

  const [
    { data: classes },
    { data: availWindows },
    { data: availOverrides },
    { data: ptAssignRows },
    { data: ptSchedule },
    { count: ptWeek },
    { count: ptMonth },
  ] = await Promise.all([
    supabase.from('classes')
      .select('id, name_ar, name_en, name_fr, discipline_id, max_capacity, schedules:class_schedules(id, day_of_week, start_time, end_time, is_active)')
      .eq('coach_id', id).eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase.from('coach_availability')
      .select('id, day_of_week, start_time, end_time, is_active')
      .eq('coach_id', id).eq('gym_id', gymId).order('day_of_week'),
    supabase.from('coach_availability_overrides')
      .select('id, date, kind, start_time, end_time')
      .eq('coach_id', id).eq('gym_id', gymId)
      .gte('date', startOfToday.toISOString().slice(0, 10)).order('date'),
    supabase.from('pt_assignments')
      .select(`id, status, is_active, sessions_remaining, expires_at, purchased_at,
        pt_packages:package_id (name_ar, name_en, name_fr), students:student_id (${profSel})`)
      .eq('coach_id', id).eq('status', 'active').eq('is_active', true)
      .order('purchased_at', { ascending: false, nullsFirst: false }),
    supabase.from('pt_sessions')
      .select(`id, scheduled_at, duration_minutes, status, students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
      .eq('coach_id', id).neq('status', 'cancelled')
      .gte('scheduled_at', ptWinStart.toISOString()).lt('scheduled_at', ptWinEnd.toISOString())
      .order('scheduled_at'),
    supabase.from('pt_sessions').select('id', { count: 'exact', head: true })
      .eq('coach_id', id).neq('status', 'cancelled')
      .gte('scheduled_at', weekStart.toISOString()).lt('scheduled_at', weekEnd.toISOString()),
    supabase.from('pt_sessions').select('id', { count: 'exact', head: true })
      .eq('coach_id', id).neq('status', 'cancelled')
      .gte('scheduled_at', monthStart.toISOString()).lt('scheduled_at', monthEnd.toISOString()),
  ])

  // Roster — class members (class_enrollments in this coach's active classes).
  const activeClassIds = ((classes ?? []) as any[]).map((c) => c.id)
  const { data: enrollRows } = activeClassIds.length
    ? await supabase.from('class_enrollments')
        .select(`class_id, students:student_id (${profSel})`)
        .in('class_id', activeClassIds).eq('is_active', true)
    : { data: [] as any[] }

  const lname = (row: any) => ((isRTL ? row?.name_ar : locale === 'fr' ? row?.name_fr : row?.name_en) || row?.name_en || '')

  // Distinct class members → each links to Member-360.
  const memberMap = new Map<string, { id: string; name: string; avatarUrl: string | null }>()
  for (const e of (enrollRows ?? []) as any[]) {
    const st = one(e.students)
    if (!st) continue
    if (!memberMap.has(st.id)) memberMap.set(st.id, { id: st.id, name: localizedName(one(st.profiles), locale), avatarUrl: one(st.profiles)?.avatar_url ?? null })
  }
  const classMembers = [...memberMap.values()].filter((m) => m.name)

  // Distinct PT clients (active assignments) → each links to Member-360.
  const ptClientMap = new Map<string, { id: string; name: string; avatarUrl: string | null; remaining: number }>()
  for (const a of (ptAssignRows ?? []) as any[]) {
    const st = one(a.students)
    if (!st) continue
    const prev = ptClientMap.get(st.id)
    const remaining = a.sessions_remaining ?? 0
    if (!prev) ptClientMap.set(st.id, { id: st.id, name: localizedName(one(st.profiles), locale), avatarUrl: one(st.profiles)?.avatar_url ?? null, remaining })
    else prev.remaining += remaining
  }
  const ptClients = [...ptClientMap.values()].filter((c) => c.name)

  // Bookable assignments for the quick-action picker (PT-2: remaining + unexpired).
  const bookableAssignments: DiaryAssignment[] = ((ptAssignRows ?? []) as any[])
    .filter((a) => (a.sessions_remaining ?? 0) > 0 && (!a.expires_at || new Date(a.expires_at) >= new Date()))
    .map((a) => ({ id: a.id, studentName: localizedName(one(one(a.students)?.profiles), locale), remaining: a.sessions_remaining ?? 0 }))
    .filter((a) => a.studentName)

  // Load/utilization counts.
  const activeClassCount = (classes ?? []).length
  const weeklySlots = ((classes ?? []) as any[]).reduce(
    (n, c) => n + ((c.schedules ?? []).filter((s: any) => s.is_active !== false).length), 0)
  const activePtCount = (ptAssignRows ?? []).length

  const name = localizedName((coach as any).profiles, locale)
  const specialization = (isRTL ? (coach as any).specialization_ar : locale === 'fr' ? (coach as any).specialization_fr : (coach as any).specialization_en) || (coach as any).specialization_en
  const waPhone = (prof?.phone || '').replace(/[^0-9]/g, '')
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(locale), { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale(locale), { weekday: 'short', day: 'numeric', month: 'short' })

  const Panel = ({ icon: Icon, title, testid, id: anchorId, action, children }: { icon: any; title: string; testid: string; id?: string; action?: React.ReactNode; children: React.ReactNode }) => (
    <section id={anchorId} className="scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm" data-testid={testid}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={cn('flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Icon className="h-4 w-4 text-primary-600" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
  const Empty = ({ text }: { text: string }) => <p className="py-3 text-center text-sm text-gray-400">{text}</p>

  return (
    <div className={cn('space-y-4', isRTL && 'rtl text-right')} data-testid="coach-360">
      {/* ── Header: identity + specialties + contact ── */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar url={prof?.avatar_url} name={name} size="lg" />
            <div>
              <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="coach-name">{name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {specialization && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 font-medium text-primary-700" data-testid="coach-specialty-chip">
                    <Award className="h-3 w-3" />{specialization}
                  </span>
                )}
                {(coach as any).belt_rank && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 capitalize">
                    {String((coach as any).belt_rank).replace(/_/g, ' ')}
                  </span>
                )}
                <span className={cn('rounded-full px-2 py-0.5 font-medium', (coach as any).is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')} data-testid="coach-active-badge">
                  {(coach as any).is_active ? tc('status.active') : tc('status.inactive')}
                </span>
              </p>
              {prof?.phone && (
                <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <a href={`tel:${prof.phone}`} className="inline-flex items-center gap-1 hover:text-primary-600" data-testid="coach-tel" dir="ltr">
                    <Phone className="h-3 w-3" />{prof.phone}
                  </a>
                  {waPhone && (
                    <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-600 hover:underline" data-testid="coach-wa">
                      <MessageCircle className="h-3 w-3" />WhatsApp
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
          {/* Quick actions — all delegate to existing verified flows. */}
          <CoachActions
            coachId={id}
            coachName={name}
            locale={locale}
            isActive={!!(coach as any).is_active}
            canDeactivate={canDeactivate}
            activeClassCount={activeClassCount}
            activePtCount={activePtCount}
            assignments={bookableAssignments}
          />
        </div>
      </div>

      {/* COACH-LP — landing showcase publish: pending draft + admin gate */}
      <CoachPublishPanel
        coachId={id}
        locale={locale}
        canPublish={canDeactivate}
        live={{
          specialization_ar: (coach as any).specialization_ar ?? '',
          specialization_en: (coach as any).specialization_en ?? '',
          specialization_fr: (coach as any).specialization_fr ?? '',
          bio_ar: (coach as any).bio_ar ?? '',
          bio_en: (coach as any).bio_en ?? '',
          bio_fr: (coach as any).bio_fr ?? '',
        }}
        pending={coachPending ?? null}
        hasPending={!!(coach as any).has_pending_changes}
        landingVisible={!!(coach as any).landing_visible}
        landingStatus={(coach as any).landing_status ?? 'active'}
        lastPublishedAt={(coach as any).last_published_at ?? null}
        name={name}
        livePhotoUrl={prof?.avatar_url ?? null}
        draftPhotoUrl={draftPhotoUrl}
        hasPhotoDraft={!!(coachPending as any)?.avatar_url}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 1. Schedule (classes + PT, day/week toggle) ── */}
        <Panel
          icon={CalendarDays}
          title={t('schedule')}
          testid="panel-coach-schedule"
          action={
            <div className="inline-flex rounded-lg border bg-gray-50 p-0.5 text-xs" data-testid="coach-sched-toggle">
              <Link href={`/${locale}/coaches/${id}?sched=week`} data-testid="coach-sched-week"
                className={cn('rounded-md px-2 py-0.5 font-medium', schedView === 'week' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500')}>{t('week')}</Link>
              <Link href={`/${locale}/coaches/${id}?sched=day`} data-testid="coach-sched-day"
                className={cn('rounded-md px-2 py-0.5 font-medium', schedView === 'day' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500')}>{t('day')}</Link>
            </div>
          }
        >
          {/* Recurring class slots */}
          {activeClassCount === 0 ? <Empty text={t('noClasses')} /> : (
            <ul className="space-y-1.5">
              {((classes ?? []) as any[]).map((c) => {
                const slots = ((c.schedules ?? []) as any[]).filter((s) => s.is_active !== false)
                  .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
                return (
                  <li key={c.id} className="flex items-center justify-between text-sm" data-testid="coach-class-row">
                    <Link href={`/${locale}/classes/${c.id}`} className="font-medium text-gray-800 hover:text-primary-600">{lname(c)}</Link>
                    <span className="text-xs text-gray-500" dir="ltr">
                      {slots.length === 0 ? '—' : `${[...new Set(slots.map((s: any) => t(`days.${DAY_KEYS[s.day_of_week]}` as any)))].join(', ')} · ${hhmm(slots[0].start_time)}–${hhmm(slots[0].end_time)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {/* PT sessions for the chosen window */}
          <div className="mt-3 border-t pt-2">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
              <Dumbbell className="h-3 w-3" /> {schedView === 'day' ? t('ptToday') : t('ptThisWeek')}
            </p>
            {(ptSchedule ?? []).length === 0 ? (
              <p className="py-1 text-xs text-gray-400" data-testid="coach-pt-empty">{t('noPtWindow')}</p>
            ) : (
              <ul className="space-y-1">
                {((ptSchedule ?? []) as any[]).map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-xs text-gray-600" data-testid="coach-pt-session" data-status={s.status}>
                    <span>{localizedName(one(one(s.students)?.profiles), locale)}</span>
                    <span dir="ltr">{fmtDate(s.scheduled_at)} · {fmtTime(s.scheduled_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* ── 2. Load / utilization ── */}
        <Panel icon={Gauge} title={t('load')} testid="panel-coach-load">
          <div className="grid grid-cols-2 gap-3" data-testid="coach-load-grid">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-900" data-testid="load-classes">{activeClassCount}</p>
              <p className="text-xs text-gray-500">{t('activeClasses')}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-900">{weeklySlots}</p>
              <p className="text-xs text-gray-500">{t('weeklySlots')}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-900" data-testid="load-pt-week">{ptWeek ?? 0}</p>
              <p className="text-xs text-gray-500">{t('ptWeek')}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-900" data-testid="load-pt-month">{ptMonth ?? 0}</p>
              <p className="text-xs text-gray-500">{t('ptMonth')}</p>
            </div>
          </div>
        </Panel>

        {/* ── 3. Availability (view + staff edit — PT-2 coach_availability) ── */}
        <section id="panel-availability" className="scroll-mt-4 lg:col-span-2" data-testid="panel-coach-availability">
          <AvailabilityEditor
            coachId={id}
            gymId={gymId}
            windows={(availWindows ?? []) as AvailabilityRow[]}
            overrides={(availOverrides ?? []) as OverrideRow[]}
            locale={locale}
          />
        </section>

        {/* ── 4. Roster — class members + PT clients, each → Member-360 ── */}
        <Panel icon={Users} title={`${t('roster')} · ${classMembers.length + ptClients.length}`} testid="panel-coach-roster">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500"><CalendarCheck className="h-3 w-3" /> {t('classMembers')}</p>
              {classMembers.length === 0 ? <Empty text={t('noMembers')} /> : (
                <ul className="space-y-1">
                  {classMembers.map((m) => (
                    <li key={m.id}>
                      <Link href={`/${locale}/students/${m.id}`} data-testid="coach-roster-member"
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600">
                        <Avatar url={m.avatarUrl} name={m.name} size="xs" />
                        <span className="flex-1 truncate">{m.name}</span>
                        <ChevronRight className={cn('h-3.5 w-3.5 text-gray-300', isRTL && 'rotate-180')} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t pt-2">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500"><Dumbbell className="h-3 w-3" /> {t('ptClients')}</p>
              {ptClients.length === 0 ? <Empty text={t('noPtClients')} /> : (
                <ul className="space-y-1">
                  {ptClients.map((c) => (
                    <li key={c.id}>
                      <Link href={`/${locale}/students/${c.id}`} data-testid="coach-roster-pt-client"
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600">
                        <Avatar url={c.avatarUrl} name={c.name} size="xs" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-gray-400">{t('sessionsLeft', { n: c.remaining })}</span>
                        <ChevronRight className={cn('h-3.5 w-3.5 text-gray-300', isRTL && 'rotate-180')} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
