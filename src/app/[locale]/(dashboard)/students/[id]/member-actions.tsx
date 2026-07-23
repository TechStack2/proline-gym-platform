'use client'

/**
 * Member-360 quick-action pills (FD-1). Design rule: NO action on a member's
 * file navigates to a global page — every pill opens a modal pre-filled with
 * THIS member, delegating to existing verified flows:
 *   · Register to class → registerMemberToClass (B2 request+approve composed)
 *   · Record payment    → recordPayment (D1), member's open invoices pre-selected
 *   · PT                → anchors to the file's own PT panel (#panel-pt);
 *                         sell (PT-1) / book (PT-2) dock there.
 * `autoPay` (from /students/[id]?pay=1) opens the payment modal on mount — the
 * members-list row action lands here with the modal already open.
 */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { DollarSign, CalendarDays, Dumbbell, Loader2, Users, Tent, AlertTriangle } from 'lucide-react'
import { recordPayment } from '../../invoices/actions'
import { registerMemberToClass } from './actions'
import { registerToCamp } from '../../camps/actions'
import { useErrorText } from '@/lib/errors/use-error-text';
import { fmtUsd } from '@/lib/billing/currency'
import { Ltr } from '@/components/ui/bdi'
import { EmptyState } from '@/components/ui/empty-state'

export type PickableClass = {
  id: string; name_ar: string | null; name_en: string | null; name_fr: string | null
  monthly_fee_usd: number | null; max_capacity: number | null
}
export type OpenInvoice = {
  id: string; invoice_number: string; balance_usd: number; exchange_rate: number | null
}
export type PickableCamp = {
  id: string; name_ar: string | null; name_en: string | null; name_fr: string | null
  start_date: string; end_date: string; price_usd: number
  min_age: number | null; max_age: number | null; status: string; spots: number
}

const METHODS = ['cash_usd', 'cash_lbp', 'omt', 'whish', 'bank_transfer', 'bob_finance'] as const
type Method = (typeof METHODS)[number]

// DA-30 (W4): the local ModalPortal wrapper becomes the §2.5 Dialog primitive —
// same title+close shape, plus the focus trap/Esc/aria the hand-rolled version
// never had. Container testids unchanged in role.
function Modal({ title, onClose, testid, children }: {
  title: string; onClose: () => void; testid: string; children: React.ReactNode
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }} title={title}
      variant="responsive" data-testid={testid} className="max-w-md">
      {children}
    </Dialog>
  )
}

