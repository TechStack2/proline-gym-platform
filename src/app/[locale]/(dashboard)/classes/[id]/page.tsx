import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassDetail from './ClassDetail'

export const dynamic = 'force-dynamic'

async function getClass(id: string) {
  const supabase = await createClient()
  
  const { data: classData, error } = await supabase
    .from('classes')
    .select(`
      *,
      discipline:disciplines(id, name_ar, name_en, name_fr),
      coach:coaches(id, first_name, last_name, email, phone),
      schedules:class_schedules(*)
    `)
    .eq('id', id)
    .single()

  if (error || !classData) {
    return null
  }

  // Get enrollments with student details
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select(`
      *,
      student:students(id, first_name, last_name, belt_rank, email, phone)
    `)
    .eq('class_id', id)
    .eq('status', 'active')
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