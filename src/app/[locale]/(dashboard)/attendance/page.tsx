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

  const selectedDate = searchParams.date || new Date().toISOString().split('T')[0]
  const dayOfWeek = new Date(selectedDate).getDay()

  // Fetch today's classes via class_schedules.day_of_week (correct schema)
  const { data: todayClasses, error: classErr } = await supabase
    .from('class_schedules')
    .select(`
      id, class_id, day_of_week, start_time, end_time,
      classes:class_id (
        id, name_en, name_ar, name_fr,
        discipline_id,
        disciplines:discipline_id (name_en, name_ar, name_fr)
      ),
      class_enrollments:class_enrollments!class_id (
        id,
        student_id,
        students:student_id (
          id,
          profile_id,
          profiles:profile_id (first_name_en, first_name_ar, last_name_en, last_name_ar)
        )
      )
    `)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .order('start_time', { ascending: true })

  if (classErr) console.error('Error fetching classes:', classErr)

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between" dir={isRTL ? 'rtl' : 'ltr'}>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 mr-2" />
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
                  enrollments={(classSchedule.class_enrollments || []).map((e: any) => ({
                    id: e.id,
                    student_id: e.student_id,
                    students: Array.isArray(e.students) ? e.students[0] : e.students,
                  })) as any}
                  attendanceRecords={todayAttendance?.filter(a => a.class_id === classSchedule.class_id) || []}
                  date={selectedDate}
                  locale={locale}
                />
              </Suspense>
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
