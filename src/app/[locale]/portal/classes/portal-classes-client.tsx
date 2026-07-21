'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Calendar, Clock, Loader2, RefreshCw, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime, fmtWeekday } from '@/lib/fmt'
import { fmtUsd } from '@/lib/billing/currency'
import { Ltr } from '@/components/ui/bdi'
import { StatusChip } from '@/components/ui/status-chip'
import { requestClassRegistration, cancelMyRegistration } from './actions'
import { useErrorText } from '@/lib/errors/use-error-text';

type Reg = { id: string; status: string; waitlist_position: number | null; end_date: string | null }
type ClassItem = {
  id: string; name: string; coachName: string
  monthly_fee_usd: number | null; monthly_fee_lbp: number | null
  schedules: { day_of_week: number; start_time: string; end_time: string }[]
  registration: Reg | null
}

export function PortalClassesClient({ classes, locale, hasStudent, kidId }: { classes: ClassItem[]; locale: string; hasStudent: boolean; kidId?: string }) {
  const isRTL = locale === 'ar'
  const t = useTranslations('portalClasses')
  // CYCLE-VIZ: recurring-monthly framing, computed from the registration's
  // end_date (000034: end_date = start_date + 1 month). No backend change.
  // W3a §2.7: the hardcoded tri-lingual word maps became i18n keys (the DA-36
  // class — the missing-key gate can now see them); dates/days via fmt.
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function statusLabel(r: Reg): string {
    if (r.status === 'active') return t('statusActive')
    if (r.status === 'requested') return t('statusRequested')
    if (r.status === 'waitlisted') return t('statusWaitlist', { n: r.waitlist_position ?? '' })
    return r.status
  }

  function request(classId: string) {
    setError(''); setBusyId(classId)
    startTransition(async () => {
      const res = await requestClassRegistration(classId, kidId)
      setBusyId(null)
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }
  function cancel(regId: string, classId: string) {
    if (!window.confirm(t('confirmCancel'))) return
    setError(''); setBusyId(classId)
    startTransition(async () => {
      const res = await cancelMyRegistration(regId)
      setBusyId(null)
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }

  if (classes.length === 0) {
    // Guided empty state: lead with the next step (browse the timetable).
    return (
      <div data-testid="portal-classes-empty" className={cn('rounded-2xl bg-white p-8 text-center shadow-sm', isRTL && 'font-arabic')}>
        <CalendarDays className="mx-auto h-10 w-10 text-primary-300" aria-hidden />
        <p className="mt-3 text-sm font-medium text-gray-700">{t('emptyTitle')}</p>
        <Link href={`/${locale}/portal/classes?view=schedule`} data-testid="portal-classes-empty-cta"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-800">
          <Calendar className="h-4 w-4" aria-hidden /> {t('emptyCta')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <div data-testid="portal-class-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {classes.map((c) => {
        const reg = c.registration
        const busy = busyId === c.id && pending
        return (
          <div key={c.id} data-testid="portal-class-card" data-class-id={c.id}
            className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{c.name}</p>
                {c.coachName && <p className="text-xs text-gray-500">{c.coachName}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {c.schedules.slice(0, 3).map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{fmtWeekday(s.day_of_week, locale)}
                      <Clock className="h-3 w-3" /><Ltr>{fmtTime(s.start_time, locale)}</Ltr>
                    </span>
                  ))}
                </div>
                {/* CYCLE-VIZ: the recurring monthly cycle — "Monthly · renews {date}"
                    when registered (from end_date), "Monthly" in the catalog. */}
                <span data-testid="class-cycle" data-renews={reg?.end_date ?? undefined}
                  className="tint-brand mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  {reg?.end_date
                    ? <>{t('monthly')} · {t('renewsOn')} <Ltr>{fmtDate(reg.end_date, locale)}</Ltr></>
                    : t('monthly')}
                </span>
              </div>
              <div className="text-end">
                {c.monthly_fee_usd != null && (
                  /* DA-52: ONE price lockup — "$35.00 /mo", the $ glyph part of
                     the amount (the floating DollarSign icon dies). */
                  <p className="text-sm font-bold text-gray-900">
                    <Ltr>{fmtUsd(c.monthly_fee_usd)}</Ltr>
                    <span className="text-xs font-normal text-gray-400"> /{t('perMonth')}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              {reg ? (
                <>
                  <StatusChip domain="registration" status={reg.status} label={statusLabel(reg)}
                    data-testid="reg-status" className="font-semibold" />
                  <button data-testid="cancel-reg-btn" disabled={busy} onClick={() => cancel(reg.id, c.id)}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('cancelReg')}
                  </button>
                </>
              ) : (
                <button data-testid="request-btn" disabled={busy || !hasStudent} onClick={() => request(c.id)}
                  className="rounded-md bg-primary-700 px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-800 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('request')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
