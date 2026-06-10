'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Search, Plus, Filter, ChevronDown, MoreHorizontal, Calendar, Users, Clock, MapPin } from 'lucide-react'
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

interface ClassesListProps {
  classes: any[]
  disciplines: any[]
  coaches: any[]
  locale: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ClassesList({ classes, disciplines, coaches, locale }: ClassesListProps) {
  const t = useTranslations('classes')
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [coachFilter, setCoachFilter] = useState('all')
  const [dayFilter, setDayFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const isRTL = locale === 'ar'

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

  const getDayName = (day: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[day] || ''
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('title')}</CardTitle>
            <Button data-testid="add-class-btn" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('addClass')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className={cn(
              "flex flex-wrap gap-4",
              isRTL && "flex-row-reverse"
            )}>
              <div className="relative flex-1 min-w-[200px]">
                <Search className={cn(
                  "absolute top-2.5 h-4 w-4 text-muted-foreground",
                  isRTL ? "right-3" : "left-3"
                )} />
                <Input
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(isRTL ? "pr-10" : "pl-10")}
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
                  {DAYS.map((day, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {day}
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
              {filteredClasses.map((classItem) => (
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
                      {getStatusBadge(classItem.status)}
                    </div>
                    
                    {classItem.coach && (
                      <div className="flex items-center text-sm text-muted-foreground mb-2" data-testid="class-coach">
                        <Users className="h-4 w-4 mr-2" />
                        {localizedName(classItem.coach.profiles, locale)}
                      </div>
                    )}

                    {classItem.schedules && classItem.schedules.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {classItem.schedules.map((schedule: any) => (
                          <div key={schedule.id} className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 mr-2" />
                            <span>{getDayName(schedule.day_of_week)}</span>
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
                        <Users className="h-4 w-4 inline mr-1" />
                        {classItem.enrollments_count || 0}/{classItem.max_capacity}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredClasses.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {t('noClasses')}
              </div>
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
    </>
  )
}