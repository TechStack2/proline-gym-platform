'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

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
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export function AttendanceDashboardClient({
  classScheduleId,
  classId,
  enrollments,
  attendanceRecords,
  date,
  locale
}: AttendanceDashboardClientProps) {
  const t = useTranslations('attendance')
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>(() => {
    const initial: Record<string, AttendanceStatus> = {}
    attendanceRecords.forEach(record => {
      initial[record.student_id] = record.status
    })
    return initial
  })

  const updateAttendance = useCallback(async (studentId: string, status: AttendanceStatus) => {
    setLoading(studentId)
    try {
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
      toast({ title: locale === 'ar' ? 'تم الحفظ' : 'Saved', variant: 'success' })
    } catch (error) {
      console.error('Error updating attendance:', error)
      toast({ title: locale === 'ar' ? 'حدث خطأ' : 'Error', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }, [attendanceRecords, classScheduleId, classId, date, supabase, t])

  const markAllPresent = useCallback(async () => {
    setLoading('all')
    try {
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
      toast({ title: locale === 'ar' ? 'تم الحفظ' : 'Saved', variant: 'success' })
    } catch (error) {
      console.error('Error marking all present:', error)
      toast({ title: locale === 'ar' ? 'حدث خطأ' : 'Error', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }, [enrollments, classScheduleId, classId, date, supabase, t])

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