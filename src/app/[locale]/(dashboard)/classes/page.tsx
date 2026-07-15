import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import ClassesList from './ClassesList'
import { WorkspaceSegments } from '@/components/layout/WorkspaceSegments'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

async function getClasses(searchParams: { [key: string]: string | undefined }) {
  const supabase = await createClient()

  // ADM-2 sweep: classes_read RLS is all-authenticated → without an explicit
  // gym filter this list showed OTHER gyms' classes in a multi-gym DB; archived
  // classes also lingered (ADM-1 archive = is_active=false).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()

  let query = supabase
    .from('classes')
    .select(`
      *,
      discipline:disciplines(id, name_ar, name_en, name_fr),
      coach:coaches(id, is_active, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
      schedules:class_schedules(*)
    `)
    .eq('gym_id', me?.gym_id ?? '')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (searchParams.search) {
    query = query.or(`name_ar.ilike.%${searchParams.search}%,name_en.ilike.%${searchParams.search}%,name_fr.ilike.%${searchParams.search}%`)
  }

  if (searchParams.discipline_id) {
    query = query.eq('discipline_id', searchParams.discipline_id)
  }

  if (searchParams.coach_id) {
    query = query.eq('coach_id', searchParams.coach_id)
  }

  if (searchParams.day_of_week) {
    query = query.contains('schedules', [{ day_of_week: parseInt(searchParams.day_of_week) }])
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }

  const { data: classes, error } = await query

  if (error) {
    console.error('Error fetching classes:', error)
    return []
  }

  // Get enrollment counts for each class (active = is_active; there is no .status col)
  const classIds = classes.map(c => c.id)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('class_id')
    .in('class_id', classIds)
    .eq('is_active', true)

  // Count enrollments per class
  const enrollmentCounts: { [key: string]: number } = {}
  if (enrollments) {
    enrollments.forEach(e => {
      enrollmentCounts[e.class_id] = (enrollmentCounts[e.class_id] || 0) + 1
    })
  }

  return classes.map(c => ({
    ...c,
    enrollments_count: enrollmentCounts[c.id] || 0
  }))
}

async function getDisciplines() {
  const supabase = await createClient()
  // SSOT + tenant isolation: disciplines_read RLS allows ALL authenticated
  // users to read every gym's rows — scope explicitly to the staff gym.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = await supabase.from('profiles').select('gym_id').eq('id', user?.id ?? '').single()
  const { data } = await supabase
    .from('disciplines')
    .select('*')
    .eq('gym_id', me?.gym_id ?? '')
    .eq('is_active', true)
    .order('sort_order')
  return data || []
}

async function getCoaches() {
  const supabase = await createClient()
  // Names live on profiles; coaches has no name column. Active = is_active.
  const { data } = await supabase
    .from('coaches')
    .select('id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url)')
    .eq('is_active', true)
  return data || []
}

export default async function ClassesPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { [key: string]: string | undefined }
}) {
  const [classes, disciplines, coaches] = await Promise.all([
    getClasses(searchParams),
    getDisciplines(),
    getCoaches(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-2xl font-bold">Classes</h1>
        <WorkspaceSegments
          locale={locale}
          active="classes"
          segments={[
            { key: 'schedule', label: locale === 'ar' ? 'الجدول' : locale === 'fr' ? 'Horaire' : 'Schedule', path: '/schedule' },
            { key: 'classes', label: locale === 'ar' ? 'الحصص' : locale === 'fr' ? 'Cours' : 'Classes', path: '/classes' },
          ]}
        />
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ClassesList
          classes={classes}
          disciplines={disciplines}
          coaches={coaches}
          locale={locale}
          autoNew={searchParams.new === '1'}
        />
      </Suspense>
    </div>
  )
}