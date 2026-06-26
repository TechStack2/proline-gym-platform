import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { CalendarDays, Clock, MapPin } from 'lucide-react'

type Props = { params: { locale: string } }

export default async function PortalSchedulePage({ params: { locale } }: Props) {
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

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const daysFr = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

  const dayLabel = (d: number) => isRTL ? daysAr[d] : (locale === 'fr' ? daysFr[d] : days[d])

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

  // Group by day of week. class_schedules lives under classes (FK
  // class_schedules.class_id → classes.id); a class can have multiple weekly
  // slots (e.g. Mon + Wed), so expand one entry per slot.
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

  const sortedDays = Object.keys(scheduleByDay).map(Number).sort((a, b) => a - b)

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      {/* PORTAL-SHELL: echoes the mobile chrome large title → desktop-only. */}
      <h2 className="hidden md:block text-lg font-bold text-gray-900">
        {t('title')}
      </h2>

      {sortedDays.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 shadow-sm text-center">
          <CalendarDays className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {t('empty')}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {t('emptyHint')}
          </p>
        </div>
      ) : (
        sortedDays.map((dow) => (
          <div key={dow}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {dayLabel(dow)}
            </h3>
            <div className="space-y-2">
              {scheduleByDay[dow].map((enr: any, i: number) => (
                <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{className(enr.classes)}</p>
                      <p className="text-sm text-[#cd1419] font-medium">{discipline(enr.classes?.disciplines)}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{enr.schedule?.start_time?.slice(0, 5)} - {enr.schedule?.end_time?.slice(0, 5)}</span>
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
