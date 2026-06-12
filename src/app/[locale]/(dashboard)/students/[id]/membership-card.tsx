'use client'

/**
 * Member-360 membership card (ML-1 — the IA-2 D2 docking slot): live
 * read-time state (active/expiring/overdue/lapsed/frozen) + period + plan
 * (+ pending next-cycle change), with the staff actions:
 *   Renew now · Freeze (bounds shown) / Unfreeze · Change plan · Reinstate.
 * All writes are guarded RPCs; states recompute on every render.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { membershipState, type MembershipState } from '@/lib/lifecycle/status'
import {
  freezeMembership, unfreezeMembership, changeMembershipPlan,
  renewMembershipNow, reinstateMembership,
} from '@/lib/lifecycle/actions'
import { RefreshCw, Snowflake, Sun, ArrowUpDown, RotateCcw, Loader2, X } from 'lucide-react'

export type MembershipCardData = {
  id: string
  status: string
  start_date: string
  end_date: string
  pause_end_date: string | null
  planName: string
  pendingPlanName: string | null
  renewalOpen: boolean // an unpaid renewal invoice exists for the next period
}
export type PlanOption = { id: string; name: string; price: number; durationDays: number }

const TONE: Record<MembershipState, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  overdue: 'bg-orange-100 text-orange-700',
  lapsed: 'bg-red-100 text-red-700',
  frozen: 'bg-blue-100 text-blue-700',
  none: 'bg-gray-100 text-gray-500',
}

export function MembershipCard({ data, plans, policy, freezeUsedDays, studentId, locale }: {
  data: MembershipCardData | null
  plans: PlanOption[]
  policy: { renewal_lead_days: number; dunning_grace_days: number; freeze_max_days_year: number; freeze_min_chunk_days: number }
  freezeUsedDays: number
  studentId: string
  locale: string
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('lifecycle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [freezeDays, setFreezeDays] = useState('10')
  const [planOpen, setPlanOpen] = useState(false)
  const [planId, setPlanId] = useState('')

  if (!data) return <p className="py-3 text-center text-sm text-gray-400">{t('noMembership')}</p>

  const state = membershipState(data, policy)
  const fmtD = (d: string | null) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString(isRTL ? 'ar-LB' : 'en-US') : '—')

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okKey: string) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) { toast({ title: t(okKey as any), variant: 'success' }); setFreezeOpen(false); setPlanOpen(false); router.refresh() }
      else toast({ title: t('actionFailed'), description: (res as any).error, variant: 'destructive' })
    })

  return (
    <div className="space-y-2.5" data-testid="membership-card" data-state={state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{data.planName}</p>
          <p className="text-xs text-gray-500" dir="ltr" data-testid="membership-period">
            {fmtD(data.start_date)} → {fmtD(data.end_date)}
          </p>
          {data.pendingPlanName && (
            <p className="text-[11px] text-amber-600" data-testid="membership-pending-plan">
              {t('pendingPlan', { plan: data.pendingPlanName })}
            </p>
          )}
          {state === 'frozen' && data.pause_end_date && (
            <p className="text-[11px] text-blue-600" data-testid="membership-frozen-until">
              {t('frozenUntil', { date: fmtD(data.pause_end_date) })}
            </p>
          )}
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', TONE[state])} data-testid="membership-state">
          {t(`state.${state}` as any)}
        </span>
      </div>

      {data.renewalOpen && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700" data-testid="membership-renewal-open">
          {t('renewalOpen')}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {state !== 'frozen' && (
          <Button size="sm" variant="outline" data-testid="ms-renew-now" disabled={pending}
            onClick={() => run(() => renewMembershipNow(data.id, studentId), 'renewIssued')} className="h-7 text-xs">
            <RefreshCw className="mr-1 h-3 w-3" /> {t('renewNow')}
          </Button>
        )}
        {state === 'frozen' ? (
          <Button size="sm" variant="outline" data-testid="ms-unfreeze" disabled={pending}
            onClick={() => run(() => unfreezeMembership(data.id, studentId), 'unfrozen')} className="h-7 text-xs text-blue-700">
            <Sun className="mr-1 h-3 w-3" /> {t('unfreeze')}
          </Button>
        ) : state === 'lapsed' ? (
          <Button size="sm" data-testid="ms-reinstate" disabled={pending}
            onClick={() => run(() => reinstateMembership(data.id, studentId), 'reinstated')}
            className="h-7 bg-[#cd1419] text-xs hover:bg-[#a81014]">
            <RotateCcw className="mr-1 h-3 w-3" /> {t('reinstate')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" data-testid="ms-freeze-open" disabled={pending}
            onClick={() => setFreezeOpen(true)} className="h-7 text-xs">
            <Snowflake className="mr-1 h-3 w-3" /> {t('freeze')}
          </Button>
        )}
        <Button size="sm" variant="outline" data-testid="ms-change-plan-open" disabled={pending}
          onClick={() => setPlanOpen(true)} className="h-7 text-xs">
          <ArrowUpDown className="mr-1 h-3 w-3" /> {t('changePlan')}
        </Button>
      </div>

      {freezeOpen && (
        <div className="rounded-xl border bg-blue-50/40 p-3 space-y-2" data-testid="ms-freeze-panel">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">{t('freezeTitle')}</p>
            <button type="button" onClick={() => setFreezeOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="text-[11px] text-gray-500">
            {t('freezeBounds', {
              min: policy.freeze_min_chunk_days,
              left: Math.max(0, policy.freeze_max_days_year - freezeUsedDays),
              max: policy.freeze_max_days_year,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Input type="number" min={policy.freeze_min_chunk_days} data-testid="ms-freeze-days"
              value={freezeDays} onChange={(e) => setFreezeDays(e.target.value)} className="h-8 w-24" />
            <Button size="sm" data-testid="ms-freeze-submit" disabled={pending}
              onClick={() => run(() => freezeMembership(data.id, Number(freezeDays), studentId), 'frozen')}
              className="h-8 bg-[#cd1419] text-xs hover:bg-[#a81014]">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Snowflake className="mr-1 h-3 w-3" />} {t('freezeConfirm')}
            </Button>
          </div>
        </div>
      )}

      {planOpen && (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-2" data-testid="ms-plan-panel">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">{t('changePlanTitle')}</p>
            <button type="button" onClick={() => setPlanOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="text-[11px] text-gray-500">{t('changePlanNote')}</p>
          <div className="flex flex-wrap gap-1.5">
            {plans.map((p) => (
              <button key={p.id} type="button" data-testid="ms-plan-chip" data-id={p.id}
                onClick={() => setPlanId(p.id)}
                className={cn('rounded-full border px-2.5 py-1 text-xs font-medium',
                  planId === p.id ? 'border-[#cd1419] bg-red-50 text-[#cd1419]' : 'border-gray-200 bg-white text-gray-700')}>
                {p.name} · ${p.price.toFixed(0)}
              </button>
            ))}
          </div>
          <Button size="sm" data-testid="ms-plan-submit" disabled={pending || !planId}
            onClick={() => run(() => changeMembershipPlan(data.id, planId, studentId), 'planChanged')}
            className="h-8 bg-[#cd1419] text-xs hover:bg-[#a81014]">
            {t('changePlanConfirm')}
          </Button>
        </div>
      )}
    </div>
  )
}
