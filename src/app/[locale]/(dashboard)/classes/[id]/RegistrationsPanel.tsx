'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { approveRegistration, rejectRegistration, cancelRegistration, registerWalkIn, setRegistrationAnchor } from './registration-actions'
import { useErrorText } from '@/lib/errors/use-error-text'
import { computeProration, defaultBillingAnchor } from '@/lib/billing/proration'
import { fmtUsd, fmtLbp } from '@/lib/billing/currency'

type Reg = {
  id: string; status: string; waitlist_position: number | null
  monthly_fee_usd: number | null; invoice_id: string | null; studentName: string
  start_date?: string | null; billing_anchor?: string | null; paid_until?: string | null
  end_date?: string | null; first_cycle_prorated?: boolean | null
}

type ApprovePayload = { regId: string; discountPct: number; startDate: string; billingAnchor: string; prorate: boolean }
type Tr = (en: string, ar: string, fr: string) => string

/**
 * Staff registrations panel (B2 · T2/T4 + BILL-CYCLES). Approve now collects the
 * billing cycle: a start date (today/future/past), an auto-derived-but-editable
 * billing anchor (first scheduled session ≥ start), and an optional prorate-first-
 * cycle toggle with a live dual-currency preview (the pure src/lib/billing/proration
 * twin of the SQL charge). Active rows show the current cycle and let owner/reception
 * move the billing date forward. The atomic capacity/waitlist logic lives in the RPCs.
 */
