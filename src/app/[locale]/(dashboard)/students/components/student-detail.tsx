'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Calendar, Award, User, Activity, Clock, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StudentDetailProps {
  student: any
  memberships: any[]
  attendance: any[]
  beltProgressions: any[]
  locale: string
}

export function StudentDetail({ student, memberships, attendance, beltProgressions, locale }: StudentDetailProps) {
  const t = useTranslations('students')
  const isRTL = locale === 'ar'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getBeltColor = (color: string) => {
    const beltColors: Record<string, string> = {
      white: 'bg-white border border-gray-300 text-gray-800',
      yellow: 'bg-yellow-400 text-yellow-900',
      orange: 'bg-orange-500 text-white',
      green: 'bg-green-600 text-white',
      blue: 'bg-blue-600 text-white',
      purple: 'bg-purple-600 text-white',
      brown: 'bg-amber-800 text-white',
      red: 'bg-red-700 text-white',
      black: 'bg-gray-900 text-white',
    }
    return beltColors[color] || 'bg-gray-100 text-gray-800'
  }

  const calculateAttendanceRate = () => {
    if (attendance.length === 0) return 0
    const present = attendance.filter(a => a.status === 'present').length
    return Math.round((present / attendance.length) * 100)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/students`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">
          {isRTL ? student.name_ar : student.name_en}
        </h1>
        <Badge className={getStatusColor(student.status)}>
          {t(`status.${student.status}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <span dir="ltr">{student.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{new Date(student.date_of_birth).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gray-400" />
              <span>{student.disciplines?.name || t('no_discipline')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-400" />
              <span>{t('gender_' + student.gender)}</span>
            </div>
            {student.guardians && (
              <div className="pt-3 border-t">
                <p className="text-sm font-medium">{t('guardian')}</p>
                <p>{isRTL ? student.guardians.name_ar : student.guardians.name_en}</p>
                <p className="text-sm text-gray-500" dir="ltr">{student.guardians.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('attendance_stats')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">
                {calculateAttendanceRate()}%
              </div>
              <p className="text-sm text-gray-500">{t('attendance_rate')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-semibold text-green-600">
                  {attendance.filter(a => a.status === 'present').length}
                </div>
                <p className="text-xs text-gray-500">{t('present')}</p>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-600">
                  {attendance.filter(a => a.status === 'absent').length}
                </div>
                <p className="text-xs text-gray-500">{t('absent')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Belt Progression */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              {t('belt_progression')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {beltProgressions.map((progression, index) => (
                <div key={progression.id} className="flex items-center gap-2">
                  <div className={cn(
                    "w-4 h-4 rounded-full",
                    getBeltColor(progression.belt_hierarchies?.color)
                  )} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {isRTL ? progression.belt_hierarchies?.name_ar : progression.belt_hierarchies?.name_en}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(progression.achieved_date).toLocaleDateString()}
                    </p>
                  </div>
                  {index < beltProgressions.length - 1 && (
                    <div className="w-px h-4 bg-gray-300" />
                  )}
                </div>
              ))}
              {beltProgressions.length === 0 && (
                <p className="text-sm text-gray-500">{t('no_belt_progressions')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Membership History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('membership_history')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('plan')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('start_date')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('end_date')}</th>
                  <th className={cn("py-2 px-4 text-left", isRTL && "text-right")}>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => (
                  <tr key={membership.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{membership.plan_name}</td>
                    <td className="py-2 px-4">{new Date(membership.start_date).toLocaleDateString()}</td>
                    <td className="py-2 px-4">{new Date(membership.end_date).toLocaleDateString()}</td>
                    <td className="py-2 px-4">
                      <Badge className={getStatusColor(membership.status)}>
                        {t(`status.${membership.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {memberships.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">
                      {t('no_memberships')}
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