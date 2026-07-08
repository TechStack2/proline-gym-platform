'use client'

/**
 * PT booking modal (PT-2) — ONE component for all three surfaces:
 *   · member portal (instant-book + propose-a-time fallback)
 *   · Member-360 staff picker (+ availability OVERRIDE with the IA-3
 *     conflict warning — the desk has the last word)
 *   · diary picker (staff variant, assignment preselected by the caller)
 * Slots come from the shared engine via getPtSlots (gym timezone); a failed
 * book (race loser / stale list) re-fetches fresh slots after the clean error.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModalPortal } from './modal-portal'
import { toast } from '@/components/ui/use-toast'
import { CalendarPlus, X, Loader2, Send, AlertTriangle } from 'lucide-react'
import { bookPtSlot, getPtSlots, proposePtTime } from '@/lib/pt/booking-actions'
import type { SlotDay } from '@/lib/pt/slots'
import { checkPtScheduleConflicts } from '@/app/[locale]/coach/pt/actions'
import { useErrorText } from '@/lib/errors/use-error-text';

// `getPtSlots` re-exported type
export type { SlotDay } from '@/lib/pt/slots'

export function BookPtModal({ assignmentId, locale, staff = false, triggerTestid = 'pt-book-open', triggerLabel }: {
  assignmentId: string
  locale: string
  /** Staff variant: override toggle (+ conflict warning), no propose. */
  staff?: boolean
  triggerTestid?: string
  triggerLabel?: string
}) {
  const t = useTranslations('ptBooking')
  const errText = useErrorText();
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState<SlotDay[]>([])
  const [coachName, setCoachName] = useState<string | undefined>()
  // J3 PT-GUARDS (staff diagnostic): the assigned coach + whether they have zero
  // published availability, so an empty staff slot list explains WHY + deep-links.
  const [coachId, setCoachId] = useState<string | undefined>()
  const [noAvail, setNoAvail] = useState(false)
  const [propose, setPropose] = useState(false)
  const [proposeAt, setProposeAt] = useState('')
  const [override, setOverride] = useState(false)
  const [overrideAt, setOverrideAt] = useState('')
  const [warning, setWarning] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await getPtSlots(assignmentId, locale)
    setDays(res.slots)
    setCoachName(res.coachName)
    setCoachId(res.coachId)
    setNoAvail(!!res.noAvailability)
    setLoading(false)
  }

  const openModal = () => { setOpen(true); setPropose(false); setOverride(false); setWarning(''); void load() }

  const book = (iso: string, isOverride = false) =>
    startTransition(async () => {
      const res = await bookPtSlot({ assignmentId, scheduledAt: iso, override: isOverride })
      if (res.ok) {
        toast({ title: t('booked'), variant: 'success' })
        setOpen(false)
        router.refresh()
      } else {
        toast({ title: t('bookFailed'), description: errText(res.error), variant: 'destructive' })
        void load() // fresh slots for the race loser
      }
    })

  const submitPropose = () =>
    startTransition(async () => {
      if (!proposeAt) { toast({ title: t('pickTime'), variant: 'destructive' }); return }
      const res = await proposePtTime({ assignmentId, scheduledAt: new Date(proposeAt).toISOString() })
      if (res.ok) {
        toast({ title: t('proposed'), variant: 'success' })
        setOpen(false)
        router.refresh()
      } else {
        toast({ title: t('proposeFailed'), description: errText(res.error), variant: 'destructive' })
      }
    })

  const checkOverride = async (v: string) => {
    setOverrideAt(v)
    setWarning('')
    if (!v) return
    try {
      const res = await checkPtScheduleConflicts({ assignmentId, scheduledAt: new Date(v).toISOString() })
      if (res.ok && res.conflicts.length > 0) {
        setWarning(t('overrideConflict', { coach: res.coachName, time: res.conflicts[0].time }))
      }
    } catch { /* best-effort warning */ }
  }

  return (
    <>
      <Button size="sm" data-testid={triggerTestid} onClick={openModal}
        className={cn(staff ? 'h-7 border bg-white text-xs text-gray-700 hover:bg-gray-50' : 'bg-[#cd1419] hover:bg-[#a81014]')}
        variant={staff ? 'outline' : 'primary'}>
        <CalendarPlus className="me-1 h-3.5 w-3.5" /> {triggerLabel ?? t('book')}
      </Button>

      {open && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div data-testid="pt-book-modal" onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {t('title')}{coachName ? ` · ${coachName}` : ''}
              </h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-gray-400">{t('loading')}</p>
            ) : propose ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">{t('proposeHint')}</p>
                <input type="datetime-local" data-testid="pt-propose-at" value={proposeAt}
                  onChange={(e) => setProposeAt(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                <Button data-testid="pt-propose-submit" onClick={submitPropose} disabled={pending}
                  className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                  {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Send className="me-1 h-4 w-4" />} {t('sendProposal')}
                </Button>
                <button type="button" className="w-full text-center text-xs text-gray-500 hover:underline" onClick={() => setPropose(false)}>
                  {t('backToSlots')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {staff && (
                  <label className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
                    {t('overrideToggle')}
                    <input type="checkbox" data-testid="pt-override-toggle" checked={override}
                      onChange={(e) => { setOverride(e.target.checked); setWarning('') }} className="h-4 w-4 accent-[#cd1419]" />
                  </label>
                )}

                {override ? (
                  <div className="space-y-2">
                    <input type="datetime-local" data-testid="pt-override-at" value={overrideAt}
                      onChange={(e) => void checkOverride(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    {warning && (
                      <p data-testid="pt-override-warning" className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {warning}
                      </p>
                    )}
                    <Button data-testid="pt-override-book" disabled={pending || !overrideAt}
                      onClick={() => book(new Date(overrideAt).toISOString(), true)}
                      className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                      {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('bookOverride')}
                    </Button>
                  </div>
                ) : days.length === 0 ? (
                  staff && noAvail && coachId ? (
                    // J3 PT-GUARDS: staff diagnostic — say WHY (no published availability)
                    // + deep-link to this coach's Coach-360 availability panel. The
                    // member surface never sees this (its branch stays generic below).
                    <div data-testid="pt-no-availability" className="space-y-2 rounded-lg bg-amber-50 px-3 py-3 text-center">
                      <p className="flex items-center justify-center gap-1.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t('noAvailabilityStaff', { coach: coachName ?? t('theCoach') })}
                      </p>
                      <Link href={`/${locale}/coaches/${coachId}#panel-availability`} data-testid="pt-set-availability-link"
                        className="inline-flex items-center gap-1 rounded-full bg-[#cd1419] px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-[#a81014]">
                        <CalendarPlus className="h-3.5 w-3.5" /> {t('setAvailability')}
                      </Link>
                    </div>
                  ) : (
                    <p data-testid="pt-no-slots" className="py-4 text-center text-sm text-gray-400">{t('noSlots')}</p>
                  )
                ) : (
                  <div className="space-y-3">
                    {days.map((d) => (
                      <div key={d.date} data-testid="pt-slot-day" data-date={d.date}>
                        <p className="mb-1.5 text-xs font-semibold text-gray-600">{d.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {d.slots.map((s: { iso: string; label: string }) => (
                            <button key={s.iso} type="button" data-testid="pt-slot" data-when={s.iso} disabled={pending}
                              onClick={() => book(s.iso)}
                              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#cd1419] hover:text-[#cd1419] disabled:opacity-50"
                              dir="ltr">
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!staff && !override && (
                  <button type="button" data-testid="pt-propose-open" onClick={() => setPropose(true)}
                    className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700">
                    {t('noneFit')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}
