'use client'

/**
 * IssueInvoiceForm (D1) — the manual issuance surface. Calls the canonical
 * issue_invoice service (via the issueInvoice action): the DB triggers compute
 * the 11% TVA, total, and invoice number, and invoice_issued fires to the
 * member (+guardian). On success it lands on the invoice detail, where the
 * payment form is pre-filled to the full balance — the walk-in "issue & collect"
 * one motion. amount_lbp is derived from the current rate but editable.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { issueInvoice } from '../actions'
import { useErrorText } from '@/lib/errors/use-error-text';

type InvoiceType = 'membership' | 'pt_package' | 'pt_session' | 'camp' | 'rental' | 'event' | 'other'

const TYPES: { value: InvoiceType; en: string; ar: string; fr: string }[] = [
  { value: 'membership', en: 'Membership', ar: 'اشتراك', fr: 'Abonnement' },
  { value: 'pt_package', en: 'PT package', ar: 'باقة تدريب خاص', fr: 'Pack PT' },
  { value: 'pt_session', en: 'PT session', ar: 'جلسة تدريب خاص', fr: 'Séance PT' },
  { value: 'camp', en: 'Camp', ar: 'مخيم', fr: 'Camp' },
  { value: 'rental', en: 'Rental', ar: 'إيجار', fr: 'Location' },
  { value: 'event', en: 'Event', ar: 'فعالية', fr: 'Événement' },
  { value: 'other', en: 'Other', ar: 'أخرى', fr: 'Autre' },
]

export function IssueInvoiceForm({
  locale, students, exchangeRate, rateDate, taxRate, tvaRegistered,
}: {
  locale: string
  students: { id: string; name: string }[]
  exchangeRate: number | null
  rateDate: string | null
  // BILL-LOCALIZE: the gym's real tax posture drives an HONEST issuance hint.
  taxRate: number
  tvaRegistered: boolean
}) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const tn = useTranslations('invoiceNew')
  // Only a TVA-registered gym with a real rate frames the amount as pre-TVA.
  const showTva = tvaRegistered && taxRate > 0
  const rateLabel = Number.isInteger(taxRate) ? String(taxRate) : taxRate.toFixed(2)
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()

  const [studentId, setStudentId] = useState('')
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('membership')
  const [amountUsd, setAmountUsd] = useState('')
  const [amountLbp, setAmountLbp] = useState('')
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const derivedLbp = useMemo(() => {
    const usd = parseFloat(amountUsd)
    if (!exchangeRate || !Number.isFinite(usd)) return ''
    return Math.round(usd * exchangeRate).toString()
  }, [amountUsd, exchangeRate])

  function submit() {
    setError('')
    const usd = parseFloat(amountUsd)
    if (!studentId) { setError(t('Select a member.', 'اختر عضواً.', 'Sélectionnez un membre.')); return }
    if (!Number.isFinite(usd) || usd <= 0) { setError(t('Enter a positive amount.', 'أدخل مبلغاً موجباً.', 'Saisissez un montant positif.')); return }
    startTransition(async () => {
      const res = await issueInvoice({
        studentId,
        invoiceType,
        amountUsd: usd,
        amountLbp: amountLbp ? parseFloat(amountLbp) : (derivedLbp ? parseFloat(derivedLbp) : 0),
        exchangeRate,
        rateDate,
        dueDate,
        notesEn: notes || null,
        notesAr: notes || null,
        notesFr: notes || null,
      })
      if (!res.ok) { setError(errText(res.error)); return }
      router.push(`/${locale}/invoices/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div data-testid="issue-form" className="max-w-lg space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <Label htmlFor="inv-student">{t('Member', 'العضو', 'Membre')}</Label>
        <Select id="inv-student" data-testid="inv-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className="border-input">
          <option value="">{t('Select a member…', 'اختر عضواً…', 'Sélectionner un membre…')}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="inv-type">{t('Type', 'النوع', 'Type')}</Label>
          <Select id="inv-type" data-testid="inv-type" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
            className="border-input">
            {TYPES.map((x) => <option key={x.value} value={x.value}>{t(x.en, x.ar, x.fr)}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-due">{t('Due date', 'تاريخ الاستحقاق', "Date d'échéance")}</Label>
          <Input id="inv-due" data-testid="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-amount-usd">{showTva ? tn('amountPreTva') : tn('amountUsd')}</Label>
          <Input id="inv-amount-usd" data-testid="inv-amount-usd" type="number" step="0.01" min="0"
            value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="0.00" />
          {showTva && (
            <p className="text-xs text-muted-foreground" data-testid="inv-tva-hint">{tn('tvaAutoAdded', { rate: rateLabel })}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-amount-lbp">{t('Amount (LBP)', 'المبلغ (ليرة)', 'Montant (LBP)')}</Label>
          <Input id="inv-amount-lbp" data-testid="inv-amount-lbp" type="number" step="1" min="0"
            value={amountLbp} onChange={(e) => setAmountLbp(e.target.value)} placeholder={derivedLbp || t('optional', 'اختياري', 'facultatif')} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="inv-notes">{t('Notes', 'ملاحظات', 'Notes')}</Label>
        <Input id="inv-notes" data-testid="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('optional', 'اختياري', 'facultatif')} />
      </div>

      {error && <div data-testid="issue-error" className="tint-danger rounded-md px-3 py-2 text-sm">{error}</div>}

      <Button data-testid="issue-submit" onClick={submit} disabled={pending} className="bg-primary-700 hover:bg-primary-800">
        {pending ? t('Issuing…', 'جارٍ الإصدار…', 'Émission…') : t('Issue invoice', 'إصدار الفاتورة', 'Émettre la facture')}
      </Button>
    </div>
  )
}
