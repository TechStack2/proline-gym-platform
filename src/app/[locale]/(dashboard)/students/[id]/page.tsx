import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { StudentDetail } from '../components/student-detail'

export default async function StudentDetailPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string }
}) {
  const supabase = await createClient()
  const t = await getTranslations('students')

  // Fetch student with profile data
  const { data: student, error } = await supabase
    .from('students')
    .select(`
      *,
      profiles!inner (
        id,
        first_name_ar,
        first_name_en,
        first_name_fr,
        last_name_ar,
        last_name_en,
        last_name_fr,
        phone,
        avatar_url
      )
    `)
    .eq('id', id)
    .single()

  if (error || !student) {
    notFound()
  }

  // Fetch attendance records
  const { data: attendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('student_id', id)
    .order('date', { ascending: false })
    .limit(30)

  return (
    <StudentDetail
      student={student}
      memberships={[]}
      attendance={attendance || []}
      beltProgressions={[]}
      locale={locale}
    />
  )
}
