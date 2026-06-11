import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { getDailyTally } from '@/lib/billing/daily-tally'
import { METHOD_LABEL } from '@/lib/billing/reconcile'
import { UserPlus, Users, DollarSign, ClipboardList, Dumbbell, CalendarDays } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

/**
 * /today — the front-desk workspace (IA-1, staff landing). The daily slice of
 * both calendar species: today's recurring classes (one tap into the existing
 * attendance marking) + today's PT appointments (into the C1 lifecycle), the
 * walk-in quick actions, and the day's per-method collections tally (same logic
 * as D1's cash drawer). Recomposition only — every link lands on an existing,
 * verified flow.
 */
export default async function TodayPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const t = await getTranslations('today')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null

  const now = new Date()
  const dow = now.getDay() // 0=Sunday … 6=Saturday (class_schedules convention)
  const dayStart = now.toISOString().slice(0, 10)

  // ── Today's classes: schedules for today's weekday, gym-scoped + active ──
  const { data: schedules } = await supabase
    .from('class_schedules')
    .select(`id, day_of_week, start_time, end_time, is_active,
      classes:class_id (id, gym_id, is_active, name_ar, name_en, name_fr, max_capacity, color,
        disciplines:discipline_id (name_ar, name_en, name_fr))`)
    .eq('day_of_week', dow)
    .eq('is_active', true)
    .order('start_time')

  const todayClasses = (schedules ?? [])
    .map((s: any) => ({ ...s, cls: one(s.classes) }))
    .filter((s: any) => s.cls && s.cls.gym_id === gymId && s.cls.is_active)

  // Enrolled counts for those classes (roster = class_enrollments, B1).
  const classIds = [...new Set(todayClasses.map((s: any) => s.cls.id))]
  const { data: enrollments } = classIds.length
    ? await supabase.from('class_enrollments').select('class_id').in('class_id', classIds).eq('is_active', true)
    : { data: [] as { class_id: string }[] }
  const enrolledBy = new Map<string, number>()
  for (const e of enrollments ?? []) enrolledBy.set(e.class_id, (enrolledBy.get(e.class_id) ?? 0) + 1)

  // ── Today's PT sessions (C1) ──
  const { data: ptSessions } = await supabase
    .from('pt_sessions')
    .select(`id, scheduled_at, duration_minutes, status,
      coaches:coach_id (gym_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      students:student_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .gte('scheduled_at', `${dayStart}T00:00:00`)
    .lt('scheduled_at', `${dayStart}T23:59:59`)
    .order('scheduled_at')

  const todayPt = (ptSessions ?? []).filter((s: any) => one(s.coaches)?.gym_id === gymId)

  // ── Today's collections (per-method, D1 tally logic) ──
  const tally = await getDailyTally(supabase, dayStart)

  const hhmm = (v: string | null) => (v || '').slice(0, 5)
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(isRTL ? 'ar-LB' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  const clsName = (c: any) => (isRTL ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en
  const localName = (rel: any) => localizedName(one(rel)?.profiles, locale)

  const quickActions = [
    { key: 'newLead', icon: UserPlus, href: `/${locale}/leads`, testid: 'quick-new-lead' },
    { key: 'newMember', icon: Users, href: `/${locale}/students/add`, testid: 'quick-new-member' },
    { key: 'recordPayment', icon: DollarSign, href: `/${locale}/payments/new`, testid: 'quick-record-payment' },
  ] as const

  return (
    <div className={cn('space-y-6 p-4 md:p-0', isRTL && 'rtl text-right')}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {now.toLocaleDateString(isRTL ? 'ar-LB' : locale === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href={`/${locale}/schedule?view=day`} data-testid="open-diary-link"
          className="text-sm font-medium text-primary-600 hover:underline">
          {t('openDiary')}
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => {
          const Icon = a.icon
          return (
            <Link key={a.key} href={a.href} data-testid={a.testid}
              className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center shadow-sm transition-colors hover:bg-primary-50">
              <Icon className="h-6 w-6 text-primary-600" />
              <span className="text-xs font-medium text-gray-700">{t(`quick.${a.key}`)}</span>
            </Link>
          )
        })}
      </div>

      {/* Today's classes */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <CalendarDays className="h-4 w-4 text-primary-600" /> {t('classes')}
        </h2>
        {todayClasses.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-400 shadow-sm">{t('noClasses')}</p>
        ) : (
          <div className="space-y-2" data-testid="today-classes">
            {todayClasses.map((s: any) => {
              const disc = one(s.cls.disciplines)
              return (
                <Link key={s.id} href={`/${locale}/attendance`} data-testid="today-class-row"
                  className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: s.cls.color || '#cd1419' }} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{clsName(s.cls)}</p>
                      <p className="text-xs text-gray-500" dir="ltr">
                        {hhmm(s.start_time)}–{hhmm(s.end_time)}
                        {disc ? ` · ${(isRTL ? disc.name_ar : locale === 'fr' ? disc.name_fr : disc.name_en) || disc.name_en}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {enrolledBy.get(s.cls.id) ?? 0}/{s.cls.max_capacity}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                      <ClipboardList className="h-3.5 w-3.5" /> {t('markAttendance')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Today's PT sessions */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Dumbbell className="h-4 w-4 text-primary-600" /> {t('ptSessions')}
        </h2>
        {todayPt.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-400 shadow-sm">{t('noPt')}</p>
        ) : (
          <div className="space-y-2" data-testid="today-pt">
            {todayPt.map((s: any) => (
              <Link key={s.id} href={`/${locale}/pt`} data-testid="today-pt-row"
                className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{localName(s.students)}</p>
                  <p className="text-xs text-gray-500">
                    {fmtTime(s.scheduled_at)} · {localName(s.coaches)}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">{s.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Today's collections */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <DollarSign className="h-4 w-4 text-primary-600" /> {t('collections')}
        </h2>
        <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4 text-sm shadow-sm" data-testid="today-tally">
          {tally.size === 0 ? (
            <span className="text-gray-400">{t('noPayments')}</span>
          ) : (
            [...tally.entries()].map(([method, v]) => (
              <span key={method} className="rounded-full bg-muted px-3 py-1">
                {(isRTL ? METHOD_LABEL[method]?.ar : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}
                {v.lbp ? ` · ${v.lbp.toLocaleString()} LBP` : ''}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
