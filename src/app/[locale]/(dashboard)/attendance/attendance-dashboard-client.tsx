'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { useOnline, usePendingAttendance } from '@/lib/offline/use-online'
import { queueMark, flushPending } from '@/lib/offline/attendance'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { saveAttendance } from '@/app/[locale]/coach/attendance/actions'

interface Student {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
}

interface Enrollment {
  id: string
  student_id: string
  students: Student
}

interface AttendanceRecord {
  id: string
  student_id: string
  status: 'present' | 'absent' | 'late' | 'excused'
  class_schedule_id: string
  date: string
}

interface AttendanceDashboardClientProps {
  classScheduleId: string
  classId: string
  enrollments: Enrollment[]
  attendanceRecords: AttendanceRecord[]
  date: string
  locale: string
  /** ML-1: lapsed-membership / suspended-registration members (warning chip). */
  warnStudentIds?: string[]
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export function AttendanceDashboardClient({
  classScheduleId,
  classId,
  enrollments,
  attendanceRecords,
  date,
  locale,
  warnStudentIds = [],
}: AttendanceDashboardClientProps) {
  const t = useTranslations('attendance')
  const supabase = createClient()
  const online = useOnline()
  const { count: pending, refresh: refreshPending } = usePendingAttendance()
  const [loading, setLoading] = useState<string | null>(null)
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>(() => {
    const initial: Record<string, AttendanceStatus> = {}
    attendanceRecords.forEach(record => {
      initial[record.student_id] = record.status
    })
    return initial
  })

  // G2: flush the pending queue on mount AND on reconnect (oldest-first, through
  // the same idempotent upsert) — shared with the coach surface.
  useEffect(() => {
    const doFlush = async () => {
      if (!navigator.onLine) return
      const res = await flushPending(saveAttendance)
      await refreshPending()
      if (res.flushed > 0) toast({ title: t('toast.saved'), variant: 'success' })
    }
    void doFlush()
    window.addEventListener('online', doFlush)
    return () => window.removeEventListener('online', doFlush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateAttendance = useCallback(async (studentId: string, status: AttendanceStatus) => {
    setLoading(studentId)
    try {
      // G2: OFFLINE — queue the mark + optimistic UI; drains on reconnect.
      if (!navigator.onLine) {
        await queueMark({ class_id: classId, student_id: studentId, attendance_date: date, status })
        setRecords(prev => ({ ...prev, [studentId]: status }))
        await refreshPending()
        setLoading(null)
        return
      }

      const existingRecord = attendanceRecords.find(r => r.student_id === studentId)

      if (existingRecord) {
        const { error } = await supabase
          .from('attendance_records')
          .update({ status })
          .eq('id', existingRecord.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('attendance_records')
          .insert({
            student_id: studentId,
            schedule_id: classScheduleId,
            class_id: classId,
            attendance_date: date,
            status,
          })

        if (error) throw error
      }

      setRecords(prev => ({ ...prev, [studentId]: status }))
      toast({ title: t('toast.saved'), variant: 'success' })
    } catch (error) {
      console.error('Error updating attendance:', error)
      toast({ title: t('toast.error'), variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }, [attendanceRecords, classScheduleId, classId, date, supabase, t, refreshPending])

  const markAllPresent = useCallback(async () => {
    setLoading('all')
    try {
      // G2: OFFLINE — queue every student present + optimistic UI.
      if (!navigator.onLine) {
        for (const enrollment of enrollments) {
          await queueMark({ class_id: classId, student_id: enrollment.student_id, attendance_date: date, status: 'present' })
        }
        const newRecords: Record<string, AttendanceStatus> = {}
        enrollments.forEach(e => { newRecords[e.student_id] = 'present' })
        setRecords(prev => ({ ...prev, ...newRecords }))
        await refreshPending()
        setLoading(null)
        return
      }

      const updates = enrollments.map(enrollment => ({
        student_id: enrollment.student_id,
        schedule_id: classScheduleId,
        class_id: classId,
        attendance_date: date,
        status: 'present' as AttendanceStatus,
      }))

      const { error } = await supabase
        .from('attendance_records')
        .upsert(updates, { onConflict: 'class_id,student_id,attendance_date' })

      if (error) throw error

      const newRecords: Record<string, AttendanceStatus> = {}
      enrollments.forEach(enrollment => {
        newRecords[enrollment.student_id] = 'present'
      })
      setRecords(prev => ({ ...prev, ...newRecords }))
      toast({ title: t('toast.saved'), variant: 'success' })
    } catch (error) {
      console.error('Error marking all present:', error)
      toast({ title: t('toast.error'), variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }, [enrollments, classScheduleId, classId, date, supabase, t, refreshPending])

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return <Check className="h-4 w-4 text-green-500" />
      case 'absent':
        return <X className="h-4 w-4 text-red-500" />
      case 'late':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'excused':
        return <AlertCircle className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case 'present':
        return <Badge variant="success">{t('status.present')}</Badge>
      case 'absent':
        return <Badge variant="destructive">{t('status.absent')}</Badge>
      case 'late':
        return <Badge variant="warning">{t('status.late')}</Badge>
      case 'excused':
        return <Badge variant="info">{t('status.excused')}</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      {/* G2: offline / pending-sync banner */}
      <OfflineBanner online={online} pending={pending} locale={locale} />
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium">{t('dashboard.students')} ({enrollments.length})</p>
        <Button
          variant="outline"
          size="sm"
          onClick={markAllPresent}
          disabled={loading === 'all'}
        >
          {loading === 'all' ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {t('dashboard.markAllPresent')}
        </Button>
      </div>

      <div className="space-y-2">
        {enrollments.map((enrollment) => {
          const currentStatus = records[enrollment.student_id]
          const isUpdating = loading === enrollment.student_id

          return (
            <div
              key={enrollment.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                "hover:bg-accent/50 transition-colors",
                locale === 'ar' && "flex-row-reverse"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {enrollment.students.first_name[0]}{enrollment.students.last_name[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {enrollment.students.first_name} {enrollment.students.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {enrollment.students.email || enrollment.students.phone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {warnStudentIds.includes(enrollment.student_id) && (
                  <span data-testid="checkin-warning"
                    className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
                    {t('dashboard.lapsedWarning')}
                  </span>
                )}
                {currentStatus && getStatusBadge(currentStatus)}
                
                <div className="flex gap-1">
                  {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map((status) => (
                    <Button
                      key={status}
                      variant={currentStatus === status ? 'primary' : 'ghost'}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => updateAttendance(enrollment.student_id, status)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        getStatusIcon(status)
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {enrollments.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            {t('dashboard.noEnrollments')}
          </p>
        )}
      </div>
    </div>
  )
}