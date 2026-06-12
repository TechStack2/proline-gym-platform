'use client'

import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Filter, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClassOpt {
  id: string
  name: string
  disciplineId: string
}

interface DisciplineOpt {
  id: string
  name: string
}

interface Row {
  id: string
  date: string
  status: string
  className: string
  studentName: string
  markedBy: string | null
}

interface DaySummary {
  date: string
  present: number
  absent: number
  late: number
  excused: number
}

interface Props {
  classes: ClassOpt[]
  disciplines: DisciplineOpt[]
  rows: Row[]
  daySummary: DaySummary[]
  selectedClassId?: string
  selectedDisciplineId?: string
  dateFrom: string
  dateTo: string
  locale: string
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-yellow-100 text-yellow-700',
  excused: 'bg-blue-100 text-blue-700',
}

export function AttendanceHistoryClient({
  classes,
  disciplines,
  rows,
  daySummary,
  selectedClassId,
  selectedDisciplineId,
  dateFrom,
  dateTo,
  locale,
}: Props) {
  const t = useTranslations('attendanceHistory')
  const router = useRouter()
  const searchParams = useSearchParams()
  const isRTL = locale === 'ar'

  const updateFilter = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.push(`/${locale}/attendance/history?${params.toString()}`)
  }

  // Class options narrow to the chosen discipline (if any) for a coherent picker.
  const visibleClasses = selectedDisciplineId
    ? classes.filter((c) => c.disciplineId === selectedDisciplineId)
    : classes

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            {t('filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('dateFrom')}</label>
              <Input
                type="date"
                data-testid="history-date-from"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => updateFilter({ dateFrom: e.target.value || undefined })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('dateTo')}</label>
              <Input
                type="date"
                data-testid="history-date-to"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => updateFilter({ dateTo: e.target.value || undefined })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('discipline')}</label>
              <select
                data-testid="history-discipline"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedDisciplineId || ''}
                onChange={(e) => updateFilter({ disciplineId: e.target.value || undefined, classId: undefined })}
              >
                <option value="">{t('allDisciplines')}</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('class')}</label>
              <select
                data-testid="history-class"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedClassId || ''}
                onChange={(e) => updateFilter({ classId: e.target.value || undefined })}
              >
                <option value="">{t('allClasses')}</option>
                {visibleClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-day summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            {t('daySummary')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {daySummary.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">{t('noRecords')}</p>
          ) : (
            <div className="space-y-2" data-testid="history-day-summary">
              {daySummary.map((d) => (
                <div key={d.date} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" data-testid="history-day-row" data-date={d.date}>
                  <span className="font-medium">{d.date}</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{t('present')}: {d.present}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{t('absent')}: {d.absent}</span>
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">{t('late')}: {d.late}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{t('excused')}: {d.excused}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Records table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t('records')}</CardTitle>
            <span className="text-xs text-muted-foreground">{t('showing', { count: rows.length })}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="history-table">
              <thead>
                <tr className="border-b">
                  <th className={cn('py-3 px-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{t('date')}</th>
                  <th className={cn('py-3 px-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{t('student')}</th>
                  <th className={cn('py-3 px-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{t('class')}</th>
                  <th className={cn('py-3 px-4 font-medium', isRTL ? 'text-right' : 'text-left')}>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-accent/50" data-testid="history-row" data-status={r.status} data-student={r.studentName}>
                    <td className="py-3 px-4">{r.date}</td>
                    <td className="py-3 px-4">{r.studentName}</td>
                    <td className="py-3 px-4">{r.className}</td>
                    <td className="py-3 px-4">
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600')}>
                        {t(r.status as any)}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted-foreground">{t('noRecords')}</td>
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
