'use client'

/**
 * J2 COACH-UNIFY — the post-create phase of the unified add-coach flow. After the
 * wizard creates the coach (and, if "app access" was ON, adopted it into a login via
 * inviteToPortal), the desk lands here IN THE SAME client context (the temp password
 * lives only in memory) to: (1) share the one-time credentials, and (2) set the new
 * coach's availability inline — the AvailabilityEditor writes each window immediately
 * (is_active=true → the coach is bookable), and onChanged re-fetches the list so the
 * owner sees what they published. Skippable: "Done" lands on the coach's Coach-360.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InviteResultCard, type InviteResult } from '@/components/shared/invite-button'
import { AvailabilityEditor, type AvailabilityRow } from '../../../coach/pt/availability-editor'

export function CoachCreatedPanel({
  coachId, gymId, coachName, locale, inviteResult,
}: {
  coachId: string
  gymId: string
  coachName: string
  locale: string
  inviteResult: InviteResult | null
}) {
  const router = useRouter()
  const t = useTranslations('coaches.form')
  const isRTL = locale === 'ar'
  const [windows, setWindows] = useState<AvailabilityRow[]>([])

  const refetch = useCallback(async () => {
    const { data } = await createClient()
      .from('coach_availability')
      .select('id, day_of_week, start_time, end_time, is_active')
      .eq('coach_id', coachId)
      .eq('gym_id', gymId)
      .order('day_of_week')
    setWindows((data ?? []) as AvailabilityRow[])
  }, [coachId, gymId])

  useEffect(() => { void refetch() }, [refetch])

  const done = () => {
    router.push(`/${locale}/coaches/${coachId}`)
    router.refresh()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) done() }}
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          {t('createdTitle', { name: coachName })}
        </span>
      }
      variant="responsive"
      data-testid="coach-created-panel"
      footer={
        <Button size="sm" data-testid="coach-created-done" onClick={done} className="bg-primary-700 hover:bg-primary-800">
          {t('done')}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Credentials — only when "app access" was turned on. */}
        {inviteResult && (
          <div className="space-y-1.5">
            <p className={cn('text-xs font-medium text-gray-500', isRTL && 'font-arabic')}>{t('credentialsIntro')}</p>
            <InviteResultCard result={inviteResult} locale={locale} />
          </div>
        )}

        {/* Availability — set it now (skippable). */}
        <div className="space-y-1.5">
          <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('availabilityTitle')}</p>
          <p className={cn('text-xs text-gray-500', isRTL && 'font-arabic')}>{t('availabilityHint')}</p>
          <AvailabilityEditor
            coachId={coachId}
            gymId={gymId}
            windows={windows}
            overrides={[]}
            onChanged={refetch}
            locale={locale}
          />
          {windows.length === 0 && (
            <p data-testid="coach-not-bookable-note" className={cn('text-xs text-amber-600', isRTL && 'font-arabic')}>
              {t('notBookableYet')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
