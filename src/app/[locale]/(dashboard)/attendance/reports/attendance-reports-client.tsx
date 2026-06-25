'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Download, Printer, BarChart3, PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pctWidthClass } from '@/lib/utils/bar-width'

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

interface MonthlySummary {
  [month: string]: {
    present: number
    absent: number
    late: number
    excused: number
    total: number
  }
}

interface AttendanceReportsClientProps {
  classes: Class[]
  attendanceRecords: AttendanceRecord[]
  monthlySummary: MonthlySummary
  selectedClassId?: string
  startDate?: string
  endDate?: string
  locale: string
}

export function AttendanceReportsClient({
  classes,
  attendanceRecords,
  monthlySummary,
  selectedClassId,
  startDate,
  endDate,
  locale
}: AttendanceReportsClientProps) {
  const t = useTranslations('attendance')
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/attendance/reports?${params.toString()}`)
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Student Name', 'Class', 'Discipline', 'Status', 'Time']
    const rows = attendanceRecords.map(record => [
      record.date,
      `${record.students.first_name} ${record.students.last_name}`,
      record.classes.name,
      record.classes.discipline,
      record.status,
      `${record.class_schedules.start_time} - ${record.class_schedules.end_time}`
    ])

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    window.print()
  }

  // Calculate statistics
  const totalRecords = attendanceRecords.length
  const presentCount = attendanceRecords.filter(r => r.status === 'present').length
  const absentCount = attendanceRecords.filter(r => r.status === 'absent').length
  const lateCount = attendanceRecords.filter(r => r.status === 'late').length
  const excusedCount = attendanceRecords.filter(r => r.status === 'excused').length

  const presentRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0
  const absentRate = totalRecords > 0 ? Math.round((absentCount / totalRecords) * 100) : 0
  const lateRate = totalRecords > 0 ? Math.round((lateCount / totalRecords) * 100) : 0
  const excusedRate = totalRecords > 0 ? Math.round((excusedCount / totalRecords) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('reports.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('reports.class')}</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedClassId || ''}
                onChange={(e) => updateFilter('classId', e.target.value || undefined)}
              >
                <option value="">{t('reports.allClasses')}</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} - {cls.discipline}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('reports.startDate')}</label>
              <Input
                type="date"
                value={startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value || undefined)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('reports.endDate')}</label>
              <Input
                type="date"
                value={endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value || undefined)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                {t('reports.export')}
              </Button>
              <Button variant="outline" size="sm" onClick={printReport}>
                <Printer className="h-4 w-4 mr-2" />
                {t('reports.print')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.totalRecords')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecords}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.presentRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{presentRate}%</div>
            <p className="text-xs text-muted-foreground">{presentCount} {t('reports.records')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.absentRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{absentRate}%</div>
            <p className="text-xs text-muted-foreground">{absentCount} {t('reports.records')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('reports.lateRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{lateRate}%</div>
            <p className="text-xs text-muted-foreground">{lateCount} {t('reports.records')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            {t('reports.monthlySummary')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">{t('reports.month')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.present')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.absent')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.late')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.excused')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.total')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.rate')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(monthlySummary).map(([month, data]) => {
                  const rate = data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
                  return (
                    <tr key={month} className="border-b hover:bg-accent/50">
                      <td className="py-3 px-4 font-medium">{month}</td>
                      <td className="py-3 px-4">
                        <Badge variant="success">{data.present}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="destructive">{data.absent}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="warning">{data.late}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="info">{data.excused}</Badge>
                      </td>
                      <td className="py-3 px-4">{data.total}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            {/* CSP-SWEEP: width via a build-time class (the prod CSP
                                strips inline style="" → 0-width bar). */}
                            <div
                              className={cn(
                                "h-full rounded-full",
                                rate >= 80 ? "bg-green-500" : rate >= 60 ? "bg-yellow-500" : "bg-red-500",
                                pctWidthClass(rate)
                              )}
                            />
                          </div>
                          <span className="text-xs font-medium">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {Object.keys(monthlySummary).length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('reports.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Records Table */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.detailedRecords')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">{t('reports.date')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.student')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.class')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.discipline')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.time')}</th>
                  <th className="text-left py-3 px-4 font-medium">{t('reports.status')}</th>
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
                    <td className="py-3 px-4">{record.classes.discipline}</td>
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
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t('reports.noRecords')}
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