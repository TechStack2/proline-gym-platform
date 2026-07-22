'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Award, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { localizedName, one } from '@/lib/names'
import { beltRankLabel } from '@/lib/belts/label'
import { fmtPhone } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { NavChevron } from '@/components/ui/nav-chevron'

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
  const tb = useTranslations('beltRanks')

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
                    <h3 className="font-semibold text-lg" data-testid="coach-name">
                      {localizedName(coach.profiles, locale) || <span className="text-gray-400"><User className="inline h-4 w-4" /></span>}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {localized(coach, 'specialization') || t('no_specialization')}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {/* W3b §2.3: ONE status chip — the member vocabulary picks the hue. */}
                    <StatusChip domain="member" status={coach.is_active ? 'active' : 'inactive'}
                      label={coach.is_active ? t('status.active') : t('status.inactive')} />
                    <NavChevron />
                  </span>
                </div>

                <div className="space-y-2">
                  {profile?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <Ltr>{fmtPhone(profile.phone)}</Ltr>
                    </div>
                  )}
                  {coach.belt_rank && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="w-4 h-4" />
                      <span>{beltRankLabel(coach.belt_rank, tb)}</span>
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
