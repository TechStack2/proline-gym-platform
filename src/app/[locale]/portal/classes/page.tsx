import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { PortalClassesClient } from './portal-classes-client'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string }; searchParams?: { kid?: string } }

/**
 * Member-facing class browse + request + status (Cycle 5 / V1 / B2 · T1/T6).
 * Lists the gym's active classes with their monthly fee; the member requests a
 * recurring registration and sees their status (requested / active / waitlisted
 * #n) per class. Attendance stays B1 (portal/schedule). Arabic-RTL.
 */
export default async function PortalClassesPage({ params: { locale }, searchParams }: Props) {
  const tt = await getTranslations('portalClasses')
  const isRTL = locale === 'ar'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single()
  const gymId = profile?.gym_id
  if (!gymId) return null
  const { data: ownStudent } = await supabase.from('students').select('id').eq('profile_id', user.id).maybeSingle()

  // B3: a linked guardian can act FOR a kid (?kid=<studentId>). The link is
  // verified server-side (guardian RLS makes a non-linked kid unreadable).
  let kid: { id: string; name: string } | null = null
  if (searchParams?.kid) {
    const { data: kidRow } = await supabase
      .from('students')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('id', searchParams.kid)
      .maybeSingle()
    if (kidRow) {
      const { localizedName: ln, one: o } = await import('@/lib/names')
      kid = { id: kidRow.id, name: ln(o((kidRow as any).profiles), locale) }
    }
  }
  const student = kid ? { id: kid.id } : ownStudent

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
        .select('id, class_id, status, waitlist_position, monthly_fee_usd, end_date')
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
        <h1 className={cn('hidden md:block text-lg font-bold text-gray-900', isRTL && 'font-arabic text-right')}>
          {tt('title')}
        </h1>
        <p className={cn('text-sm text-gray-500 mt-0.5', isRTL && 'text-right')}>
          {tt('subtitle')}
        </p>
      </div>
      {kid && (
        <p data-testid="acting-for-kid" className="rounded-xl bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700">
          {isRTL ? `أنت تتصرف نيابة عن: ${kid.name}` : `Acting for: ${kid.name}`}
        </p>
      )}
      <PortalClassesClient classes={classes} locale={locale} hasStudent={!!student} kidId={kid?.id} />
    </div>
  )
}
