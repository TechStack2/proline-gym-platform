'use client'

/**
 * MJ-3 Req2/Req3 — member/guardian membership lifecycle REQUESTS.
 * The portal's old "renew at the desk" dead-end becomes "Request renewal"; an
 * active membership can "Request freeze". Both are ONE-TAP requests that post to
 * the staff /inbox (no self-service payment, no cancel — D2). Staff approve at
 * the desk, where they set the exact freeze length (the request defaults to the
 * gym's minimum chunk). The affordance reflects a pending request honestly.
 * Reused verbatim on the guardian kid dashboard.
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RefreshCw, Snowflake, Clock } from 'lucide-react'
import { requestRenewal, requestFreeze } from '../lifecycle-request-actions'

type Props = {
  locale: string
  studentId: string
  /** most-urgent membership state (lib/lifecycle/status membershipState) */
  state: 'active' | 'expiring' | 'overdue' | 'lapsed' | 'frozen'
  pendingRenewal: boolean
  pendingFreeze: boolean
  freezeMinDays: number
}

export function MembershipLifecycleActions({ locale, studentId, state, pendingRenewal, pendingFreeze, freezeMinDays }: Props) {
  const t = useTranslations('portalHome')
  const isRTL = locale === 'ar'
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const showRenewal = ['expiring', 'overdue', 'lapsed'].includes(state)
  const showFreeze = state === 'active'
  if (!showRenewal && !showFreeze) return null

  const doRenewal = () =>
    startTransition(async () => {
      const res = await requestRenewal(studentId)
      if (res.ok) { toast.success(t('renewalRequested')); router.refresh() }
      else toast.error(res.error)
    })

  const doFreeze = () =>
    startTransition(async () => {
      // Default to the gym minimum chunk; staff set the exact length at the desk.
      const res = await requestFreeze({ studentId, days: freezeMinDays })
      if (res.ok) { toast.success(t('freezeRequested')); router.refresh() }
      else toast.error(res.error)
    })

  return (
    <div data-testid="lifecycle-actions" className={cn('flex flex-wrap gap-2', isRTL && 'justify-end')}>
      {showRenewal && (
        pendingRenewal ? (
          <span data-testid="renewal-requested" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            <Clock className="h-3.5 w-3.5" /> {t('renewalPending')}
          </span>
        ) : (
          <button type="button" data-testid="request-renewal-btn" disabled={pending} onClick={doRenewal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-800 disabled:opacity-60">
            <RefreshCw className="h-3.5 w-3.5" /> {t('requestRenewal')}
          </button>
        )
      )}

      {showFreeze && (
        pendingFreeze ? (
          <span data-testid="freeze-requested" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            <Clock className="h-3.5 w-3.5" /> {t('freezePending')}
          </span>
        ) : (
          <button type="button" data-testid="request-freeze-btn" disabled={pending} onClick={doFreeze}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60">
            <Snowflake className="h-3.5 w-3.5 text-blue-500" /> {t('requestFreeze')}
          </button>
        )
      )}
    </div>
  )
}
