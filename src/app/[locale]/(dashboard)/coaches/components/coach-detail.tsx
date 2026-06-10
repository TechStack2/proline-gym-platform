'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Award, User, Calendar, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'

// Real schema: coaches has NO name/email/status/coach_disciplines. Name + phone
// come from the embedded `profiles`; specialization/bio are `*_{ar,en,fr}`;
// active state is `is_active`; rank is `belt_rank`. A coach's classes carry the
// schedule on `class_schedules` (day_of_week/start_time/end_time), not on classes.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CoachDetailProps {
  coach: any
  classes: any[]
  locale: string
}

export function CoachDetail({ coach, classes, locale }: CoachDetailProps) {
  const t = useTranslations('coaches')
  const isRTL = locale === 'ar'
  const profile = one(coach.profiles)

  const loc = (base: string) =>
    (locale === 'ar' ? coach[`${base}_ar`] : locale === 'fr' ? coach[`${base}_fr`] : coach[`${base}_en`]) || coach[`${base}_en`] || ''
  const className = (c: any) => (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/coaches`}>
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-3xl font-bold" data-testid="coach-name">{localizedName(coach.profiles, locale)}</h1>
        <Badge className={coach.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
          {coach.is_active ? t('status.active') : t('status.inactive')}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5" />{t('profile_info')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile?.phone && (
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><span dir="ltr">{profile.phone}</span></div>
            )}
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gray-400" />
              <span>{loc('specialization') || t('no_specialization')}</span>
            </div>
            {coach.belt_rank && (
              <div className="flex items-center gap-2"><Award className="w-4 h-4 text-gray-400" /><span>{coach.belt_rank}</span></div>
            )}
          </CardContent>
        </Card>

        {loc('bio') && (
          <Card>
            <CardHeader><CardTitle>{t('bio')}</CardTitle></CardHeader>
            <CardContent><p className="text-gray-600">{loc('bio')}</p></CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />{t('class_schedule')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={cn('py-2 px-4 text-left', isRTL && 'text-right')}>{t('class_name')}</th>
                  <th className={cn('py-2 px-4 text-left', isRTL && 'text-right')}>{t('day')}</th>
                  <th className={cn('py-2 px-4 text-left', isRTL && 'text-right')}>{t('time')}</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => {
                  const sch = cls.schedules || []
                  return (
                    <tr key={cls.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">{className(cls)}</td>
                      <td className="py-2 px-4">{sch.map((s: any) => DAYS[s.day_of_week]).join(', ') || '—'}</td>
                      <td className="py-2 px-4">{sch.length ? `${sch[0].start_time} - ${sch[0].end_time}` : '—'}</td>
                    </tr>
                  )
                })}
                {classes.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-gray-500">{t('no_classes')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
