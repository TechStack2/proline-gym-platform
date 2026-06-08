import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import { AttendanceDashboardClient } from '../attendance-dashboard-client'
import { cn } from '@/lib/utils'

interface AttendancePageProps {
  params: { locale: string }
  searchParams: { date?: string }
}

export default async function AttendancePage({ params: { locale }, searchParams }: AttendancePageProps) {
  const t = await getTranslations('attendance')
  const supabase = await createClient()
  
  const selectedDate = searchParams.date || new Date().toISOString().split('T')[0]
  
  // Fetch today's classes
  const { data: todayClasses } = await supabase
    .from('class_schedules')
    .select(`
      *,
      classes (
        id,
        name,
        discipline
      ),
      class_enrollments (
        id,
        student_id,
        students (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      )
    `)
    .eq('date', selectedDate)
    .order('start_time', { ascending: true })

  // Fetch attendance records for today
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('date', selectedDate)

  // Calculate stats
  const totalStudents = todayClasses?.reduce((acc, cls) => acc + (cls.class_enrollments?.length || 0), 0) || 0
  const presentCount = todayAttendance?.filter(a => a.status === 'present').length || 0
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0

  // Fetch weekly trend
  const weekAgo = new Date(selectedDate)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { data: weeklyAttendance } = await supabase
    .from('attendance_records')
    .select('date, status')
    .gte('date', weekAgo.toISOString().split('T')[0])
    .lte('date', selectedDate)

  // Calculate weekly trend
  const weeklyPresent = weeklyAttendance?.filter(a => a.status === 'present').length || 0
  const weeklyTotal = weeklyAttendance?.length || 0
  const weeklyTrend = weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 100) : 0

  // Fetch most missed classes
  const { data: missedClasses } = await supabase
    .from('attendance_records')
    .select(`
      class_id,
      classes (
        name,
        discipline
      ),
      status
    `)
    .in('status', ['absent', 'late', 'excused'])
    .gte('date', weekAgo.toISOString().split('T')[0])

  const missedClassCounts = missedClasses?.reduce((acc: Record<string, { name: string; discipline: string; count: number }>, record) => {
    const classId = record.class_id
    if (!acc[classId]) {
      acc[classId] = {
        name: record.classes?.[0]?.name || 'Unknown',
        discipline: record.classes?.[0]?.discipline || 'Unknown',
        count: 0
      }
    }
    acc[classId].count++
    return acc
  }, {}) || {}

  const topMissedClasses = Object.entries(missedClassCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)

  return (
    <div className="space-y-6 p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            {t('dashboard.selectDate')}
          </Button>
        </div>
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
                  {classSchedule.classes?.name}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {classSchedule.classes?.discipline}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {classSchedule.start_time} - {classSchedule.end_time}
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <Suspense fallback={<div className="text-center py-4">{t('common.loading')}</div>}>
                <AttendanceDashboardClient
                  classScheduleId={classSchedule.id}
                  classId={classSchedule.class_id}
                  enrollments={classSchedule.class_enrollments || []}
                  attendanceRecords={todayAttendance?.filter(a => a.class_schedule_id === classSchedule.id) || []}
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
            {topMissedClasses.map(([classId, data]) => (
              <div key={classId} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{data.name}</p>
                  <p className="text-sm text-muted-foreground">{data.discipline}</p>
                </div>
                <Badge variant="destructive">{data.count} {t('dashboard.missed')}</Badge>
              </div>
            ))}
            {topMissedClasses.length === 0 && (
              <p className="text-center text-muted-foreground py-4">{t('dashboard.noMissedClasses')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}