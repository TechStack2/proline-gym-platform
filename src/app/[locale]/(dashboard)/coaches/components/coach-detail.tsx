'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Mail, Award, User, Calendar, Clock, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CoachDetailProps {
  coach: any
  classes: any[]
  locale: string
}

export function CoachDetail({ coach, classes, locale }: CoachDetailProps) {
  const t = useTranslations('coaches')
  const isRTL = locale === 'ar'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'on_leave': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/coaches`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">
          {isRTL ? coach.name_ar : coach.name_en}
        </h1>
        <Badge className={getStatusColor(coach.status)}>
          {t(`status.${coach.status}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('profile_info')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span dir="ltr">{coach.phone}</span>
            </div>
            {coach.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span>{coach.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gray-400" />
              <span>{coach.specialization || t('no_specialization')}</span>
            </div>
          </CardContent>
        </Card>

        {/* Disciplines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              {t('disciplines')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {coach.coach_disciplines.map((cd: any) => (
                <Badge key={cd.disciplines.id} variant="secondary">
                  {cd.disciplines.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bio */}
      {coach.bio && (
        <Card>
          <CardHeader>
            <CardTitle>{t('bio')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{coach.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Classes Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t('class_schedule')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('class_name')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('day')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('time')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('students')}</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{cls.name}</td>
                    <td className="py-2 px-4">{cls.day_of_week}</td>
                    <td className="py-2 px-4">
                      {new Date(cls.start_time).toLocaleTimeString()} - {new Date(cls.end_time).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-4">{cls.student_count || 0}</td>
                  </tr>
                ))}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">
                      {t('no_classes')}
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