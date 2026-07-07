'use client'

/**
 * PT proposal rows (PT-2) — shared by the staff Inbox and the coach app.
 * Accept books through the same RPC guards; counter flips the ball with a
 * new time; decline cancels. One round-trip by design.
 */
import { dateLocale } from '@/lib/utils/locale-format'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { respondPtProposal } from '@/lib/pt/booking-actions'
import { useErrorText } from '@/lib/errors/use-error-text';

export type ProposalRow = {
  id: string
  studentName: string
  packageName: string
  scheduledAt: string
}

export function PtProposals({ rows, locale }: { rows: ProposalRow[]; locale: string }) {
  const isRTL = locale === 'ar'
  const t = useTranslations('ptBooking.proposals')
  const errText = useErrorText();
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [counterAt, setCounterAt] = useState('')

  const respond = (id: string, action: 'accept' | 'counter' | 'decline', at?: string) =>
    startTransition(async () => {
      const res = await respondPtProposal({ sessionId: id, action, counterAt: at ?? null })
      if (res.ok) {
        toast({ title: t(action), variant: 'success' })
        setCounterFor(null)
        router.refresh()
      } else {
        toast({ title: t('failed'), description: errText(res.error), variant: 'destructive' })
      }
    })

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (rows.length === 0) return null

  return (
    <div className="space-y-2" data-testid="pt-proposals">
      {rows.map((r) => (
        <div key={r.id} data-testid="pt-proposal-row"
          className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{r.studentName}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                {r.packageName} · <Clock className="h-3 w-3" /> <span dir="ltr">{fmt(r.scheduledAt)}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" data-testid="proposal-accept" disabled={pending}
                className="bg-green-600 hover:bg-green-700"
                onClick={() => respond(r.id, 'accept')}>
                <CheckCircle2 className="me-1 h-4 w-4" /> {t('acceptBtn')}
              </Button>
              <Button size="sm" variant="outline" data-testid="proposal-counter-open" disabled={pending}
                onClick={() => setCounterFor(counterFor === r.id ? null : r.id)}>
                <Clock className="me-1 h-4 w-4" /> {t('counterBtn')}
              </Button>
              <Button size="sm" variant="outline" data-testid="proposal-decline" disabled={pending}
                className="text-red-600 hover:bg-red-50"
                onClick={() => respond(r.id, 'decline')}>
                <XCircle className="me-1 h-4 w-4" /> {t('declineBtn')}
              </Button>
            </div>
          </div>
          {counterFor === r.id && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
              <input type="datetime-local" data-testid="proposal-counter-at" value={counterAt}
                onChange={(e) => setCounterAt(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
              <Button size="sm" data-testid="proposal-counter-send" disabled={pending || !counterAt}
                onClick={() => respond(r.id, 'counter', new Date(counterAt).toISOString())}
                className={cn('bg-[#cd1419] hover:bg-[#a81014]')}>
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('sendCounter')}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
