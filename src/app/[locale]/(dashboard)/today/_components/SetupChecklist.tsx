import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { getSetupMilestones } from '@/lib/gym/setup-checklist'
import { Sparkles, Check } from 'lucide-react'
import { NavChevron } from '@/components/ui/nav-chevron'

/**
 * ONBOARDING-CHECKLIST → J1 SETUP-HUB summary. The /today card is now a COMPACT,
 * derived progress summary that links to the full guided hub at /setup (six
 * milestones), instead of the old inline item list. Still derived (no stored
 * state) and still self-hiding once every milestone is done, so a configured gym
 * never sees it. Dark + RTL safe via the neutral channel-var palette + logical
 * direction handling.
 */
export async function SetupChecklist({ locale, gymId }: { locale: string; gymId: string }) {
  const supabase = await createClient()
  const { milestones, doneCount, total, allDone } = await getSetupMilestones(supabase, gymId)
  if (allDone) return null // hide once every milestone is done

  const t = await getTranslations('setupChecklist')
  const isRTL = locale === 'ar'

  return (
    <Link
      href={`/${locale}/setup`}
      data-testid="setup-checklist"
      data-done={doneCount}
      data-total={total}
      dir={isRTL ? 'rtl' : 'ltr'}
      className="block rounded-2xl border border-primary-700/20 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-700/10 text-primary-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</p>
        </div>
        <span data-testid="setup-progress" className="flex-shrink-0 text-xs font-medium text-gray-500">
          {t('progress', { done: doneCount, total })}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* six milestone dots — a compact, guided at-a-glance of the /setup hub */}
        <div className="flex items-center gap-1.5">
          {milestones.map((m) => (
            <span
              key={m.key}
              data-testid={`setup-dot-${m.key}`}
              data-done={m.done}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full',
                m.done ? 'bg-green-600 text-primary-foreground' : 'border-2 border-gray-200',
              )}
            >
              {m.done && <Check className="h-3 w-3" />}
            </span>
          ))}
        </div>
        <span
          data-testid="setup-hub-link"
          className={cn('flex flex-shrink-0 items-center gap-0.5 text-xs font-semibold text-primary-600', isRTL && 'font-arabic')}
        >
          {t('cta')}
          <NavChevron className="text-primary-600" />
        </span>
      </div>
    </Link>
  )
}