export function RegistrationsPanel({
  classId, registrations, students, locale, monthlyFeeUsd = null, scheduleDays = [], rate = null, today,
}: {
  classId: string
  registrations: Reg[]
  students: { id: string; name: string }[]
  locale: string
  monthlyFeeUsd?: number | null
  scheduleDays?: number[]
  rate?: number | null
  today?: string
}) {
  const t: Tr = (en, ar, fr) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const ref = today ?? new Date().toISOString().slice(0, 10)
  const router = useRouter()
  const errText = useErrorText()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [walkInStudent, setWalkInStudent] = useState('')

  const requested = registrations.filter((r) => r.status === 'requested')
  const active = registrations.filter((r) => r.status === 'active')
  const waitlisted = registrations.filter((r) => r.status === 'waitlisted')
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0))

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setError(errText(res.error)); return }
      router.refresh()
    })
  }

  return (
    <Card data-testid="registrations-panel">
      <CardHeader><CardTitle>{t('Registrations', 'التسجيلات', 'Inscriptions')}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {error && <div data-testid="reg-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Walk-in register */}
        <div className="flex flex-wrap items-end gap-2 border-b pb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-muted-foreground">{t('Register a member (walk-in)', 'تسجيل عضو (مباشر)', 'Inscrire un membre (sur place)')}</label>
            <select data-testid="walkin-student" value={walkInStudent} onChange={(e) => setWalkInStudent(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('Select a member…', 'اختر عضواً…', 'Sélectionner un membre…')}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button data-testid="walkin-register-btn" disabled={pending || !walkInStudent}
            onClick={() => run(() => registerWalkIn(classId, walkInStudent))}>
            {t('Register', 'تسجيل', 'Inscrire')}
          </Button>
        </div>

        {/* Pending requests */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Pending requests', 'طلبات معلّقة', 'Demandes en attente')} ({requested.length})</h3>
          {requested.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No pending requests.', 'لا طلبات معلّقة.', 'Aucune demande en attente.')}</p>
          ) : (
            <div className="space-y-2">
              {requested.map((r) => (
                <PendingRegRow key={r.id} r={r} t={t} locale={locale} ref_={ref}
                  monthlyFeeUsd={r.monthly_fee_usd ?? monthlyFeeUsd} scheduleDays={scheduleDays} rate={rate} pending={pending}
                  onApprove={(p) => run(() => approveRegistration({ regId: p.regId, classId, discountPct: p.discountPct, startDate: p.startDate, billingAnchor: p.billingAnchor, prorate: p.prorate }))}
                  onReject={() => run(() => rejectRegistration(r.id, classId, undefined))} />
              ))}
            </div>
          )}
        </div>

        {/* Active */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Active', 'النشطون', 'Actifs')} ({active.length})</h3>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No active registrations.', 'لا تسجيلات نشطة.', 'Aucune inscription active.')}</p>
          ) : (
            <div className="space-y-2" data-testid="active-list">
              {active.map((r) => (
                <ActiveRegRow key={r.id} r={r} t={t} locale={locale} ref_={ref} pending={pending}
                  onCancel={() => run(() => cancelRegistration(r.id, classId))}
                  onSetAnchor={(anchor) => run(() => setRegistrationAnchor({ regId: r.id, newAnchor: anchor, classId }))} />
              ))}
            </div>
          )}
        </div>

        {/* Waitlist */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Waitlist', 'قائمة الانتظار', "Liste d'attente")} ({waitlisted.length})</h3>
          {waitlisted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Waitlist is empty.', 'قائمة الانتظار فارغة.', "La liste d'attente est vide.")}</p>
          ) : (
            <div className="space-y-2" data-testid="waitlist">
              {waitlisted.map((r) => (
                <div key={r.id} data-testid="reg-row" data-status="waitlisted" data-reg-id={r.id} data-position={r.waitlist_position ?? ''}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium" data-testid="reg-student">#{r.waitlist_position} · {r.studentName}</span>
                  <Button size="sm" variant="outline" data-testid="cancel-reg-btn" disabled={pending}
                    onClick={() => run(() => cancelRegistration(r.id, classId))}>{t('Cancel', 'إلغاء', 'Annuler')}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const l = locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'
  return new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString(l, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** One pending request: fee + discount + BILL-CYCLES start/anchor/prorate + live preview. */
function PendingRegRow({
  r, t, locale, ref_, monthlyFeeUsd, scheduleDays, rate, pending, onApprove, onReject,
}: {
  r: Reg; t: Tr; locale: string; ref_: string
  monthlyFeeUsd: number | null; scheduleDays: number[]; rate: number | null; pending: boolean
  onApprove: (p: ApprovePayload) => void; onReject: () => void
}) {
  const fee = monthlyFeeUsd ?? 0
  const isFree = fee === 0
  const [discount, setDiscount] = useState('')
  const [startDate, setStartDate] = useState(ref_)
  const [anchor, setAnchor] = useState(() => defaultBillingAnchor(scheduleDays, ref_))
  const [anchorEdited, setAnchorEdited] = useState(false)
  const [prorate, setProrate] = useState(false)

  // Auto-derive the anchor from the start date until staff pin it by hand.
  useEffect(() => {
    if (!anchorEdited) setAnchor(defaultBillingAnchor(scheduleDays, startDate))
  }, [startDate, anchorEdited, scheduleDays])

  const discPct = discount ? parseFloat(discount) : 0
  const net = Math.max(0, fee * (1 - (isFinite(discPct) ? discPct : 0) / 100))
  const preview = useMemo(() => computeProration({
    monthlyFeeUsd: net, scheduleDays, startDate, billingAnchor: anchor, today: ref_, rate, prorate,
  }), [net, scheduleDays, startDate, anchor, ref_, rate, prorate])

  const showLbp = !!rate && preview.firstInvoiceLbp > 0

  return (
    <div data-testid="reg-row" data-status="requested" data-reg-id={r.id}
      className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium" data-testid="reg-student">{r.studentName}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" data-testid="reg-fee">
            {isFree
              ? <span className="text-green-700">{t('Free — no invoice', 'مجاناً — لا فاتورة', 'Gratuit — sans facture')}</span>
              : <span className="text-gray-500">{monthlyFeeUsd != null ? `$${Number(fee).toFixed(0)}` : '—'}</span>}
          </span>
          <Input type="number" min="0" max="100" placeholder={t('disc %', 'خصم %', 'remise %')} data-testid="discount-pct"
            className="h-8 w-20 text-xs" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Button size="sm" data-testid="approve-btn" disabled={pending}
            onClick={() => onApprove({ regId: r.id, discountPct: isFinite(discPct) ? discPct : 0, startDate, billingAnchor: anchor, prorate })}
            className="bg-primary-700 hover:bg-primary-800">{t('Approve', 'موافقة', 'Approuver')}</Button>
          <Button size="sm" variant="outline" data-testid="reject-btn" disabled={pending}
            onClick={onReject}>{t('Reject', 'رفض', 'Refuser')}</Button>
        </div>
      </div>

      {/* BILL-CYCLES: staff-controlled cycle + live preview (hidden for a free class). */}
      {!isFree && (
        <div className="flex flex-wrap items-end gap-3 border-t pt-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-0.5 block">{t('Start date', 'تاريخ البدء', 'Date de début')}</span>
            <input type="date" data-testid="reg-start-date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="mb-0.5 block">{t('Billing anchor', 'مرجع الفوترة', 'Ancrage facturation')}</span>
            <input type="date" data-testid="reg-anchor" value={anchor}
              onChange={(e) => { setAnchor(e.target.value); setAnchorEdited(true) }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" data-testid="reg-prorate" checked={prorate} onChange={(e) => setProrate(e.target.checked)} />
            {t('Prorate first cycle', 'احتساب الدورة الأولى بالتناسب', 'Proratiser le 1er cycle')}
          </label>
          <div data-testid="reg-proration-preview" className="text-xs">
            {!preview.billsNow ? (
              <span className="text-blue-700">
                {t('Starts', 'يبدأ', 'Débute')} {fmtDate(startDate, locale)} · {t('first bill', 'أول فاتورة', 'première facture')} {fmtDate(preview.cycleStart, locale)}: {fmtUsd(preview.firstInvoiceUsd)}{showLbp ? ` · ${fmtLbp(preview.firstInvoiceLbp)}` : ''}
              </span>
            ) : preview.prorated ? (
              <span className="text-amber-700">
                {t('First invoice', 'الفاتورة الأولى', 'Première facture')} ({preview.sessionsRemaining}/{preview.sessionsInCycle} {t('sessions', 'حصص', 'séances')}): <b>{fmtUsd(preview.firstInvoiceUsd)}</b>{showLbp ? ` · ${fmtLbp(preview.firstInvoiceLbp)}` : ''} · {t('then', 'ثم', 'puis')} {fmtUsd(preview.fullMonthUsd)}/{t('mo', 'شهر', 'mois')}
              </span>
            ) : (
              <span className="text-gray-600">
                {t('First invoice', 'الفاتورة الأولى', 'Première facture')}: <b>{fmtUsd(preview.firstInvoiceUsd)}</b>{showLbp ? ` · ${fmtLbp(preview.firstInvoiceLbp)}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** One active registration: current cycle + BILL-CYCLES forward-anchor edit (R3). */
function ActiveRegRow({
  r, t, locale, ref_, pending, onCancel, onSetAnchor,
}: {
  r: Reg; t: Tr; locale: string; ref_: string; pending: boolean
  onCancel: () => void; onSetAnchor: (anchor: string) => void
}) {
  const isFuture = !!r.start_date && r.start_date > ref_
  const renewsOn = r.paid_until ?? r.end_date ?? null
  const [editing, setEditing] = useState(false)
  const [newAnchor, setNewAnchor] = useState(r.billing_anchor ?? renewsOn ?? ref_)

  return (
    <div data-testid="reg-row" data-status="active" data-reg-id={r.id}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <span className="text-sm font-medium" data-testid="reg-student">{r.studentName}</span>
        <div className="text-xs text-muted-foreground" data-testid="reg-cycle">
          {isFuture
            ? <span className="text-blue-700">{t('Starts', 'يبدأ', 'Débute')} {fmtDate(r.start_date, locale)}</span>
            : renewsOn ? <>{t('Renews', 'يتجدّد', 'Renouvelle')} {fmtDate(renewsOn, locale)}</> : null}
          {r.first_cycle_prorated ? <span className="ms-1">· {t('prorated 1st cycle', 'الدورة الأولى بالتناسب', '1er cycle proratisé')}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isFuture && <Badge data-testid="reg-starts" className="bg-blue-100 text-blue-700">{t('Starts', 'يبدأ', 'Débute')} {fmtDate(r.start_date, locale)}</Badge>}
        {r.invoice_id && <Badge className="bg-green-100 text-green-700">{t('Invoiced', 'مفوترة', 'Facturé')}</Badge>}
        <Button size="sm" variant="ghost" data-testid="cycle-edit-btn" disabled={pending}
          onClick={() => setEditing((v) => !v)}>{t('Billing date', 'تاريخ الفوترة', 'Date de facturation')}</Button>
        <Button size="sm" variant="outline" data-testid="cancel-reg-btn" disabled={pending}
          onClick={onCancel}>{t('Cancel', 'إلغاء', 'Annuler')}</Button>
      </div>
      {editing && (
        <div className="flex w-full items-end gap-2 border-t pt-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-0.5 block">{t('Move billing to (forward only)', 'نقل الفوترة إلى (للأمام فقط)', 'Décaler la facturation (en avant)')}</span>
            <input type="date" data-testid="anchor-edit" value={newAnchor} onChange={(e) => setNewAnchor(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </label>
          <Button size="sm" data-testid="anchor-save" disabled={pending}
            onClick={() => onSetAnchor(newAnchor)}>{t('Save', 'حفظ', 'Enregistrer')}</Button>
        </div>
      )}
    </div>
  )
}
