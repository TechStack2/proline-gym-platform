import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  const classData = await getClass(id)

  if (!classData) {
    notFound()
  }

  return <ClassDetail classData={classData} locale={locale} />
}