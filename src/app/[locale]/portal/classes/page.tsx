import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { PortalClassesClient } from './portal-classes-client'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string } }

/**
 * Member-facing class browse + request + status (Cycle 5 / V1 / B2 · T1/T6).
 * Lists the gym's active classes with their monthly fee; the member requests a
 * recurring registration and sees their status (requested / active / waitlisted
 * #n) per class. Attendance stays B1 (portal/schedule). Arabic-RTL.
 */
export default async function PortalClassesPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null
  const { data: student } = await supabase.from('students').select('id').eq('profile_id', user.id).maybeSingle()

  const { data: classesRaw } = await supabase
    .from('classes')
    .select(`id, name_ar, name_en, name_fr, monthly_fee_usd, monthly_fee_lbp, max_capacity, status,
      coach:coaches(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      schedules:class_schedules(day_of_week, start_time, end_time)`)
    .eq('gym_id', gymId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const { data: regs } = student
    ? await supabase
        .from('class_registrations')
        .select('id, class_id, status, waitlist_position, monthly_fee_usd')
        .eq('student_id', student.id)
        .order('requested_at', { ascending: false })
    : { data: [] as any[] }

  // Latest OPEN registration per class (requested/active/waitlisted).
  const openByClass = new Map<string, any>()
  for (const r of (regs ?? []) as any[]) {
    if (['requested', 'active', 'waitlisted'].includes(r.status) && !openByClass.has(r.class_id)) {
      openByClass.set(r.class_id, r)
    }
  }

  const classes = (classesRaw ?? []).map((c: any) => ({
    id: c.id,
    name: (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en,
    coachName: localizedName(one(c.coach)?.profiles, locale),
    monthly_fee_usd: c.monthly_fee_usd,
    monthly_fee_lbp: c.monthly_fee_lbp,
    schedules: c.schedules ?? [],
    registration: openByClass.get(c.id) ?? null,
  }))

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      <div>
        <h1 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic text-right')}>
          {isRTL ? 'الحصص' : 'Classes'}
        </h1>
        <p className={cn('text-sm text-gray-500 mt-0.5', isRTL && 'text-right')}>
          {isRTL ? 'سجّل في حصة متكررة برسوم شهرية' : 'Register for a recurring class for a monthly fee'}
        </p>
      </div>
      <PortalClassesClient classes={classes} locale={locale} hasStudent={!!student} />
    </div>
  )
}
