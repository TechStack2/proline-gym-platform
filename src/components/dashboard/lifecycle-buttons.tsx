'use client'

/**
 * ML-1 client buttons docked into server surfaces: the Expiring card's
 * one-tap Renew (issues the renewal invoice idempotently) and Money's
 * "Process renewals now" (the gym-scoped tick — also the e2e driver).
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/use-toast'
import { renewMembershipNow, processRenewalsNow, unfreezeMembership } from '@/lib/lifecycle/actions'
import { RefreshCw, Play, Loader2 } from 'lucide-react'

export function RenewRowButton({ membershipId, studentId }: { membershipId: string; studentId: string }) {
  const t = useTranslations('lifecycle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const renew = () =>
    startTransition(async () => {
      const res = await renewMembershipNow(membershipId, studentId)
      if (res.ok) { toast({ title: t('renewIssued'), variant: 'success' }); router.refresh() }
      else toast({ title: t('actionFailed'), description: (res as any).error, variant: 'destructive' })
    })
  return (
    <button type="button" data-testid="expiring-renew" disabled={pending} onClick={renew}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-[#a81014] disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {t('renewShort')}
    </button>
  )
}

// PAUSE-CARD: one-tap Resume on the Today "Paused" card. Reuses the existing
// unfreeze_membership RPC (early-unfreeze restores pro-rata, as built) — no new RPC.
export function ResumeRowButton({ membershipId, studentId }: { membershipId: string; studentId: string }) {
  const t = useTranslations('lifecycle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const resume = () =>
    startTransition(async () => {
      const res = await unfreezeMembership(membershipId, studentId)
      if (res.ok) { toast({ title: t('resumed'), variant: 'success' }); router.refresh() }
      else toast({ title: t('actionFailed'), description: (res as any).error, variant: 'destructive' })
    })
  return (
    <button type="button" data-testid="paused-resume" disabled={pending} onClick={resume}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#cd1419] px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-[#a81014] disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {t('resumeShort')}
    </button>
  )
}

export function ProcessRenewalsButton() {
  const t = useTranslations('lifecycle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const run = () =>
    startTransition(async () => {
      const res = await processRenewalsNow()
      if (res.ok) {
        const d: any = (res as any).data ?? {}
        toast({
          title: t('tickDone'),
          description: t('tickSummary', {
            issued: d.issued ?? 0, reminded: d.reminded ?? 0,
            lapsed: d.lapsed ?? 0, suspended: d.suspended ?? 0, unfrozen: d.unfrozen ?? 0,
          }),
          variant: 'success',
        })
        router.refresh()
      } else {
        toast({ title: t('actionFailed'), description: (res as any).error, variant: 'destructive' })
      }
    })
  return (
    <button type="button" data-testid="process-renewals-now" disabled={pending} onClick={run}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[#a81014] disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {t('processNow')}
    </button>
  )
}
