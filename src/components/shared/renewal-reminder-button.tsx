'use client'

/**
 * G1 "Send renewal reminder" — the AUTO path (vs the manual wa.me share button):
 * fires the in-app notification to the member AND, when the gym's WhatsApp is
 * active, auto-dispatches the Cloud-API message. Best-effort; surfaces the
 * outcome so staff (and the e2e) can see notified/dispatched.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { BellRing, Check, Loader2 } from 'lucide-react'
import { sendRenewalReminder } from '@/lib/whatsapp/actions'

export function RenewalReminderButton({ membershipId, locale }: { membershipId: string; locale: string }) {
  const t = useTranslations('whatsapp')
  const isRTL = locale === 'ar'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ notified: boolean; dispatched: boolean; status?: string } | null>(null)

  const send = async () => {
    setBusy(true)
    const res = await sendRenewalReminder(membershipId)
    setBusy(false)
    if (res.ok) setDone({ notified: res.notified, dispatched: res.dispatched, status: res.status })
  }

  if (done) {
    return (
      <span data-testid="reminder-result" data-notified={done.notified} data-dispatched={done.dispatched} data-status={done.status ?? ''}
        className={cn('inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700', isRTL && 'font-arabic')}>
        <Check className="h-3.5 w-3.5" /> {t('reminderSent')}
      </span>
    )
  }

  return (
    <button type="button" data-testid="send-reminder-btn" onClick={send} disabled={busy}
      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} {t('sendReminder')}
    </button>
  )
}
