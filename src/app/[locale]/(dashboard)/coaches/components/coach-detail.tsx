'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Phone, Award, User, Calendar, ArrowLeft, Pencil, UserX, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { localizedName, one } from '@/lib/names'
import { Avatar } from '@/components/shared/avatar'
import { InviteButton } from '@/components/shared/invite-button'

// Real schema: coaches has NO name/email/status/coach_disciplines. Name + phone
// come from the embedded `profiles`; specialization/bio are `*_{ar,en,fr}`;
// active state is `is_active`; rank is `belt_rank`. A coach's classes carry the
// schedule on `class_schedules` (day_of_week/start_time/end_time), not on classes.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CoachDetailProps {
  coach: any
  classes: any[]
  locale: string
  activeClassCount?: number
  activePtCount?: number
}

export function CoachDetail({ coach, classes, locale, activeClassCount = 0, activePtCount = 0 }: CoachDetailProps) {
  const t = useTranslations('coaches')
  const ta = useTranslations('coaches.admin')
  const router = useRouter()
  const isRTL = locale === 'ar'
  const profile = one(coach.profiles)
  const [confirmDeact, setConfirmDeact] = useState(false)
  const [busy, setBusy] = useState(false)

  // ADM-1: deactivate-never-delete — the coach leaves active lists, wizard
  // chips and the diary; history (classes/PT/attendance) stays intact.
  const deactivate = async () => {
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.from('coaches')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', coach.id)
    setBusy(false)
    if (!error) { router.push(`/${locale}/coaches`); router.refresh() }
  }

  const hasObligations = activeClassCount > 0 || activePtCount > 0

  const loc = (base: string) =>
    (locale === 'ar' ? coach[`${base}_ar`] : locale === 'fr' ? coach[`${base}_fr`] : coach[`${base}_en`]) || coach[`${base}_en`] || ''
  const className = (c: any) => (locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/coaches`}>
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <Avatar url={profile?.avatar_url} name={localizedName(coach.profiles, locale)} size="lg" />
        <h1 className="text-3xl font-bold" data-testid="coach-name">{localizedName(coach.profiles, locale)}</h1>
        <Badge className={coach.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
          {coach.is_active ? t('status.active') : t('status.inactive')}
        </Badge>
      </div>

      {/* ── ADM-1 admin bar: edit · deactivate (archive pattern) ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm" data-testid="coach-admin-bar">
        <Link href={`/${locale}/coaches/${coach.id}/edit`}>
          <Button variant="outline" size="sm" data-testid="coach-edit-btn">
            <Pencil className="mr-1 h-4 w-4" /> {ta('edit')}
          </Button>
        </Link>
        {/* ON-1: invite this coach to the app (team invite — elevated scope) */}
        <InviteButton kind="coach" id={coach.id} name={localizedName(coach.profiles, locale)} locale={locale} />
        {coach.is_active && (
          confirmDeact ? (
            <span className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="coach-deactivate-warning">
              {hasObligations
                ? ta('deactivateWarn', { classes: activeClassCount, pt: activePtCount })
                : ta('deactivateConfirm')}
              <Button size="sm" variant="outline" data-testid="coach-deactivate-confirm" disabled={busy}
                className="border-red-300 text-red-700 hover:bg-red-100" onClick={deactivate}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ta('deactivateYes')}
              </Button>
              <Button size="sm" variant="ghost" data-testid="coach-deactivate-cancel" onClick={() => setConfirmDeact(false)}>
                {ta('cancel')}
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" data-testid="coach-deactivate-btn"
              className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDeact(true)}>
              <UserX className="mr-1 h-4 w-4" /> {ta('deactivate')}
            </Button>
          )
        )}
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
