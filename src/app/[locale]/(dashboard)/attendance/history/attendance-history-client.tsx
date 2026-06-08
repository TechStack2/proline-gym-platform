'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Calendar, ChevronLeft, ChevronRight, Filter, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Student {
  id: string
  first_name: string
  last_name: string
}

interface Class {
  id: string
  name: string
  discipline: string
}

interface AttendanceRecord {
  id: string
  student_id: string
  class_id: string
  date: string
  status: 'present' | 'absent' | 'late' | 'excused'
  students: {
    id: string
    first_name: string
    last_name: string
    email?: string
    phone?: string
  }
  classes: {
    id: string
    name: string
    discipline: string
  }
  class_schedules: {
    id: string
    start_time: string
    end_time: string
  }
}

interface AttendanceHistoryClientProps {
  students: Student[]
  classes: Class[]
  attendanceRecords: AttendanceRecord[]
  attendanceRate: number
  selectedStudentId?: string
  selectedClassId?: string
  startDate?: string
  endDate?: string
  locale: string
}

export function AttendanceHistoryClient({
  students,
  classes,
  attendanceRecords,
  attendanceRate,
  selectedStudentId,
  selectedClassId,
  startDate,
  endDate,
  locale
}: AttendanceHistoryClientProps) {
  const t = useTranslations('attendance')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay()
  }

  const daysInMonth = getDaysInMonth(currentMonth, currentYear)
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear)

  const calendarDays = useMemo(() => {
    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
  }, [firstDay, daysInMonth])

  const getAttendanceForDate = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return attendanceRecords.filter(r => r.date === dateStr)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-500'
      case 'absent':
        return 'bg-red-500'
      case 'late':
        return 'bg-yellow-500'
      case 'excused':
        return 'bg-blue-500'
      default:
        return 'bg-gray-300'
    }
  }

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/attendance/history?${params.toString()}`)
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Student Name', 'Class', 'Status', 'Time']
    const rows = attendanceRecords.map(record => [
      record.date,
      `${record.students.first_name} ${record.students.last_name}`,
      record.classes.name,
      record.status,
      `${record.class_schedules.start_time} - ${record.class_schedules.end_time}`
    ])

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-history-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('history.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('history.student')}</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedStudentId || ''}
                onChange={(e) => updateFilter('studentId', e.target.value || undefined)}
              >
                <option value="">{t('history.allStudents')}</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('history.class')}</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedClassId || ''}
                onChange={(e) => updateFilter('classId', e.target.value || undefined)}
              >
                <option value="">{t('history.allClasses')}</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} - {cls.discipline}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('history.startDate')}</label>
              <Input
                type="date"
                value={startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value || undefined)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('history.endDate')}</label>
              <Input
                type="date"
                value={endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value || undefined)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Rate */}
      {selectedStudentId && (
        <Card>
          <CardHeader>
            <CardTitle>{t('history.attendanceRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">{attendanceRate}%</div>
              <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    attendanceRate >= 80 ? "bg-green-500" : attendanceRate >= 60 ? "bg-yellow-500" : "bg-red-500"
                  )}
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('history.calendar')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentMonth === 0) {
                    setCurrentMonth(11)
                    setCurrentYear(currentYear - 1)
                  } else {
                    setCurrentMonth(currentMonth - 1)
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {new Date(currentYear, currentMonth).toLocaleDateString(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentMonth === 11) {
                    setCurrentMonth(0)
                    setCurrentYear(currentYear + 1)
                  } else {
                    setCurrentMonth(currentMonth + 1)
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
            {calendarDays.map((day, index) => (
              <div
                key={index}
                className={cn(
                  "min-h-[80px] p-1 border rounded-md",
                  day ? "bg-background" : "bg-muted/50"
                )}
              >
                {day && (
                  <>
                    <div className="text-xs font-medium mb-1">{day}</div>
                    <div className="space-y-0.5">
                      {getAttendanceForDate(day).map(record => (
                        <div
                          key={record.id}
                          className={cn(
                            "w-2 h-2 rounded-full",
                            getStatusColor(record.status)
                          )}
                          title={`${record.students.first_name} ${record.students.last_name} - ${record.status}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('history.records')}</CardTitle>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              {t('history.export')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">{t('history.date')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('history.student')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('history.class')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('history.time')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('history.status')}</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map(record => (
                  <tr key={record.id} className="border-b hover:bg-accent/50">
                    <td className="py-3 px-4">{record.date}</td>
                    <td className="py-3 px-4">
                      {record.students.first_name} {record.students.last_name}
                    </td>
                    <td className="py-3 px-4">{record.classes.name}</td>
                    <td className="py-3 px-4">
                      {record.class_schedules.start_time} - {record.class_schedules.end_time}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          record.status === 'present' ? 'success' :
                          record.status === 'absent' ? 'destructive' :
                          record.status === 'late' ? 'warning' : 'info'
                        }
                      >
                        {t(`status.${record.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {attendanceRecords.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('history.noRecords')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}