'use client'

/**
 * Per-session member actions nested in the package card (PT-2):
 *  · cancel a scheduled future booking (the RPC enforces the C1 policy
 *    window — inside it the member is sent to the desk);
 *  · accept/decline a counter-proposal when the ball is the member's.
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cancelPtBooking, respondPtProposal } from '@/lib/pt/booking-actions'
import { useErrorText } from '@/lib/errors/use-error-text';

export function CancelBookingButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations('ptBooking')
  const errText = useErrorText();
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const cancel = () =>
    startTransition(async () => {
      const res = await cancelPtBooking(sessionId)
      if (res.ok) { toast.success(t('cancelled')); router.refresh() }
      else toast.error(errText(res.error))
    })
  return (
    <button type="button" data-testid="pt-cancel-booking" disabled={pending} onClick={cancel}
      className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:border-red-200 hover:text-red-600 disabled:opacity-50">
      {t('cancelBtn')}
    </button>
  )
}

export function MemberProposalActions({ sessionId }: { sessionId: string }) {
  const t = useTranslations('ptBooking')
  const errText = useErrorText()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const respond = (action: 'accept' | 'decline') =>
    startTransition(async () => {
      const res = await respondPtProposal({ sessionId, action })
      if (res.ok) { toast.success(t(action === 'accept' ? 'booked' : 'cancelled')); router.refresh() }
      else toast.error(errText(res.error))
    })
  return (
    <span className="flex items-center gap-1">
      <button type="button" data-testid="pt-proposal-accept-member" disabled={pending} onClick={() => respond('accept')}
        className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-medium text-primary-foreground disabled:opacity-50">
        {t('acceptCounter')}
      </button>
      <button type="button" data-testid="pt-proposal-decline-member" disabled={pending} onClick={() => respond('decline')}
        className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 disabled:opacity-50">
        {t('declineCounter')}
      </button>
    </span>
  )
}
