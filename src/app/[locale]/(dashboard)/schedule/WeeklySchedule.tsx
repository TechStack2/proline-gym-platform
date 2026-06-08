'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface WeeklyScheduleProps {
  classes: any[]
  disciplines: any[]
  coaches: any[]
  locale: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6) // 6 AM to 8 PM

export default function WeeklySchedule({ classes, disciplines, coaches, locale }: WeeklyScheduleProps) {
  const t = useTranslations('schedule')
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [coachFilter, setCoachFilter] = useState('all')
  const isRTL = locale === 'ar'

  const getWeekDates = (date: Date) => {
    const start = new Date(date)
    start.setDate(start.getDate() - start.getDay())
    const dates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      dates.push(d)
    }
    return dates
  }

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate])

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    setCurrentDate(newDate)
  }

  const filteredClasses = classes.filter(c => {
    const matchesDiscipline = disciplineFilter === 'all' || c.discipline_id === disciplineFilter
    const matchesCoach = coachFilter === 'all' || c.coach_id === coachFilter
    return matchesDiscipline && matchesCoach
  })

  const getClassesForDayAndTime = (dayOfWeek: number, hour: number) => {
    return filteredClasses.filter(c => 
      c.schedules?.some((s: any) => 
        s.day_of_week === dayOfWeek && 
        parseInt(s.start_time) <= hour && 
        parseInt(s.end_time) > hour
      )
    )
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold">
              {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
          </div>
          <div className="flex gap-2">
            <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('allCoaches')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allCoaches')}</SelectItem>
                {coaches.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Desktop Grid View */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header */}
            <div className="grid grid-cols-8 gap-1 mb-1">
              <div className="text-xs text-muted-foreground p-2"></div>
              {weekDates.map((date, index) => (
                <div
                  key={index}
                  className={cn(
                    "text-center p-2 rounded-t-lg",
                    isToday(date) && "bg-primary/10"
                  )}
                >
                  <div className="text-xs text-muted-foreground">{DAYS[index].slice(0, 3)}</div>
                  <div className={cn(
                    "text-sm font-semibold",
                    isToday(date) && "text-primary"
                  )}>
                    {date.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 gap-1 mb-1">
                <div className="text-xs text-muted-foreground p-2 flex items-center justify-end">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {weekDates.map((date, dayIndex) => {
                  const dayClasses = getClassesForDayAndTime(dayIndex, hour)
                  return (
                    <div
                      key={dayIndex}
                      className={cn(
                        "min-h-[60px] p-1 rounded",
                        isToday(date) ? "bg-gray-50" : "bg-white",
                        "border border-gray-100"
                      )}
                    >
                      {dayClasses.map((classItem) => (
                        <div
                          key={classItem.id}
                          className="bg-primary/10 p-1 rounded cursor-pointer hover:bg-primary/20 transition-colors mb-1"
                          onClick={() => router.push(`/${locale}/classes/${classItem.id}`)}
                        >
                          <div className="text-xs font-medium truncate">
                            {classItem[`name_${locale}`] || classItem.name_en}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {classItem.coach?.first_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {classItem.enrollments_count}/{classItem.capacity}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile List View */}
        <div className="lg:hidden space-y-4">
          {weekDates.map((date, dayIndex) => {
            const dayClasses = filteredClasses.filter(c =>
              c.schedules?.some((s: any) => s.day_of_week === dayIndex)
            )
            
            if (dayClasses.length === 0) return null

            return (
              <div key={dayIndex}>
                <div className={cn(
                  "flex items-center gap-2 mb-2",
                  isToday(date) && "text-primary font-semibold"
                )}>
                  <Calendar className="h-4 w-4" />
                  <span>{DAYS[dayIndex]}</span>
                  <span className="text-muted-foreground">{formatDate(date)}</span>
                  {isToday(date) && (
                    <Badge variant="default" className="text-xs">Today</Badge>
                  )}
                </div>
                <div className="space-y-2">
                  {dayClasses.map((classItem) => (
                    <div
                      key={classItem.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => router.push(`/${locale}/classes/${classItem.id}`)}
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {classItem[`name_${locale}`] || classItem.name_en}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Users className="h-3 w-3" />
                          <span>{classItem.coach?.first_name} {classItem.coach?.last_name}</span>
                          <Clock className="h-3 w-3 ml-2" />
                          {classItem.schedules?.map((s: any) => (
                            <span key={s.id}>
                              {s.start_time} - {s.end_time}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {classItem.enrollments_count}/{classItem.capacity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}