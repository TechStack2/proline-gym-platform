'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { approveRegistration, rejectRegistration, cancelRegistration, registerWalkIn, setRegistrationAnchor } from './registration-actions'
import { useErrorText } from '@/lib/errors/use-error-text'
import { cn } from '@/lib/utils'
import { computeProration, defaultBillingAnchor, prorateDefaultFor, DEFAULT_CYCLE_POLICY, type GymCyclePolicy } from '@/lib/billing/proration'
import { fmtUsd, fmtLbp } from '@/lib/billing/currency'
import { fmtDate } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { EmptyState } from '@/components/ui/empty-state'
import { ReasonDialog } from '@/components/billing/reason-dialog'

type Reg = {
  id: string; status: string; waitlist_position: number | null
  monthly_fee_usd: number | null; invoice_id: string | null; studentName: string
  start_date?: string | null; billing_anchor?: string | null; paid_until?: string | null
  end_date?: string | null; first_cycle_prorated?: boolean | null
}

type ApprovePayload = { regId: string; discountPct: number; startDate: string; billingAnchor?: string; prorate: boolean }
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
  cyclePolicy = DEFAULT_CYCLE_POLICY,
}: {
  classId: string
  registrations: Reg[]
  students: { id: string; name: string }[]
  locale: string
  monthlyFeeUsd?: number | null
  scheduleDays?: number[]
  rate?: number | null
  today?: string
  /** BILL-POLICY: the gym's cycle policy. Defaults to today's behavior. */
  cyclePolicy?: GymCyclePolicy
}) {
  const t: Tr = (en, ar, fr) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const ref = today ?? new Date().toISOString().slice(0, 10)
  const router = useRouter()
  const errText = useErrorText()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [walkInStudent, setWalkInStudent] = useState('')
  // CANCEL-FLOW: the registration pending cancellation (opens the reason dialog).
  const [cancelTarget, setCancelTarget] = useState<Reg | null>(null)

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
        {error && <div data-testid="reg-error" className="tint-danger rounded-md px-3 py-2 text-sm">{error}</div>}

        {/* Walk-in register */}
        <div className="flex flex-wrap items-end gap-2 border-b pb-4">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-muted-foreground">{t('Register a member (walk-in)', 'تسجيل عضو (مباشر)', 'Inscrire un membre (sur place)')}</label>
            <Select data-testid="walkin-student" value={walkInStudent} onChange={(e) => setWalkInStudent(e.target.value)}
              className="h-9 border-input">
              <option value="">{t('Select a member…', 'اختر عضواً…', 'Sélectionner un membre…')}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
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
            <EmptyState variant="bare" title={t('No pending requests.', 'لا طلبات معلّقة.', 'Aucune demande en attente.')} />
          ) : (
            <div className="space-y-2">
              {requested.map((r) => (
                <PendingRegRow key={r.id} r={r} t={t} locale={locale} ref_={ref} cyclePolicy={cyclePolicy}
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
            <EmptyState variant="bare" title={t('No active registrations.', 'لا تسجيلات نشطة.', 'Aucune inscription active.')} />
          ) : (
            <div className="space-y-2" data-testid="active-list">
              {active.map((r) => (
                <ActiveRegRow key={r.id} r={r} t={t} locale={locale} ref_={ref} pending={pending}
                  onCancel={() => setCancelTarget(r)}
                  onSetAnchor={(anchor) => run(() => setRegistrationAnchor({ regId: r.id, newAnchor: anchor, classId }))} />
              ))}
            </div>
          )}
        </div>

        {/* Waitlist */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Waitlist', 'قائمة الانتظار', "Liste d'attente")} ({waitlisted.length})</h3>
          {waitlisted.length === 0 ? (
            <EmptyState variant="bare" title={t('Waitlist is empty.', 'قائمة الانتظار فارغة.', "La liste d'attente est vide.")} />
          ) : (
            <div className="space-y-2" data-testid="waitlist">
              {waitlisted.map((r) => (
                <div key={r.id} data-testid="reg-row" data-status="waitlisted" data-reg-id={r.id} data-position={r.waitlist_position ?? ''}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium" data-testid="reg-student">#{r.waitlist_position} · {r.studentName}</span>
                  <Button size="sm" variant="outline" data-testid="cancel-reg-btn" disabled={pending}
                    onClick={() => setCancelTarget(r)}>{t('Cancel', 'إلغاء', 'Annuler')}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* CANCEL-FLOW: one reason dialog for every cancel (active/waitlist). The
          refund fork shows when the registration carries an invoice (may be paid). */}
      <ReasonDialog
        open={!!cancelTarget}
        locale={locale}
        busy={pending}
        testid="cancel-reg-dialog"
        title={t('Cancel registration', 'إلغاء التسجيل', "Annuler l'inscription")}
        description={t('Frees the spot and voids the unpaid invoice. The invoice is nullified, never deleted — numbering stays continuous.',
          'يحرّر المقعد ويلغي الفاتورة غير المدفوعة. تُلغى الفاتورة دون حذفها — يبقى الترقيم متصلاً.',
          "Libère la place et annule la facture impayée. La facture est annulée, jamais supprimée — la numérotation reste continue.")}
        chips={[t('Wrong class', 'صف خاطئ', 'Mauvais cours'), t('Wrong service', 'خدمة خاطئة', 'Mauvais service'),
          t('Member request', 'طلب العضو', 'Demande du membre'), t('Duplicate', 'مكرّر', 'Doublon')]}
        showRefund={!!cancelTarget?.invoice_id}
        confirmLabel={t('Cancel registration', 'إلغاء التسجيل', "Annuler l'inscription")}
        onConfirm={(reason, refund) => {
          const target = cancelTarget
          setCancelTarget(null)
          if (target) run(() => cancelRegistration(target.id, classId, reason, refund))
        }}
        onClose={() => setCancelTarget(null)}
      />
    </Card>
  )
}

// DS2-FMT §2.7 (DA-34): the local toLocaleDateString twin died — dates go through
// `fmtDate(…, 'dayMonth')`, which renders the same year-less "Aug 6" form (and
// Latin digits in Arabic, per the AX-1 rule the raw 'ar' locale here violated).

/** One pending request: fee + discount + BILL-CYCLES start/anchor/prorate + live preview. */
function PendingRegRow({
  r, t, locale, ref_, monthlyFeeUsd, scheduleDays, rate, cyclePolicy, pending, onApprove, onReject,
}: {
  r: Reg; t: Tr; locale: string; ref_: string
  monthlyFeeUsd: number | null; scheduleDays: number[]; rate: number | null
  cyclePolicy: GymCyclePolicy; pending: boolean
  onApprove: (p: ApprovePayload) => void; onReject: () => void
}) {
  const fee = monthlyFeeUsd ?? 0
  const isFree = fee === 0
  const [discount, setDiscount] = useState('')
  const [startDate, setStartDate] = useState(ref_)
  const [anchor, setAnchor] = useState(() => defaultBillingAnchor(scheduleDays, ref_, cyclePolicy))
  const [anchorEdited, setAnchorEdited] = useState(false)
  // BILL-POLICY R3: proration is the NORMALIZING STUB under `calendar`, so it is
  // offered on by default there. Under `anniversary` a fresh cycle starts on the
  // member's own start date — there is nothing to prorate — so it stays off and
  // stays a deliberate staff choice rather than an implied discount.
  const [prorate, setProrate] = useState(() => prorateDefaultFor(cyclePolicy.policy))

  // Auto-derive the anchor from the start date until staff pin it by hand.
  useEffect(() => {
    if (!anchorEdited) setAnchor(defaultBillingAnchor(scheduleDays, startDate, cyclePolicy))
  }, [startDate, anchorEdited, scheduleDays, cyclePolicy])

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
              : <span className="text-gray-500">{monthlyFeeUsd != null ? <Ltr>{`$${Number(fee).toFixed(0)}`}</Ltr> : '—'}</span>}
          </span>
          <Input type="number" min="0" max="100" placeholder={t('disc %', 'خصم %', 'remise %')} data-testid="discount-pct"
            className="h-8 w-20 text-xs" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <Button size="sm" data-testid="approve-btn" disabled={pending}
            onClick={() => onApprove({ regId: r.id, discountPct: isFinite(discPct) ? discPct : 0, startDate,
              // BILL-POLICY: send an anchor ONLY when staff pinned one by hand.
              // Otherwise omit it so _default_billing_anchor derives it from the
              // GYM'S POLICY — the DB stays authoritative for the charge and the
              // client preview cannot shadow it with a stale policy.
              billingAnchor: anchorEdited ? anchor : undefined, prorate })}
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
          {/* BILL-POLICY R3: say plainly — BEFORE staff confirms — what the member
              is charged NOW and when the NEXT bill lands. True in both policies;
              under `calendar` the first line is the normalizing stub. */}
          <div data-testid="reg-proration-preview" className="space-y-0.5 text-xs">
            {!preview.billsNow ? (
              <>
                <span className="block text-blue-700" data-testid="reg-charge-now">
                  {t('Starts', 'يبدأ', 'Débute')} <Ltr>{fmtDate(startDate, locale, 'dayMonth')}</Ltr> · {t('nothing charged now', 'لا رسوم الآن', 'aucun frais maintenant')}
                </span>
                <span className="block text-gray-600" data-testid="reg-next-bill">
                  {t('first bill', 'أول فاتورة', 'première facture')} <Ltr>{fmtDate(preview.cycleStart, locale, 'dayMonth')}</Ltr>: <b><Ltr>{fmtUsd(preview.firstInvoiceUsd)}</Ltr></b>{showLbp ? <> · <Ltr>{fmtLbp(preview.firstInvoiceLbp)}</Ltr></> : ''}
                </span>
              </>
            ) : (
              <>
                <span className={cn('block', preview.prorated ? 'text-amber-700' : 'text-gray-600')} data-testid="reg-charge-now">
                  {t('Charged now', 'المبلغ الآن', 'Facturé maintenant')}: <b><Ltr>{fmtUsd(preview.firstInvoiceUsd)}</Ltr></b>{showLbp ? <> · <Ltr>{fmtLbp(preview.firstInvoiceLbp)}</Ltr></> : ''}
                  {preview.prorated
                    ? ` (${preview.sessionsRemaining}/${preview.sessionsInCycle} ${t('sessions', 'حصص', 'séances')})`
                    : ''}
                </span>
                <span className="block text-gray-600" data-testid="reg-next-bill">
                  {t('Next bill', 'الفاتورة التالية', 'Prochaine facture')} <Ltr>{fmtDate(preview.cycleEnd, locale, 'dayMonth')}</Ltr>: <Ltr>{fmtUsd(preview.fullMonthUsd)}</Ltr>/{t('mo', 'شهر', 'mois')}
                </span>
              </>
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
            ? <span className="text-blue-700">{t('Starts', 'يبدأ', 'Débute')} <Ltr>{fmtDate(r.start_date, locale, 'dayMonth')}</Ltr></span>
            : renewsOn ? <>{t('Renews', 'يتجدّد', 'Renouvelle')} <Ltr>{fmtDate(renewsOn, locale, 'dayMonth')}</Ltr></> : null}
          {r.first_cycle_prorated ? <span className="ms-1">· {t('prorated 1st cycle', 'الدورة الأولى بالتناسب', '1er cycle proratisé')}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isFuture && <Badge data-testid="reg-starts" variant="info">{t('Starts', 'يبدأ', 'Débute')} <Ltr>{fmtDate(r.start_date, locale, 'dayMonth')}</Ltr></Badge>}
        {r.invoice_id && <Badge variant="success">{t('Invoiced', 'مفوترة', 'Facturé')}</Badge>}
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
