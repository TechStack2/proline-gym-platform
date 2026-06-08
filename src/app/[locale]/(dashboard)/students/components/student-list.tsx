'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Calendar, Award, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Student {
  id: string
  name_ar: string
  name_en: string
  phone: string
  date_of_birth: string
  gender: string
  status: string
  join_date: string
  disciplines: { id: string; name: string } | null
  belt_ranks: { id: string; name: string; color: string } | null
  guardians: { id: string; name: string; phone: string } | null
}

interface StudentListProps {
  students: Student[]
  locale: string
  isRTL: boolean
}

export function StudentList({ students, locale, isRTL }: StudentListProps) {
  const t = useTranslations('students')

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('no_students')}
      </div>
    )
  }

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {students.map((student) => (
        <Link key={student.id} href={`/${locale}/students/${student.id}`} data-testid="student-card">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className={cn("font-semibold text-lg", isRTL && "text-right")}>
                    {isRTL ? student.name_ar : student.name_en}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {student.disciplines?.name || t('no_discipline')}
                  </p>
                </div>
                <Badge className={getStatusColor(student.status)}>
                  {t(`status.${student.status}`)}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award className="w-4 h-4" />
                  {student.belt_ranks ? (
                    <Badge className={getBeltColor(student.belt_ranks.color)}>
                      {student.belt_ranks.name}
                    </Badge>
                  ) : (
                    <span>{t('no_belt')}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span dir="ltr">{student.phone}</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(student.join_date).toLocaleDateString()}</span>
                </div>

                {student.guardians && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="w-4 h-4" />
                    <span>{student.guardians.name}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}