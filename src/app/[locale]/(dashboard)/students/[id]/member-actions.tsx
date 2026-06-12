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
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'
import { DollarSign, CalendarDays, Dumbbell, X, Loader2, Users, Tent, AlertTriangle } from 'lucide-react'
import { recordPayment } from '../../invoices/actions'
import { registerMemberToClass } from './actions'
import { registerToCamp } from '../../camps/actions'

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

function Modal({ title, onClose, testid, children }: {
  title: string; onClose: () => void; testid: string; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div data-testid={testid} onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MemberActions({
  studentId, memberName, classes, openInvoices, camps = [], memberAge = null, locale, autoPay,
}: {
  studentId: string
  memberName: string
  classes: PickableClass[]
  openInvoices: OpenInvoice[]
  camps?: PickableCamp[]
  memberAge?: number | null
  locale: string
  autoPay?: boolean
}) {
  const isRTL = locale === 'ar'
  const t = useTranslations('member360.actions')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [regOpen, setRegOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [campOpen, setCampOpen] = useState(false)
  const [campId, setCampId] = useState('')
  useEffect(() => { if (autoPay) setPayOpen(true) }, [autoPay])

  // ── Register-to-class state ──
  const [classId, setClassId] = useState('')
  const [discount, setDiscount] = useState('')
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
      })
      if (res.ok) {
        toast({ title: t(res.status === 'waitlisted' ? 'registeredWaitlisted' : 'registered'), variant: 'success' })
        setRegOpen(false); setClassId(''); setDiscount('')
        router.refresh()
      } else {
        toast({ title: t('registerFailed'), description: res.error, variant: 'destructive' })
      }
    })
  }

  const submitPayment = () => {
    const usd = parseFloat(amountUsd)
    if (!selected || !Number.isFinite(usd) || usd <= 0) {
      toast({ title: t('enterAmount'), variant: 'destructive' }); return
    }
    startTransition(async () => {
      const res = await recordPayment({
        invoiceId: selected.id, amountUsd: usd, method,
        reference: reference.trim() || null, exchangeRate: selected.exchange_rate,
      })
      if (res.ok) {
        toast({ title: t('paymentRecorded'), variant: 'success' })
        setPayOpen(false); setReference('')
        router.refresh()
      } else {
        toast({ title: t('paymentFailed'), description: res.error, variant: 'destructive' })
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
        toast({ title: t('campFailed'), description: res.error, variant: 'destructive' })
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="member-quick-actions">
      <button type="button" data-testid="m360-pay-open" onClick={() => setPayOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#cd1419] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a81014]">
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
            <p className="py-3 text-center text-sm text-gray-400">{t('noClasses')}</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-60 space-y-1.5 overflow-y-auto">
                {classes.map((c) => (
                  <button key={c.id} type="button" data-testid="m360-class-option" data-id={c.id}
                    onClick={() => setClassId(c.id)}
                    className={cn('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm',
                      classId === c.id ? 'border-[#cd1419] bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                    <span className="font-medium text-gray-900">{lname(c)}</span>
                    <span className="text-xs text-gray-500">
                      {c.monthly_fee_usd != null ? `$${Number(c.monthly_fee_usd).toFixed(0)}/${t('mo')}` : '—'}
                      {c.max_capacity != null && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{c.max_capacity}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('discountPct')}</label>
                <Input type="number" min="0" max="100" data-testid="m360-discount" value={discount}
                  onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-9 w-28" />
              </div>
              <Button data-testid="m360-register-submit" onClick={submitRegister} disabled={pending || !classId}
                className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} {t('registerConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {campOpen && (
        <Modal title={t('campTitle', { name: memberName })} onClose={() => setCampOpen(false)} testid="m360-camp-modal">
          {camps.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-400">{t('noCamps')}</p>
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
                        campId === c.id ? 'border-[#cd1419] bg-red-50' : 'border-gray-200 hover:border-gray-300')}>
                      <span className="min-w-0 truncate text-left font-medium text-gray-900">{cname}</span>
                      <span className="shrink-0 text-xs text-gray-500" dir="ltr">
                        ${Number(c.price_usd).toFixed(0)}
                        {full
                          ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{t('campFull')}</span>
                          : <span className="ml-1.5">{t('spotsLeft', { count: c.spots })}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
              {ageWarning && (
                <p data-testid="m360-camp-age-warning" className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t('ageWarning', { min: selectedCamp?.min_age ?? '—', max: selectedCamp?.max_age ?? '—' })}
                </p>
              )}
              <Button data-testid="m360-camp-submit" onClick={submitCamp} disabled={pending || !campId}
                className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} {t('campConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {payOpen && (
        <Modal title={t('payTitle', { name: memberName })} onClose={() => setPayOpen(false)} testid="m360-pay-modal">
          {openInvoices.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-400" data-testid="m360-no-open-invoices">{t('noOpenInvoices')}</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('invoice')}</label>
                <select data-testid="m360-pay-invoice" value={selected?.id ?? ''} onChange={(e) => pickInvoice(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {openInvoices.map((i) => (
                    <option key={i.id} value={i.id}>{i.invoice_number} — ${i.balance_usd.toFixed(2)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('amountUsd')}</label>
                  <Input type="number" step="0.01" min="0" data-testid="m360-pay-amount" value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('method')}</label>
                  <select data-testid="m360-pay-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t('reference')}</label>
                <Input data-testid="m360-pay-reference" value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder={t('optional')} className="h-9" />
              </div>
              <Button data-testid="m360-pay-submit" onClick={submitPayment} disabled={pending}
                className="w-full bg-[#cd1419] hover:bg-[#a81014]">
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} {t('payConfirm')}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
