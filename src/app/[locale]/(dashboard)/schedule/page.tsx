import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import WeeklySchedule from './WeeklySchedule'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

async function getScheduleData() {
  const supabase = await createClient()
  
  const [classesResult, disciplinesResult, coachesResult] = await Promise.all([
    supabase
      .from('classes')
      .select(`
        *,
        discipline:disciplines(id, name_ar, name_en, name_fr),
        coach:coaches(id, first_name, last_name),
        schedules:class_schedules(*)
      `)
      .eq('status', 'active'),
    supabase
      .from('disciplines')
      .select('*')
      .eq('status', 'active')
      .order('name_en'),
    supabase
      .from('coaches')
      .select('*')
      .eq('status', 'active')
      .order('first_name'),
  ])

  const classes = classesResult.data || []
  const disciplines = disciplinesResult.data || []
  const coaches = coachesResult.data || []

  // Get enrollment counts
  const classIds = classes.map(c => c.id)
  const { data: enrollments } = await supabase
    .from('class_enrollments')
    .select('class_id')
    .in('class_id', classIds)
    .eq('status', 'active')

  const enrollmentCounts: { [key: string]: number } = {}
  if (enrollments) {
    enrollments.forEach(e => {
      enrollmentCounts[e.class_id] = (enrollmentCounts[e.class_id] || 0) + 1
    })
  }

  return {
    classes: classes.map(c => ({
      ...c,
      enrollments_count: enrollmentCounts[c.id] || 0
    })),
    disciplines,
    coaches,
  }
}

export default async function SchedulePage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const { classes, disciplines, coaches } = await getScheduleData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weekly Schedule</h1>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <WeeklySchedule
          classes={classes}
          disciplines={disciplines}
          coaches={coaches}
          locale={locale}
        />
      </Suspense>
    </div>
  )
}