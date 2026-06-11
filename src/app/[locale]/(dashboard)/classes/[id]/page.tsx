import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { localizedName, one } from '@/lib/names'
import ClassDetail from './ClassDetail'

export const dynamic = 'force-dynamic'

async function getClass(id: string) {
  const supabase = await createClient()
  
  // NB: legacy embeds selected non-existent columns (coaches.first_name,
  // students.first_name/belt_rank/email, class_enrollments.status) → PostgREST
  // errored and the page 404'd. Corrected to the real normalized schema so the
  // class-detail page (and its Enroll modal) loads.
  const { data: classData, error } = await supabase
    .from('classes')
    .select(`
      *,
      discipline:disciplines(id, name_ar, name_en, name_fr),
      coach:coaches(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      schedules:class_schedules(*)
    `)
    .eq('id', id)
    .single()

  if (error || !classData) {
    return null
  }

  // Get enrollments with student details (via the normalized profiles row).
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select(`
      *,
      student:students(id, current_belt_rank, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))
    `)
    .eq('class_id', id)
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false })

  return {
    ...classData,
    enrollments: enrollments || [],
    enrollments_count: enrollments?.length || 0
  }
}

export default async function ClassDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const classData = await getClass(id)
  if (!classData) {
    notFound()
  }

  // B2: registrations (request→approve→bill→waitlist) + a member picker for walk-ins.
  const { data: regsRaw } = await supabase
    .from('class_registrations')
    .select(`id, status, waitlist_position, monthly_fee_usd, discount_pct, discount_amount_usd, invoice_id, requested_at,
      student:students(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .eq('class_id', id)
    .in('status', ['requested', 'active', 'waitlisted'])
    .order('requested_at', { ascending: true })

  const registrations = (regsRaw ?? []).map((r: any) => ({
    id: r.id, status: r.status, waitlist_position: r.waitlist_position,
    monthly_fee_usd: r.monthly_fee_usd, invoice_id: r.invoice_id,
    studentName: localizedName(one(r.student)?.profiles, locale),
  }))

  const { data: studentRows } = await supabase
    .from('students')
    .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
    .eq('gym_id', (classData as any).gym_id)
    .eq('is_active', true)
  const students = (studentRows ?? [])
    .map((s: any) => ({ id: s.id, name: localizedName(one(s.profiles), locale) }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  // ADM-1 admin bar: the edit wizard needs the gym's disciplines + active
  // coaches; archive shows the active-registrations count warning.
  const [{ data: disciplines }, { data: coaches }, { count: activeRegCount }] = await Promise.all([
    supabase.from('disciplines').select('*').eq('gym_id', (classData as any).gym_id).eq('is_active', true).order('sort_order'),
    supabase.from('coaches')
      .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url)')
      .eq('gym_id', (classData as any).gym_id)
      .eq('is_active', true),
    supabase.from('class_registrations').select('id', { count: 'exact', head: true })
      .eq('class_id', id).eq('status', 'active'),
  ])

  return (
    <ClassDetail
      classData={classData}
      locale={locale}
      registrations={registrations}
      students={students}
      disciplines={disciplines ?? []}
      coaches={coaches ?? []}
      activeRegCount={activeRegCount ?? 0}
    />
  )
}