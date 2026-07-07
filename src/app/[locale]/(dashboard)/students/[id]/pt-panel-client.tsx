'use client'

/**
 * Member-360 PT panel (PT-1) — package-FIRST: PtPackageCards with sessions
 * nested under each card (the flat "recent sessions" list this replaces was
 * the operator's complaint), plus the two staff actions:
 *   · Sell package — type chips → coach chips (filtered by specialty when the
 *     type has a discipline) → optional %/fixed discount → sell_pt_package.
 *     `autoSellPackageId` (?sellpt=<typeId>, from the Inbox/Today one-tap
 *     re-sell) opens the modal pre-filled with that type.
 *   · Extend +30d on a frozen (expired) card — extend_pt_package, audited.
 * Package-less legacy sessions surface once in an "unlinked" staff notice.
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ModalPortal } from '@/components/shared/modal-portal'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/shared/avatar'
import { PtPackageCard, computePtStatus, type PtCardData } from '@/components/shared/pt-package-card'
import { Loader2, Plus, X, AlarmClock, AlertTriangle, CalendarPlus } from 'lucide-react'
import { sellPtPackage, extendPtPackage } from './actions'
import { BookPtModal } from '@/components/shared/book-pt-modal'

export type SellableType = {
  id: string; name_ar: string | null; name_en: string | null; name_fr: string | null
  session_count: number; price_usd: number; validity_days: number | null
  discipline_id: string | null; discipline_name_en?: string | null
}
export type SellableCoach = { id: string; name: string; avatarUrl: string | null; specializationEn: string | null }

export function MemberPtPanel({
  studentId, cards, types, coaches, unlinkedCount, locale, autoSellPackageId,
}: {
  studentId: string
  cards: PtCardData[]
  types: SellableType[]
  coaches: SellableCoach[]
  unlinkedCount: number
  locale: string
  autoSellPackageId?: string | null
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('ptPanel')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [coachId, setCoachId] = useState('')
  const [pct, setPct] = useState('')
  const [fixed, setFixed] = useState('')
  // J3 PT-GUARDS: warn-and-allow — the coach with no published availability the
  // desk is about to sell for (null = no warning). Selling is NEVER blocked.
  const [warnCoach, setWarnCoach] = useState<{ id: string; name: string } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (autoSellPackageId) { setTypeId(autoSellPackageId); setOpen(true) }
  }, [autoSellPackageId])

  const lname = (r: { name_ar?: string | null; name_en?: string | null; name_fr?: string | null }) =>
    ((isRTL ? r.name_ar : locale === 'fr' ? r.name_fr : r.name_en) || r.name_en || '')

  const selectedType = types.find((x) => x.id === typeId)
  // Specialty filter: denormalized coach specialization strings (ADM-1 design)
  // matched against the type's discipline name; fall back to ALL when no coach
  // matches so a sparse roster never blocks a sale.
  const matching = selectedType?.discipline_name_en
    ? coaches.filter((c) => (c.specializationEn || '').toLowerCase().includes(selectedType.discipline_name_en!.toLowerCase()))
    : coaches
  const pickableCoaches = matching.length > 0 ? matching : coaches

  // The actual sale — proceeds unconditionally (called directly when the coach has
  // availability, or via "Sell anyway" in the warn dialog).
  const doSell = () =>
    startTransition(async () => {
      const res = await sellPtPackage({
        studentId, packageId: typeId, coachId,
        discountPct: pct ? Number(pct) : 0,
        discountAmountUsd: fixed ? Number(fixed) : 0,
      })
      if (res.ok) {
        toast({ title: t('sold'), variant: 'success' })
        setOpen(false); setWarnCoach(null); setTypeId(''); setCoachId(''); setPct(''); setFixed('')
        router.refresh()
      } else {
        toast({ title: t('sellFailed'), description: res.error, variant: 'destructive' })
      }
    })

  // J3 PT-GUARDS: warn-and-allow. A light count query — if the chosen coach has
  // ZERO active availability windows, surface the warn dialog ("members can't book
  // until it's set") with Set-availability + Sell-anyway; otherwise sell straight
  // through. Selling is never blocked (owner's call).
  const sell = async () => {
    if (!typeId || !coachId) { toast({ title: t('errPickBoth'), variant: 'destructive' }); return }
    setChecking(true)
    const { count } = await createClient()
      .from('coach_availability')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .eq('is_active', true)
    setChecking(false)
    if ((count ?? 0) === 0) {
      const c = pickableCoaches.find((x) => x.id === coachId)
      setWarnCoach({ id: coachId, name: c?.name ?? '' })
      return
    }
    doSell()
  }

  const extend = (assignmentId: string) =>
    startTransition(async () => {
      const res = await extendPtPackage({ studentId, assignmentId, days: 30 })
      if (res.ok) { toast({ title: t('extended'), variant: 'success' }); router.refresh() }
      else toast({ title: t('extendFailed'), description: res.error, variant: 'destructive' })
    })

  const sessionStatus = (s: string) => t(`session.${s}` as any)
  const validityLabel = (d: PtCardData) => {
    if (!d.expiresAt) return null
    const days = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 864e5)
    return days >= 0 ? t('daysLeft', { days }) : t('expiredAgo', { days: Math.abs(days) })
  }

  return (
    <div className="space-y-2.5">
      {unlinkedCount > 0 && (
        <p data-testid="pt-unlinked-notice" className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t('unlinked', { count: unlinkedCount })}
        </p>
      )}

      {cards.length === 0 ? (
        <p className="py-3 text-center text-sm text-gray-400">{t('none')}</p>
      ) : (
        cards.map((d) => (
          <PtPackageCard
            key={d.id}
            data={d}
            locale={locale}
            testid="member-pt-row"
            sessionTestid="member-pt-session"
            labels={{
              remainingText: `${d.sessionsRemaining}/${d.sessionsTotal} ${t('remaining')}`,
              status: t(`cardStatus.${computePtStatus(d)}` as any),
              validity: validityLabel(d),
              sessionsTitle: t('sessions'),
              sessionStatus,
            }}
            actions={computePtStatus(d) === 'expired' ? (
              <div className="mt-2">
                <Button size="sm" variant="outline" data-testid="pt-extend-btn" disabled={pending}
                  onClick={() => extend(d.id)} className="h-7 border-red-200 text-xs text-red-700 hover:bg-red-50">
                  <AlarmClock className="me-1 h-3.5 w-3.5" /> {t('extend30')}
                </Button>
              </div>
            ) : computePtStatus(d) === 'active' && d.sessionsRemaining > 0 ? (
              <div className="mt-2">
                {/* PT-2: staff slot picker (override toggle inside — FD-1 rule) */}
                <BookPtModal assignmentId={d.id} locale={locale} staff triggerTestid="m360-pt-book" triggerLabel={t('bookSession')} />
              </div>
            ) : null}
          />
        ))
      )}

      {/* PT-2 docking slot: "Book session" lands beside Sell on each ACTIVE card
          (slot per journey-pt-360 §4 — availability picker, not built here). */}
      <Button size="sm" data-testid="pt-sell-open" onClick={() => setOpen(true)} className="bg-[#cd1419] hover:bg-[#a81014]">
        <Plus className="me-1 h-4 w-4" /> {t('sell')}
      </Button>

      {open && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div data-testid="pt-sell-modal" onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{t('sellTitle')}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {types.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">{t('noTypes')}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-600">{t('pickType')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map((x) => (
                      <button key={x.id} type="button" data-testid="pt-type-chip" data-id={x.id}
                        onClick={() => { setTypeId(x.id); setCoachId('') }}
                        className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                          typeId === x.id ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                        {lname(x)} · {x.session_count}× · ${Number(x.price_usd).toFixed(0)}
                        {x.validity_days ? ` · ${x.validity_days}d` : ''}
                      </button>
                    ))}
                  </div>
                </div>
                {typeId && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-600">{t('pickCoach')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pickableCoaches.map((c) => (
                        <button key={c.id} type="button" data-testid="pt-coach-chip" data-id={c.id}
                          onClick={() => setCoachId(c.id)}
                          className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                            coachId === c.id ? 'border-[#cd1419] bg-red-50 text-[#cd1419]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                          <Avatar url={c.avatarUrl} name={c.name} size="xs" /> {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{t('discountPct')}</label>
                    <Input type="number" min="0" max="100" data-testid="pt-sell-discount-pct" value={pct}
                      onChange={(e) => setPct(e.target.value)} placeholder="0" className="h-9" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">{t('discountFixed')}</label>
                    <Input type="number" min="0" data-testid="pt-sell-discount-fixed" value={fixed}
                      onChange={(e) => setFixed(e.target.value)} placeholder="0" className="h-9" />
                  </div>
                </div>
                <Button data-testid="pt-sell-submit" onClick={() => void sell()} disabled={pending || checking || !typeId || !coachId}
                  className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                  {pending || checking ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('sellConfirm')}
                </Button>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}

      {/* J3 PT-GUARDS: warn-and-allow dialog — coach has no published availability.
          Modern, plain-language: two clear actions (set it now / sell anyway). */}
      {warnCoach && (
        <ModalPortal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setWarnCoach(null)}>
          <div data-testid="pt-sell-warn-modal" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className={cn('mb-2 flex items-center gap-2', isRTL && 'flex-row-reverse text-right')}>
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{t('warnNoAvailTitle')}</h3>
            </div>
            <p className={cn('mb-4 text-sm text-gray-600', isRTL && 'font-arabic text-right')}>
              {t('warnNoAvailBody', { coach: warnCoach.name })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href={`/${locale}/coaches/${warnCoach.id}#panel-availability`} data-testid="pt-sell-set-availability"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <CalendarPlus className="h-4 w-4" /> {t('warnSetAvailability')}
              </Link>
              <Button data-testid="pt-sell-anyway" onClick={doSell} disabled={pending}
                className="flex-1 bg-[#cd1419] hover:bg-[#a81014]">
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('warnSellAnyway')}
              </Button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
