'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Search, Plus, Filter, MoreHorizontal, Calendar, Users, Clock, MapPin, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AddClassModal from './AddClassModal'
import { cn } from '@/lib/utils'
import { localizedName } from '@/lib/names'
import { classCompletenessGaps } from '@/lib/products/completeness'
import { fmtWeekday } from '@/lib/fmt'
import { fmtUsd } from '@/lib/billing/currency'
import { Ltr } from '@/components/ui/bdi'
import { StatusChip } from '@/components/ui/status-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { NavChevron } from '@/components/ui/nav-chevron'

interface ClassesListProps {
  classes: any[]
  disciplines: any[]
  coaches: any[]
  locale: string
  /** M2-E CLASS-HOME: ?new=1 (the onboarding deep-link) auto-opens the create wizard. */
  autoNew?: boolean
}

const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6]

export default function ClassesList({ classes, disciplines, coaches, locale, autoNew = false }: ClassesListProps) {
  const t = useTranslations('classes')
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [coachFilter, setCoachFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const isRTL = locale === 'ar'
  // M2-E CLASS-HOME: the onboarding CTA deep-links to /classes?new=1 to open the create
  // wizard straight away. Mirrors the pt-panel autoSell idiom — a one-shot on arrival;
  // router.refresh() after a create keeps the flag but does not re-open (dep unchanged).
  useEffect(() => {
    if (autoNew) setShowAddModal(true)
  }, [autoNew])
  // CYCLE-VIZ: surface the recurring monthly product framing on the staff catalog.
  const monthlyWord = locale === 'ar' ? 'شهري' : locale === 'fr' ? 'Mensuel' : 'Monthly'
  const moWord = locale === 'ar' ? 'شهر' : locale === 'fr' ? 'mois' : 'mo'

  const filteredClasses = classes.filter(c => {
    const matchesSearch = !search || 
      c.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
      c.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      c.name_fr?.toLowerCase().includes(search.toLowerCase())
    
    const matchesDiscipline = disciplineFilter === 'all' || c.discipline_id === disciplineFilter
    const matchesCoach = coachFilter === 'all' || c.coach_id === coachFilter
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    
    const matchesDay = dayFilter === 'all' || 
      c.schedules?.some((s: any) => s.day_of_week === parseInt(dayFilter))

    return matchesSearch && matchesDiscipline && matchesCoach && matchesStatus && matchesDay
  })

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
      active: 'default',
      inactive: 'secondary',
      archived: 'outline'
    }
    return (
      <Badge variant={variants[status] || 'default'}>
        {status}
      </Badge>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('title')}</CardTitle>
            <Button data-testid="add-class-btn" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t('addClass')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute top-2.5 start-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-10"
                />
              </div>
              <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('allDisciplines')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allDisciplines')}</SelectItem>
                  {disciplines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d[`name_${locale}`] || d.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={coachFilter} onValueChange={setCoachFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('allCoaches')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allCoaches')}</SelectItem>
                  {coaches.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {localizedName(c.profiles, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dayFilter} onValueChange={setDayFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t('allDays')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allDays')}</SelectItem>
                  {DAY_INDEXES.map((index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {fmtWeekday(index, locale, 'long')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={t('allStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allStatus')}</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Classes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClasses.map((classItem) => {
                // COMPLETENESS R3: warn-level gaps for this class (no schedule / inactive coach).
                const gaps = classCompletenessGaps(classItem)
                return (
                <Card
                  key={classItem.id}
                  data-testid="class-card"
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/${locale}/classes/${classItem.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {classItem[`name_${locale}`] || classItem.name_en}
                        </h3>
                        {classItem.discipline && (
                          <Badge variant="secondary" className="mt-1">
                            {classItem.discipline[`name_${locale}`] || classItem.discipline.name_en}
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {classItem.show_on_landing && (
                            /* §2.3: the one status pill — landing 'live', historical label kept. */
                            <StatusChip domain="landing" status="live" data-testid="class-published-badge"
                              label={t('wizard.published')} />
                          )}
                          {getStatusBadge(classItem.status)}
                          <Button variant="ghost" size="icon" data-testid="class-edit-row-btn"
                            className="h-7 w-7" onClick={() => setEditTarget(classItem)}>
                            <Pencil className="h-3.5 w-3.5 text-gray-400" />
                          </Button>
                        </div>
                        <NavChevron />
                      </div>
                    </div>

                    {/* COMPLETENESS R3: Incomplete badge + one-line what's-missing.
                        Complete classes render nothing here (no celebratory noise). */}
                    {gaps.length > 0 && (
                      <div data-testid="class-incomplete" className="tint-warning mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning-500/30 px-2.5 py-1.5">
                        <Badge variant="warning" className="border border-warning-500/40">
                          {t('completeness.incomplete')}
                        </Badge>
                        <span className={cn('text-xs', isRTL && 'font-arabic')}>
                          {gaps.map((g) => t(`completeness.gap.${g}` as any)).join(' · ')}
                        </span>
                      </div>
                    )}

                    {classItem.coach && (
                      <div className="flex items-center text-sm text-muted-foreground mb-2" data-testid="class-coach">
                        <Users className="h-4 w-4 me-2" />
                        {localizedName(classItem.coach.profiles, locale)}
                      </div>
                    )}

                    {classItem.schedules && classItem.schedules.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {classItem.schedules.map((schedule: any) => (
                          <div key={schedule.id} className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 me-2" />
                            <span>{fmtWeekday(schedule.day_of_week, locale)}</span>
                            <Clock className="h-4 w-4 mx-2" />
                            <span>{schedule.start_time} - {schedule.end_time}</span>
                            {schedule.room && (
                              <>
                                <MapPin className="h-4 w-4 mx-2" />
                                <span>{schedule.room}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground" data-testid="class-count">
                        <Users className="h-4 w-4 inline me-1" />
                        {classItem.enrollments_count || 0}/{classItem.max_capacity}
                      </span>
                      {/* CYCLE-VIZ: recurring monthly cycle + fee (catalog framing). */}
                      {classItem.monthly_fee_usd != null && (
                        <span data-testid="class-cycle" className="inline-flex items-center gap-1 text-xs font-medium text-primary-700">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {monthlyWord} · <Ltr>{fmtUsd(classItem.monthly_fee_usd)}</Ltr>/{moWord}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>

            {filteredClasses.length === 0 && (
              <EmptyState variant="bare" title={t('noClasses')} />
            )}
          </div>
        </CardContent>
      </Card>

      {showAddModal && (
        <AddClassModal
          disciplines={disciplines}
          coaches={coaches}
          locale={locale}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            router.refresh()
          }}
        />
      )}

      {editTarget && (
        <AddClassModal
          disciplines={disciplines}
          coaches={coaches}
          locale={locale}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null)
            router.refresh()
          }}
          editClass={{
            id: editTarget.id,
            name_en: editTarget.name_en,
            name_ar: editTarget.name_ar,
            name_fr: editTarget.name_fr,
            discipline_id: editTarget.discipline_id,
            coach_id: editTarget.coach_id,
            max_capacity: editTarget.max_capacity,
            monthly_fee_usd: editTarget.monthly_fee_usd,
            status: editTarget.status,
            show_on_landing: editTarget.show_on_landing,
            schedules: (editTarget.schedules ?? []).map((x: any) => ({
              day_of_week: x.day_of_week, start_time: x.start_time, end_time: x.end_time,
            })),
          }}
        />
      )}
    </>
  )
}