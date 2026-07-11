'use client'

/**
 * MJ-3 Req2/Req3 — member/guardian membership lifecycle REQUESTS.
 * The portal's old "renew at the desk" dead-end becomes "Request renewal"; an
 * active membership can "Request freeze" (reason optional). Both post to the
 * staff /inbox (no self-service payment, no cancel — D2). The affordance reflects
 * a pending request honestly. Reused verbatim on the guardian kid dashboard.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RefreshCw, Snowflake, Clock } from 'lucide-react'
import { ModalPortal } from '@/components/shared/modal-portal'
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
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [days, setDays] = useState(String(freezeMinDays))
  const [reason, setReason] = useState('')

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
      const n = parseInt(days, 10)
      const res = await requestFreeze({ studentId, days: Number.isFinite(n) ? n : undefined, reason: reason.trim() || undefined })
      if (res.ok) { toast.success(t('freezeRequested')); setFreezeOpen(false); router.refresh() }
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
          <button type="button" data-testid="request-freeze-btn" disabled={pending} onClick={() => setFreezeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300">
            <Snowflake className="h-3.5 w-3.5 text-blue-500" /> {t('requestFreeze')}
          </button>
        )
      )}

      {freezeOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pending && setFreezeOpen(false)}>
            <div data-testid="freeze-modal" dir={isRTL ? 'rtl' : 'ltr'}
              className={cn('w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-3', isRTL && 'text-right')}
              onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold text-gray-900">{t('freezeTitle')}</h2>
              <p className="text-xs text-gray-500">{t('freezeIntro', { min: freezeMinDays })}</p>
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">{t('freezeDays')}</span>
                <input data-testid="freeze-days" type="number" min={freezeMinDays} value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">{t('freezeReason')}</span>
                <input data-testid="freeze-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={t('freezeReasonPh')} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setFreezeOpen(false)} disabled={pending}
                  className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  {t('cancel')}
                </button>
                <button type="button" data-testid="freeze-submit" onClick={doFreeze} disabled={pending}
                  className="flex-1 rounded-xl bg-primary-700 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-800 disabled:bg-gray-300">
                  {t('sendRequest')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
