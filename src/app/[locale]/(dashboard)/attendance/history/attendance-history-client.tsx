'use client'

import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Filter, CalendarDays } from 'lucide-react'
import { StatusChip } from '@/components/ui/status-chip'
import { SearchableFilterDialog } from '@/components/ui/filter-dialog'
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
  const tc = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()

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
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-1 block">{t('discipline')}</label>
              {/* §2.6 (W4): a gym's disciplines are a small enumerable set — apply-on-tap
                  chips (tap-active-clears); picking a discipline resets the class filter. */}
              <div className="flex flex-wrap items-center gap-1.5" data-testid="history-discipline">
                {disciplines.map((d) => {
                  const active = selectedDisciplineId === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      data-testid="history-discipline-chip"
                      data-id={d.id}
                      data-active={active}
                      onClick={() => updateFilter({ disciplineId: active ? undefined : d.id, classId: undefined })}
                      className={cn(
                        'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]',
                        active
                          ? 'border-primary-700 bg-primary-700 text-primary-foreground'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                      )}
                    >
                      {d.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('class')}</label>
              {/* §2.6 (W4): the class catalog is a LONG list — searchable-Dialog filter. */}
              <SearchableFilterDialog
                label={t('class')}
                value={selectedClassId || ''}
                options={visibleClasses.map((c) => ({ id: c.id, label: c.name }))}
                onSelect={(id) => updateFilter({ classId: id || undefined })}
                searchPlaceholder={tc('search')}
                clearLabel={t('allClasses')}
                testid="history-class"
              />
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
                  {/* W3b DA-25: the attendance role TINTS (dark-correct), not -100 pins. */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="tint-success rounded-full px-2 py-0.5">{t('present')}: {d.present}</span>
                    <span className="tint-danger rounded-full px-2 py-0.5">{t('absent')}: {d.absent}</span>
                    <span className="tint-warning rounded-full px-2 py-0.5">{t('late')}: {d.late}</span>
                    <span className="tint-info rounded-full px-2 py-0.5">{t('excused')}: {d.excused}</span>
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
                {/* DA-61: logical text-start — dir owns the side. */}
                <tr className="border-b">
                  <th className="py-3 px-4 font-medium text-start">{t('date')}</th>
                  <th className="py-3 px-4 font-medium text-start">{t('student')}</th>
                  <th className="py-3 px-4 font-medium text-start">{t('class')}</th>
                  <th className="py-3 px-4 font-medium text-start">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-accent/50" data-testid="history-row" data-status={r.status} data-student={r.studentName}>
                    <td className="py-3 px-4">{r.date}</td>
                    <td className="py-3 px-4">{r.studentName}</td>
                    <td className="py-3 px-4">{r.className}</td>
                    <td className="py-3 px-4">
                      {/* W3b §2.3: ONE status chip — hue from the attendance vocabulary. */}
                      <StatusChip domain="attendance" status={r.status} label={t(r.status as any)} />
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
