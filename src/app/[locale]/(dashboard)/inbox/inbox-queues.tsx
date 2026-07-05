'use client'

/**
 * Inbox queues (IA-1) — inline approve/decline that REUSE the existing verified
 * actions: B2's approveRegistration/rejectRegistration (atomic capacity →
 * active+invoice OR waitlist; guards live in the RPCs) and 22R's
 * approvePtRequest/rejectPtRequest. No re-implemented business logic here —
 * this component only renders rows and forwards clicks.
 */
import { dateLocale } from '@/lib/utils/locale-format'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, XCircle, Dumbbell, CalendarDays, ArrowUpCircle, Tent } from 'lucide-react'
import { approveRegistration, rejectRegistration } from '../classes/[id]/registration-actions'
import { approvePtRequest, rejectPtRequest } from '../pt/actions'
import { registerToCamp, declineCampRequest } from '../camps/actions'

export type RegRequestRow = {
  id: string
  classId: string
  className: string
  studentName: string
  feeUsd: number | null
  requestedAt: string
}
export type PtRequestRow = {
  id: string
  packageName: string
  priceUsd: number | null
  sessions: number
  studentName: string
  requestedAt: string
}
export type PromotionRow = { id: string; className: string; studentName: string; at: string }
export type CampRequestRow = { id: string; campId: string; studentId: string; campName: string; studentName: string; requestedAt: string }

export function InboxQueues({
  locale, regRequests, ptRequests, campRequests = [], promotions,
}: {
  locale: string
  regRequests: RegRequestRow[]
  ptRequests: PtRequestRow[]
  campRequests?: CampRequestRow[]
  promotions: PromotionRow[]
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('inbox')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [discounts, setDiscounts] = useState<Record<string, { pct: string; amt: string }>>({})
  // PERF-2: OPTIMISTIC — hide a row the instant it's actioned; the refresh drops it
  // from the server props on success, or we roll the hide back on failure (React 18.3
  // has no useOptimistic, so this is the repo's optimistic-state + rollback pattern).
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  const run = (id: string, fn: () => Promise<{ ok: boolean } | { ok: false; error: string }>) => {
    setError('')
    setRemoved((prev) => new Set(prev).add(id)) // optimistic hide (instant)
    startTransition(async () => {
      const res = await fn()
      if (!('ok' in res) || !res.ok) {
        setError((res as any).error || 'failed')
        setRemoved((prev) => { const n = new Set(prev); n.delete(id); return n }) // rollback → row reappears
      }
      router.refresh()
    })
  }

  const visCamp = campRequests.filter((r) => !removed.has(r.id))
  const visReg = regRequests.filter((r) => !removed.has(r.id))
  const visPt = ptRequests.filter((r) => !removed.has(r.id))

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(locale))

  return (
    <div className="space-y-6">
      {error && <div data-testid="inbox-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ── Class-registration requests (B2) ── */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Tent className="h-4 w-4 text-primary-600" />
          {t('campRequests')} ({visCamp.length})
        </h2>
        {visCamp.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-400 shadow-sm">{t('emptyQueue')}</p>
        ) : (
          <div className="space-y-2">
            {visCamp.map((r) => (
              <div key={r.id} data-testid="inbox-camp-row" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.studentName}</p>
                  <p className="text-xs text-gray-500">{r.campName} · {fmtDate(r.requestedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" data-testid="inbox-camp-approve" disabled={pending}
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => run(r.id, async () => { const res = await registerToCamp({ studentId: r.studentId, campId: r.campId, requestId: r.id }); return res.ok ? { ok: true } : res })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> {t('approve')}
                  </Button>
                  <Button size="sm" variant="outline" data-testid="inbox-camp-decline" disabled={pending}
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => run(r.id, async () => { const res = await declineCampRequest(r.id); return res.ok ? { ok: true } : res })}>
                    <XCircle className="mr-1 h-4 w-4" /> {t('decline')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <CalendarDays className="h-4 w-4 text-primary-600" />
          {t('registrations')} ({visReg.length})
        </h2>
        {visReg.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-400 shadow-sm">{t('emptyQueue')}</p>
        ) : (
          <div className="space-y-2">
            {visReg.map((r) => {
              const d = discounts[r.id] ?? { pct: '', amt: '' }
              return (
                <div key={r.id} data-testid="inbox-reg-row" className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.studentName}</p>
                      <p className="text-xs text-gray-500">
                        {r.className}{r.feeUsd != null ? ` · $${r.feeUsd.toFixed(0)}/${t('mo')}` : ''} · {fmtDate(r.requestedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input data-testid="inbox-discount-pct" type="number" min="0" max="100" placeholder={t('discountPct')}
                        value={d.pct} onChange={(e) => setDiscounts((p) => ({ ...p, [r.id]: { ...d, pct: e.target.value } }))}
                        className="h-9 w-24 text-xs" />
                      <Input data-testid="inbox-discount-amt" type="number" min="0" placeholder={t('discountAmt')}
                        value={d.amt} onChange={(e) => setDiscounts((p) => ({ ...p, [r.id]: { ...d, amt: e.target.value } }))}
                        className="h-9 w-24 text-xs" />
                      <Button size="sm" data-testid="inbox-approve" disabled={pending}
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => run(r.id, () => approveRegistration({
                          regId: r.id, classId: r.classId,
                          discountPct: d.pct ? parseFloat(d.pct) : 0,
                          discountAmountUsd: d.amt ? parseFloat(d.amt) : 0,
                        }))}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> {t('approve')}
                      </Button>
                      <Button size="sm" variant="outline" data-testid="inbox-decline" disabled={pending}
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => run(r.id, () => rejectRegistration(r.id, r.classId))}>
                        <XCircle className="mr-1 h-4 w-4" /> {t('decline')}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── PT requests (22R) ── */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Dumbbell className="h-4 w-4 text-primary-600" />
          {t('ptRequests')} ({visPt.length})
        </h2>
        {visPt.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-400 shadow-sm">{t('emptyQueue')}</p>
        ) : (
          <div className="space-y-2">
            {visPt.map((r) => (
              <div key={r.id} data-testid="inbox-pt-row" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.studentName}</p>
                  <p className="text-xs text-gray-500">
                    {r.packageName} · {r.sessions} {t('sessions')}{r.priceUsd != null ? ` · $${r.priceUsd.toFixed(0)}` : ''} · {fmtDate(r.requestedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" data-testid="inbox-pt-approve" disabled={pending}
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => run(r.id, async () => { const res = await approvePtRequest(r.id); return res.ok ? { ok: true } : res })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> {t('approve')}
                  </Button>
                  <Button size="sm" variant="outline" data-testid="inbox-pt-decline" disabled={pending}
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => run(r.id, async () => { const res = await rejectPtRequest(r.id, ''); return res.ok ? { ok: true } : res })}>
                    <XCircle className="mr-1 h-4 w-4" /> {t('decline')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent waitlist auto-promotions (informational) ── */}
      <section>
        <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <ArrowUpCircle className="h-4 w-4 text-primary-600" />
          {t('promotions')}
        </h2>
        {promotions.length === 0 ? (
          <p className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-400 shadow-sm">{t('noPromotions')}</p>
        ) : (
          <div className="space-y-2">
            {promotions.map((p) => (
              <div key={p.id} data-testid="inbox-promotion-row" className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-700">{t('promotedLine', { student: p.studentName, class: p.className })}</p>
                <span className="text-xs text-gray-400">{fmtDate(p.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
