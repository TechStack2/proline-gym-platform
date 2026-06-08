'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Mail, Award, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Coach {
  id: string
  name_ar: string
  name_en: string
  phone: string
  email: string
  status: string
  specialization: string
  coach_disciplines: Array<{
    disciplines: {
      id: string
      name: string
    }
  }>
}

interface CoachListProps {
  coaches: Coach[]
  locale: string
  isRTL: boolean
}

export function CoachList({ coaches, locale, isRTL }: CoachListProps) {
  const t = useTranslations('coaches')

  if (coaches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('no_coaches')}
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'on_leave': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {coaches.map((coach) => (
        <Link key={coach.id} href={`/${locale}/coaches/${coach.id}`}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className={cn("font-semibold text-lg", isRTL && "text-right")}>
                    {isRTL ? coach.name_ar : coach.name_en}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {coach.specialization || t('no_specialization')}
                  </p>
                </div>
                <Badge className={getStatusColor(coach.status)}>
                  {t(`status.${coach.status}`)}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span dir="ltr">{coach.phone}</span>
                </div>

                {coach.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span>{coach.email}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Award className="w-4 h-4" />
                  <div className="flex flex-wrap gap-1">
                    {coach.coach_disciplines.map((cd) => (
                      <Badge key={cd.disciplines.id} variant="secondary">
                        {cd.disciplines.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}