export function MemberActions({
  studentId, memberName, classes, openInvoices, camps = [], memberAge = null, locale, autoPay, autoPayInvoiceId = null, autoRegister,
}: {
  studentId: string
  memberName: string
  classes: PickableClass[]
  openInvoices: OpenInvoice[]
  camps?: PickableCamp[]
  memberAge?: number | null
  locale: string
  autoPay?: boolean
  /**
   * MEMBER-360-ACTIONABLE §2.1: `?pay=<invoiceId>` opens the modal with THAT
   * invoice pre-selected (amount pre-filled) — the drill from a queue row,
   * aging-ledger row, or lifecycle next-bill fact lands ready to confirm.
   */
  autoPayInvoiceId?: string | null
  // GUARDIAN-360: `/students/[id]?register=1` opens the register modal on mount —
  // the per-child "Register" deep-link from the guardian page (mirrors autoPay).
  autoRegister?: boolean
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('member360.actions')
  const errText = useErrorText();
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [regOpen, setRegOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [campOpen, setCampOpen] = useState(false)
  const [campId, setCampId] = useState('')
  useEffect(() => {
    if (!autoPay) return
    // §2.1 pre-fill: a specific invoice in the URL wins over the oldest default.
    if (autoPayInvoiceId && openInvoices.some((i) => i.id === autoPayInvoiceId)) pickInvoice(autoPayInvoiceId)
    setPayOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPay, autoPayInvoiceId])
  useEffect(() => { if (autoRegister) setRegOpen(true) }, [autoRegister])

  // ── Register-to-class state ──
  const [classId, setClassId] = useState('')
  const [discount, setDiscount] = useState('')
  // BILL-CYCLES: staff-chosen start date (today/future/past) + prorate-first-cycle.
  const [regStart, setRegStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [regProrate, setRegProrate] = useState(false)
  // ── Record-payment state (the member's open invoices, oldest first, pre-selected) ──
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.id ?? '')
  const selected = openInvoices.find((i) => i.id === invoiceId) ?? openInvoices[0]
  const [amountUsd, setAmountUsd] = useState(selected ? selected.balance_usd.toFixed(2) : '')
  const [method, setMethod] = useState<Method>('cash_usd')
  const [reference, setReference] = useState('')

  const lname = (c: PickableClass) =>
    ((isRTL ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en || '')

  const pickInvoice = (id: string) => {
    setInvoiceId(id)
    const inv = openInvoices.find((i) => i.id === id)
    if (inv) setAmountUsd(inv.balance_usd.toFixed(2))
  }

  const submitRegister = () => {
    if (!classId) { toast({ title: t('pickClass'), variant: 'destructive' }); return }
    startTransition(async () => {
      const res = await registerMemberToClass({
        studentId, classId, discountPct: discount ? Number(discount) : 0,
        startDate: regStart, prorate: regProrate,
      })
      if (res.ok) {
        toast({ title: t(res.status === 'waitlisted' ? 'registeredWaitlisted' : 'registered'), variant: 'success' })
        setRegOpen(false); setClassId(''); setDiscount(''); setRegProrate(false)
        router.refresh()
      } else {
        toast({ title: t('registerFailed'), description: errText(res.error), variant: 'destructive' })
      }
    })
  }

  const submitPayment = () => {
    const usd = parseFloat(amountUsd)
    if (!selected || !Number.isFinite(usd) || usd <= 0) {
      toast({ title: t('enterAmount'), variant: 'destructive' }); return
    }
    // PERF-2: OPTIMISTIC — dismiss the modal INSTANTLY (the balance itself always
    // reconciles from the server refresh, never a fabricated figure). On failure we
    // reopen the modal (form state is preserved) + a destructive toast so the desk
    // can retry — no payment is ever shown as recorded when it wasn't.
    setPayOpen(false)
    startTransition(async () => {
      const res = await recordPayment({
        invoiceId: selected.id, amountUsd: usd, method,
        reference: reference.trim() || null, exchangeRate: selected.exchange_rate,
      })
      if (res.ok) {
        toast({ title: t('paymentRecorded'), variant: 'success' })
        setReference('')
        router.refresh()
      } else {
        setPayOpen(true) // ROLLBACK: reopen so the desk can retry
        toast({ title: t('paymentFailed'), description: errText(res.error), variant: 'destructive' })
      }
    })
  }

  const selectedCamp = camps.find((c) => c.id === campId)
  // E1: age range is a CLIENT-SIDE warning only — the desk can override.
  const ageWarning = !!(selectedCamp && memberAge != null &&
    ((selectedCamp.min_age != null && memberAge < selectedCamp.min_age) ||
     (selectedCamp.max_age != null && memberAge > selectedCamp.max_age)))

  const submitCamp = () => {
    if (!campId) { toast({ title: t('pickCamp'), variant: 'destructive' }); return }
    startTransition(async () => {
      const res = await registerToCamp({ studentId, campId })
      if (res.ok) {
        toast({ title: t('campRegistered'), variant: 'success' })
        setCampOpen(false); setCampId('')
        router.refresh()
      } else {
        toast({ title: t('campFailed'), description: errText(res.error), variant: 'destructive' })
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="member-quick-actions">
      <button type="button" data-testid="m360-pay-open" onClick={() => setPayOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-primary-700 px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-800">
        <DollarSign className="h-3.5 w-3.5" /> {t('recordPayment')}
      </button>
      <button type="button" data-testid="m360-register-open" onClick={() => setRegOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <CalendarDays className="h-3.5 w-3.5" /> {t('newRegistration')}
      </button>
      <button type="button" data-testid="m360-camp-open" onClick={() => setCampOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <Tent className="h-3.5 w-3.5" /> {t('registerCamp')}
      </button>
      <a href="#panel-pt" data-testid="m360-pt-anchor"
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <Dumbbell className="h-3.5 w-3.5" /> {t('ptPanel')}
      </a>

      {regOpen && (
        <Modal title={t('registerTitle', { name: memberName })} onClose={() => setRegOpen(false)} testid="m360-register-modal">
          {classes.length === 0 ? (
            <EmptyState variant="bare" className="py-3" title={t('noClasses')} />
          ) : (
            <div className="space-y-3">
              <div className="max-h-60 space-y-1.5 overflow-y-auto">
                {classes.map((c) => (
                  <button key={c.id} type="button" data-testid="m360-class-option" data-id={c.id}
                    onClick={() => setClassId(c.id)}
                    className={cn('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm',
                      classId === c.id ? 'border-primary-700 bg-primary-50' : 'border-gray-200 hover:border-gray-300')}>
                    <span className="font-medium text-gray-900">{lname(c)}</span>
                    <span className="text-xs text-gray-500">
                      {c.monthly_fee_usd != null ? <><Ltr>{`$${Number(c.monthly_fee_usd).toFixed(0)}`}</Ltr>/{t('mo')}</> : '—'}
                      {c.max_capacity != null && (
                        <span className="ms-1.5 inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{c.max_capacity}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {/* BILL-GUARDS R3: registration honesty — a free class says so; silence
                  is impossible (the fee preview is shown per class option above). */}
              {classId && classes.find((c) => c.id === classId)?.monthly_fee_usd === 0 && (
                <p data-testid="m360-free-notice" className="tint-success rounded-lg px-3 py-2 text-xs font-medium">{t('freeNoInvoice')}</p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('discountPct')}</label>
                  <Input type="number" min="0" max="100" data-testid="m360-discount" value={discount}
                    onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-9 w-28" />
                </div>
                {/* BILL-CYCLES: staff-chosen start date + prorate-first-cycle. */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {isRTL ? 'تاريخ البدء' : locale === 'fr' ? 'Date de début' : 'Start date'}
                  </label>
                  <Input type="date" data-testid="m360-start-date" value={regStart}
                    onChange={(e) => setRegStart(e.target.value)} className="h-9 w-40" />
                </div>
                <label className="flex items-center gap-1.5 pb-2 text-xs font-medium text-gray-600">
                  <input type="checkbox" data-testid="m360-prorate" checked={regProrate}
                    onChange={(e) => setRegProrate(e.target.checked)} />
                  {isRTL ? 'احتساب بالتناسب' : locale === 'fr' ? 'Proratiser' : 'Prorate 1st cycle'}
                </label>
              </div>
              <Button data-testid="m360-register-submit" onClick={submitRegister} disabled={pending || !classId}
                className="w-full bg-primary-700 hover:bg-primary-800">
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('registerConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {campOpen && (
        <Modal title={t('campTitle', { name: memberName })} onClose={() => setCampOpen(false)} testid="m360-camp-modal">
          {camps.length === 0 ? (
            <EmptyState variant="bare" className="py-3" title={t('noCamps')} />
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {camps.map((c) => {
                  const cname = ((locale === 'ar' ? c.name_ar : locale === 'fr' ? c.name_fr : c.name_en) || c.name_en || '')
                  const full = c.status === 'full' || c.spots <= 0
                  return (
                    <button key={c.id} type="button" data-testid="m360-camp-option" data-id={c.id} data-full={full}
                      onClick={() => setCampId(c.id)}
                      className={cn('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm',
                        campId === c.id ? 'border-primary-700 bg-primary-50' : 'border-gray-200 hover:border-gray-300')}>
                      <span className="min-w-0 truncate text-start font-medium text-gray-900">{cname}</span>
                      <span className="shrink-0 text-xs text-gray-500" dir="ltr">
                        ${Number(c.price_usd).toFixed(0)}
                        {full
                          ? <span className="tint-warning ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{t('campFull')}</span>
                          : <span className="ms-1.5">{t('spotsLeft', { count: c.spots })}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
              {ageWarning && (
                <p data-testid="m360-camp-age-warning" className="tint-warning flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t('ageWarning', { min: selectedCamp?.min_age ?? '—', max: selectedCamp?.max_age ?? '—' })}
                </p>
              )}
              <Button data-testid="m360-camp-submit" onClick={submitCamp} disabled={pending || !campId}
                className="w-full bg-primary-700 hover:bg-primary-800">
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('campConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {payOpen && (
        <Modal title={t('payTitle', { name: memberName })} onClose={() => setPayOpen(false)} testid="m360-pay-modal">
          {openInvoices.length === 0 ? (
            <EmptyState variant="bare" className="py-3" data-testid="m360-no-open-invoices" title={t('noOpenInvoices')} />
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('invoice')}</label>
                <Select data-testid="m360-pay-invoice" value={selected?.id ?? ''} onChange={(e) => pickInvoice(e.target.value)}
                  className="h-9">
                  {openInvoices.map((i) => (
                    /* DA-34: same "$X.XX" text, via the one money formatter. */
                    <option key={i.id} value={i.id}>{i.invoice_number} — {fmtUsd(i.balance_usd)}</option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('amountUsd')}</label>
                  <Input type="number" step="0.01" min="0" data-testid="m360-pay-amount" value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('method')}</label>
                  <Select data-testid="m360-pay-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}
                    className="h-9">
                    {METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('reference')}</label>
                <Input data-testid="m360-pay-reference" value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder={t('optional')} className="h-9" />
              </div>
              <Button data-testid="m360-pay-submit" onClick={submitPayment} disabled={pending}
                className="w-full bg-primary-700 hover:bg-primary-800">
                {pending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null} {t('payConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
