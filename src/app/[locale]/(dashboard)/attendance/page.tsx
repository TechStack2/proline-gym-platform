import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import { AttendanceDashboardClient } from './attendance-dashboard-client'
import { cn } from '@/lib/utils'

interface AttendancePageProps {
  params: { locale: string }
  searchParams: { date?: string }
}

export default async function AttendancePage({ params: { locale }, searchParams }: AttendancePageProps) {
  const t = await getTranslations('attendance')
  const supabase = await createClient()
  const isRTL = locale === 'ar'

  // ATTENDANCE-GYM-SCOPE: resolve the caller's gym so the class_schedules read below
  // is gym-scoped AT THE QUERY. `class_schedules_read` RLS is a blanket authenticated
  // read (USING auth.role()='authenticated'), so an un-scoped select returns EVERY
  // gym's classes — a cross-tenant leak (empty rosters today only because
  // class_enrollments is separately gym-scoped, but the schedule/class rows leak).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('gym_id').eq('id', user.id).maybeSingle()
    : { data: null }
  const gymId = profile?.gym_id ?? null

  const selectedDate = searchParams.date || new Date().toISOString().split('T')[0]
  const dayOfWeek = new Date(selectedDate).getDay()

  // Fetch today's classes via class_schedules.day_of_week (correct schema).
  // NB: there is NO FK between class_schedules and class_enrollments — the
  // roster must be embedded THROUGH classes (the old top-level
  // `class_enrollments!class_id` hint errored PGRST200, leaving the marking
  // list permanently empty). Flatten back to the shape the client expects.
  // Gym-scoped via classes.gym_id (class_schedules has no gym_id): `!inner` + the
  // `classes.gym_id` filter restrict the TOP-LEVEL schedules to the caller's gym. No
  // gym context (e.g. a vendor without a gym) → no classes, never an un-scoped read.
  const { data: rawSchedules, error: classErr } = gymId
    ? await supabase
        .from('class_schedules')
        .select(`
          id, class_id, day_of_week, start_time, end_time,
          classes:class_id!inner (
            id, gym_id, name_en, name_ar, name_fr,
            discipline_id,
            disciplines:discipline_id (name_en, name_ar, name_fr),
            class_enrollments (
              id,
              student_id,
              is_active,
              students:student_id (
                id,
                profile_id,
                profiles:profile_id (first_name_en, first_name_ar, last_name_en, last_name_ar)
              )
            )
          )
        `)
        .eq('classes.gym_id', gymId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time', { ascending: true })
    : { data: [] as any[], error: null }

  if (classErr) console.error('Error fetching classes:', classErr)

  const todayClasses = (rawSchedules ?? []).map((s: any) => {
    const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes
    return {
      ...s,
      classes: cls,
      class_enrollments: (cls?.class_enrollments ?? []).filter((e: any) => e.is_active !== false),
      starting_soon: [] as any[],
    }
  })

  // BILL-CYCLES: a member whose registration start_date is in the FUTURE is on the
  // roster record but has not started yet — keep them off today's markable roster
  // and out of the counts, and surface them as "starts <date>" instead.
  const rosterStudentIds = [...new Set((todayClasses ?? []).flatMap((c: any) => (c.class_enrollments ?? []).map((e: any) => e.student_id)))]
  if (rosterStudentIds.length) {
    const classIds = [...new Set((todayClasses ?? []).map((c: any) => c.class_id))]
    const { data: startRegs } = await supabase
      .from('class_registrations')
      .select('class_id, student_id, start_date')
      .in('student_id', rosterStudentIds as string[])
      .in('class_id', classIds as string[])
      .eq('status', 'active')
      .gt('start_date', selectedDate)
    const startsAfter = new Map<string, string>()
    for (const r of (startRegs ?? []) as any[]) startsAfter.set(`${r.class_id}:${r.student_id}`, r.start_date)
    if (startsAfter.size) {
      for (const c of todayClasses) {
        const now: any[] = [], future: any[] = []
        for (const e of (c.class_enrollments ?? [])) {
          (startsAfter.has(`${c.class_id}:${e.student_id}`) ? future : now).push(e)
        }
        c.class_enrollments = now
        c.starting_soon = future.map((e: any) => {
          const stu = Array.isArray(e.students) ? e.students[0] : e.students
          const prof = stu && (Array.isArray(stu.profiles) ? stu.profiles[0] : stu.profiles)
          const first = (isRTL ? prof?.first_name_ar : prof?.first_name_en) || prof?.first_name_en || '?'
          const last = (isRTL ? prof?.last_name_ar : prof?.last_name_en) || prof?.last_name_en || ''
          return { id: e.id, name: `${first} ${last}`.trim(), startDate: startsAfter.get(`${c.class_id}:${e.student_id}`) }
        })
      }
    }
  }

  // Fetch attendance records for today
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('attendance_date', selectedDate)

  // Calculate stats
  const totalStudents = todayClasses?.reduce((acc, cls) => acc + (cls.class_enrollments?.length || 0), 0) || 0
  const presentCount = todayAttendance?.filter(a => a.status === 'present').length || 0
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0

  // Fetch weekly trend
  const weekAgo = new Date(selectedDate)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toISOString().split('T')[0]
  const { data: weeklyAttendance } = await supabase
    .from('attendance_records')
    .select('attendance_date, status')
    .gte('attendance_date', weekAgoStr)
    .lte('attendance_date', selectedDate)

  const weeklyPresent = weeklyAttendance?.filter(a => a.status === 'present').length || 0
  const weeklyTotal = weeklyAttendance?.length || 0
  const weeklyTrend = weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 100) : 0

  // Resolve class name for display
  const className = (cls: any) => {
    if (!cls?.classes) return 'Unknown'
    return isRTL ? cls.classes.name_ar || cls.classes.name_en :
           locale === 'fr' ? cls.classes.name_fr || cls.classes.name_en :
           cls.classes.name_en
  }

  const disciplineName = (cls: any) => {
    if (!cls?.classes?.disciplines) return 'Unknown'
    return isRTL ? cls.classes.disciplines.name_ar || cls.classes.disciplines.name_en :
           locale === 'fr' ? cls.classes.disciplines.name_fr || cls.classes.disciplines.name_en :
           cls.classes.disciplines.name_en
  }

    // ML-1 check-in warning (non-blocking): members lapsed (membership) or with
  // a suspended registration get a chip at marking time.
  const allStudentIds = [...new Set((todayClasses ?? []).flatMap((c: any) => (c.class_enrollments ?? []).map((e: any) => e.student_id)))]
  let warnStudentIds: string[] = []
  if (allStudentIds.length) {
    const [{ data: lapsedMs }, { data: suspRegs }] = await Promise.all([
      supabase.from('student_memberships').select('student_id').in('student_id', allStudentIds).eq('status', 'lapsed'),
      supabase.from('class_registrations').select('student_id').in('student_id', allStudentIds).eq('status', 'suspended'),
    ])
    warnStudentIds = [...new Set([...(lapsedMs ?? []), ...(suspRegs ?? [])].map((r: any) => r.student_id))]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between" dir={isRTL ? 'rtl' : 'ltr'}>
        <div>
          <h1 className="hidden md:block text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 me-2" />
          {t('dashboard.selectDate')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.todayClasses')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayClasses?.length || 0}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.scheduledToday')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalStudents')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.enrolledToday')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.attendanceRate')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceRate}%</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.todayRate')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.weeklyTrend')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyTrend}%</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.last7Days')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Classes Quick Check-in */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {todayClasses?.map((classSchedule) => (
          <Card key={classSchedule.id} className="overflow-hidden">
            <CardHeader className="bg-primary/5 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">
                  {className(classSchedule)}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {disciplineName(classSchedule)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {classSchedule.start_time?.slice(0, 5)} - {classSchedule.end_time?.slice(0, 5)}
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <Suspense fallback={<div className="text-center py-4">Loading...</div>}>
                <AttendanceDashboardClient
                  classScheduleId={classSchedule.id}
                  classId={classSchedule.class_id}
                  enrollments={(classSchedule.class_enrollments || []).map((e: any) => {
                    // Names live on profiles (normalized) — flatten to the
                    // first/last shape the marking client renders.
                    const stu = Array.isArray(e.students) ? e.students[0] : e.students
                    const prof = stu && (Array.isArray(stu.profiles) ? stu.profiles[0] : stu.profiles)
                    const first = (isRTL ? prof?.first_name_ar : prof?.first_name_en) || prof?.first_name_en || '?'
                    const last = (isRTL ? prof?.last_name_ar : prof?.last_name_en) || prof?.last_name_en || ''
                    return {
                      id: e.id,
                      student_id: e.student_id,
                      students: { id: stu?.id, first_name: first, last_name: last },
                    }
                  }) as any}
                  attendanceRecords={todayAttendance?.filter(a => a.class_id === classSchedule.class_id) || []}
                  date={selectedDate}
                  locale={locale}
                  warnStudentIds={warnStudentIds}
      />
              </Suspense>
              {/* BILL-CYCLES: members whose registration starts later — not markable yet. */}
              {(classSchedule.starting_soon?.length ?? 0) > 0 && (
                <ul data-testid="starting-soon" className="mt-3 space-y-1 border-t pt-2 text-xs text-blue-700">
                  {classSchedule.starting_soon.map((s: any) => (
                    <li key={s.id} data-testid="starts-soon-row">
                      {s.name} · {isRTL ? 'يبدأ' : locale === 'fr' ? 'Débute' : 'Starts'}{' '}
                      {new Date(String(s.startDate).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(
                        locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en',
                        { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Most Missed Classes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {t('dashboard.mostMissedClasses')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(await getTopMissedClasses(supabase, weekAgoStr, selectedDate)).length > 0 ? (
              (await getTopMissedClasses(supabase, weekAgoStr, selectedDate)).map(([classId, data]: [string, any]) => (
                <div key={classId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{data.name}</p>
                    <p className="text-sm text-muted-foreground">{data.discipline}</p>
                  </div>
                  <Badge variant="destructive">{data.count} {t('dashboard.missed')}</Badge>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">{t('dashboard.noMissedClasses')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper for top missed classes — simplified version that works with corrected schema
async function getTopMissedClasses(supabase: any, weekAgoStr: string, selectedDate: string) {
  const { data } = await supabase
    .from('attendance_records')
    .select(`
      class_id,
      classes:class_id (name_en, name_ar, name_fr),
      status
    `)
    .in('status', ['absent', 'late', 'excused'])
    .gte('attendance_date', weekAgoStr)
    .lte('attendance_date', selectedDate)

  if (!data) return []

  const counts: Record<string, { name: string; count: number }> = {}
  for (const r of data) {
    if (!counts[r.class_id]) {
      counts[r.class_id] = {
        name: r.classes?.name_en || 'Unknown',
        count: 0,
      }
    }
    counts[r.class_id].count++
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)
}
