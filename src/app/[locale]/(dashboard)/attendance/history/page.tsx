import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AttendanceHistoryClient } from './attendance-history-client'

interface AttendanceHistoryPageProps {
  params: { locale: string }
  searchParams: { studentId?: string; classId?: string; startDate?: string; endDate?: string }
}

export default async function AttendanceHistoryPage({ params: { locale }, searchParams }: AttendanceHistoryPageProps) {
  const t = await getTranslations('attendance')
  const supabase = await createClient()

  const { studentId, classId, startDate, endDate } = searchParams

  // Fetch students for filter
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true })

  // Fetch classes for filter
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, discipline')
    .order('name', { ascending: true })

  // Build query for attendance records
  let query = supabase
    .from('attendance_records')
    .select(`
      *,
      students (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      classes (
        id,
        name,
        discipline
      ),
      class_schedules (
        id,
        start_time,
        end_time
      )
    `)
    .order('date', { ascending: false })

  if (studentId) {
    query = query.eq('student_id', studentId)
  }
  if (classId) {
    query = query.eq('class_id', classId)
  }
  if (startDate) {
    query = query.gte('date', startDate)
  }
  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data: attendanceRecords } = await query

  // Calculate attendance rate for selected student
  let attendanceRate = 0
  if (studentId && attendanceRecords) {
    const totalRecords = attendanceRecords.length
    const presentRecords = attendanceRecords.filter(r => r.status === 'present').length
    attendanceRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0
  }

  return (
    <div className="space-y-6 p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('history.title')}</h1>
          <p className="text-muted-foreground">{t('history.subtitle')}</p>
        </div>
      </div>

      <Suspense fallback={<div className="text-center py-8">{t('common.loading')}</div>}>
        <AttendanceHistoryClient
          students={students || []}
          classes={classes || []}
          attendanceRecords={attendanceRecords || []}
          attendanceRate={attendanceRate}
          selectedStudentId={studentId}
          selectedClassId={classId}
          startDate={startDate}
          endDate={endDate}
          locale={locale}
        />
      </Suspense>
    </div>
  )
}