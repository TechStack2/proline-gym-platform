'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { segmentedItemCls, segmentedTrayCls } from '@/components/ui/segmented'
import { CalendarRange, BarChart3, Layers, Users } from 'lucide-react'

interface ClassRow {
  classId: string
  className: string
  disciplineName: string
  sessions: number
  avgAttendance: number
  capacity: number
  fillRate: number
}

interface DisciplineRow {
  disciplineName: string
  classes: number
  sessions: number
  avgAttendance: number
  fillRate: number
}

interface StudentRow {
  name: string
  present: number
  absent: number
  rate: number
}

interface Props {
  locale: string
  dateFrom: string
  dateTo: string
  byClass: ClassRow[]
  byDiscipline: DisciplineRow[]
  leaders: StudentRow[]
  atRisk: StudentRow[]
}

type TabKey = 'byClass' | 'byDiscipline' | 'students'

export function ReportsClient({ locale, dateFrom, dateTo, byClass, byDiscipline, leaders, atRisk }: Props) {
  const t = useTranslations('reports')
  const isRTL = locale === 'ar'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>('byClass')

  const setRange = (key: 'dateFrom' | 'dateTo', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/${locale}/reports?${params.toString()}`)
  }

  const align = 'text-start'
  const tabs: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'byClass', label: t('tabs.byClass'), icon: BarChart3 },
    { key: 'byDiscipline', label: t('tabs.byDiscipline'), icon: Layers },
    { key: 'students', label: t('tabs.students'), icon: Users },
  ]

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Date range */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <CalendarRange className="h-5 w-5 text-gray-400 mb-2" />
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('dateFrom')}</label>
              <Input type="date" data-testid="reports-date-from" value={dateFrom} max={dateTo} onChange={(e) => setRange('dateFrom', e.target.value)} className="w-auto" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">{t('dateTo')}</label>
              <Input type="date" data-testid="reports-date-to" value={dateTo} min={dateFrom} onChange={(e) => setRange('dateTo', e.target.value)} className="w-auto" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      {/* W3b DA-19: the underline tabs join the ONE segmented recipe (the 4th
          and last competing in-page tab style). Testids unchanged. */}
      <div className={segmentedTrayCls} data-testid="reports-tabs">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            data-testid={`reports-tab-${key}`}
            onClick={() => setTab(key)}
            className={segmentedItemCls(tab === key)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* By class */}
      {tab === 'byClass' && (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>{t('byClass.title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="report-by-class">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byClass.class')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byClass.discipline')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byClass.sessions')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byClass.avgAttendance')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byClass.fillRate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byClass.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">{t('byClass.noData')}</td></tr>
                  ) : byClass.map((r) => (
                    <tr key={r.classId} className="hover:bg-gray-50" data-testid="report-class-row" data-class={r.className}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.className}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.disciplineName}</td>
                      <td className="px-4 py-2.5 text-gray-600" data-testid="rc-sessions">{r.sessions}</td>
                      <td className="px-4 py-2.5 text-gray-600" data-testid="rc-avg">{r.avgAttendance}</td>
                      <td className="px-4 py-2.5 text-gray-600" data-testid="rc-fill">{r.fillRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* By discipline */}
      {tab === 'byDiscipline' && (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>{t('byDiscipline.title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="report-by-discipline">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byDiscipline.discipline')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byDiscipline.classes')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byDiscipline.sessions')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byDiscipline.avgAttendance')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('byDiscipline.fillRate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byDiscipline.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">{t('byClass.noData')}</td></tr>
                  ) : byDiscipline.map((r) => (
                    <tr key={r.disciplineName} className="hover:bg-gray-50" data-testid="report-discipline-row">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.disciplineName}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.classes}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.sessions}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.avgAttendance}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.fillRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-student leaders / at-risk */}
      {tab === 'students' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>{t('students.leaders')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="report-leaders">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.student')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.present')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leaders.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">{t('students.noLeaders')}</td></tr>
                  ) : leaders.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50" data-testid="report-leader-row">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-2.5 text-green-700 font-semibold">{s.present}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className={cn('text-lg', isRTL && 'font-arabic')}>{t('students.atRisk')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm" data-testid="report-at-risk">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.student')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.absent')}</th>
                    <th className={cn('px-4 py-3 font-medium text-gray-500', align)}>{t('students.rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {atRisk.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">{t('students.noAtRisk')}</td></tr>
                  ) : atRisk.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-50" data-testid="report-at-risk-row">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-2.5 text-red-700 font-semibold">{s.absent}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
