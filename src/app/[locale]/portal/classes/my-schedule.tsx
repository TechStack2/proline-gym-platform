import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { fmtTimeRange, fmtWeekday } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { categoryAttr } from '@/lib/design/category-color'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'

/**
 * DS 2.0 §3 (RULED) — the member's weekly schedule, now the "Schedule" segment
 * of the merged Classes surface (was the standalone /portal/schedule tab).
 * Query and rendering carried over intact; new here per the ruling's DA-50
 * rider: TODAY's group is highlighted first-class, and the empty state's CTA
 * points at the Browse segment (self-serve, not "contact reception").
 */
export async function MySchedule({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'portalSchedule' })
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select(`
      id, class_id,
      classes:class_id (
        id, name_en, name_ar, name_fr, room,
        discipline_id,
        disciplines:discipline_id (name_en, name_ar, name_fr),
        coach_id,
        coaches:coach_id (
          profile_id,
          profiles:profile_id (first_name_en, first_name_ar, first_name_fr, last_name_en, last_name_ar, last_name_fr)
        ),
        class_schedules ( day_of_week, start_time, end_time )
      )
    `)
    .eq('student_id', student?.id)
    .eq('is_active', true)

  // W3a §2.7: weekday names via the fmt module (Intl) — the three hand-rolled
  // parallel arrays die.
  const dayLabel = (d: number) => fmtWeekday(d, locale, isRTL ? 'long' : 'short')

  const className = (cls: any) => {
    if (!cls) return 'Unknown'
    return isRTL ? cls.name_ar || cls.name_en :
           locale === 'fr' ? cls.name_fr || cls.name_en :
           cls.name_en
  }

  const coachName = (coach: any) => {
    const p = coach?.profiles
    if (!p) return ''
    const fn = isRTL ? p.first_name_ar : (locale === 'fr' ? p.first_name_fr : p.first_name_en)
    const ln = isRTL ? p.last_name_ar : (locale === 'fr' ? p.last_name_fr : p.last_name_en)
    return [fn, ln].filter(Boolean).join(' ')
  }

  const discipline = (disc: any) => {
    if (!disc) return ''
    return isRTL ? disc.name_ar || disc.name_en :
           locale === 'fr' ? disc.name_fr || disc.name_en :
           disc.name_en
  }

  // Group by day of week; a class can have multiple weekly slots.
  const scheduleByDay: Record<number, any[]> = {}
  enrollments?.forEach((enr: any) => {
    const cls = Array.isArray(enr.classes) ? enr.classes[0] : enr.classes
    const slots: any[] = cls?.class_schedules || []
    for (const sched of slots) {
      const dow = sched.day_of_week
      if (!scheduleByDay[dow]) scheduleByDay[dow] = []
      scheduleByDay[dow].push({ ...enr, classes: cls, schedule: sched })
    }
  })

  const todayDow = new Date().getDay()
  // DA-50: today first, then the rest of the week in rolling order.
  const sortedDays = Object.keys(scheduleByDay).map(Number)
    .sort((a, b) => ((a - todayDow + 7) % 7) - ((b - todayDow + 7) % 7))

  return (
    /* W3a R3: the undefined `rtl` class swept (DA-61). */
    <div className="space-y-4" data-testid="my-schedule">
      {sortedDays.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <CalendarDays className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {t('empty')}
          </p>
          <Link href={`/${locale}/portal/classes?view=browse`} data-testid="schedule-empty-browse-cta"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-800">
            <Search className="h-4 w-4" aria-hidden /> {t('emptyBrowseCta')}
          </Link>
        </div>
      ) : (
        sortedDays.map((dow) => (
          <div key={dow} data-testid={dow === todayDow ? 'schedule-day-today' : undefined}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              {dayLabel(dow)}
              {dow === todayDow && (
                <span className="rounded-full bg-primary-700 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-primary-foreground">
                  {t('today')}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {scheduleByDay[dow].map((enr: any, i: number) => (
                <div key={i} className={cn('rounded-2xl bg-white p-4 shadow-sm', dow === todayDow && 'ring-1 ring-primary-200')}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{className(enr.classes)}</p>
                      {/* W3a/DA-38: a discipline is a CATEGORY, not a warning —
                          the brand-red label becomes its DISC-COLOR tint chip. */}
                      {discipline(enr.classes?.disciplines) && (
                        <span
                          className="cat-tint mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          data-cat={categoryAttr(enr.classes?.discipline_id)}
                        >
                          {discipline(enr.classes?.disciplines)}
                        </span>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="h-3.5 w-3.5" />
                        {/* DA-7: the range is ONE isolated unit — "21:30 - 20:00"
                            (classes ending before they start) dies here. */}
                        <Ltr>{fmtTimeRange(enr.schedule?.start_time, enr.schedule?.end_time, locale)}</Ltr>
                      </div>
                      {enr.classes?.room && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <MapPin className="h-3 w-3" />
                          <span>{enr.classes.room}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {enr.classes?.coaches && (
                    <p className="text-xs text-gray-500 mt-2">
                      {t('coach')}: {coachName(enr.classes.coaches)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
