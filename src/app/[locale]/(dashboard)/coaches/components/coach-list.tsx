'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Award, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'

// Real schema: coaches has NO name/email/status columns. Names + phone come from
// the embedded `profiles` row; specialization is `specialization_{ar,en,fr}`;
// active state is `is_active`; rank is `belt_rank`. (The legacy component read
// coach.name_ar/email/coach_disciplines — none of which exist — so it rendered blank.)
interface Coach {
  id: string
  is_active?: boolean | null
  belt_rank?: string | null
  specialization_ar?: string | null
  specialization_en?: string | null
  specialization_fr?: string | null
  profiles?: any
}

interface CoachListProps {
  coaches: Coach[]
  locale: string
  isRTL: boolean
}

export function CoachList({ coaches, locale, isRTL }: CoachListProps) {
  const t = useTranslations('coaches')

  if (coaches.length === 0) {
    return <div className="text-center py-12 text-gray-500">{t('no_coaches')}</div>
  }

  const localized = (c: Coach, base: 'specialization') =>
    (locale === 'ar' ? c[`${base}_ar`] : locale === 'fr' ? c[`${base}_fr`] : c[`${base}_en`]) || c[`${base}_en`] || ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {coaches.map((coach) => {
        const profile = one(coach.profiles)
        return (
          <Link key={coach.id} href={`/${locale}/coaches/${coach.id}`}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer" data-testid="coach-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className={cn('font-semibold text-lg', isRTL && 'text-right')} data-testid="coach-name">
                      {localizedName(coach.profiles, locale) || <span className="text-gray-400"><User className="inline h-4 w-4" /></span>}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {localized(coach, 'specialization') || t('no_specialization')}
                    </p>
                  </div>
                  <Badge className={coach.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {coach.is_active ? t('status.active') : t('status.inactive')}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {profile?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span dir="ltr">{profile.phone}</span>
                    </div>
                  )}
                  {coach.belt_rank && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="w-4 h-4" />
                      <span>{coach.belt_rank}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
