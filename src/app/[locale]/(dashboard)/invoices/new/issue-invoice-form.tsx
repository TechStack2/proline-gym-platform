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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { issueInvoice } from '../actions'

type InvoiceType = 'membership' | 'pt_package' | 'pt_session' | 'camp' | 'rental' | 'event' | 'other'

const TYPES: { value: InvoiceType; en: string; ar: string }[] = [
  { value: 'membership', en: 'Membership', ar: 'اشتراك' },
  { value: 'pt_package', en: 'PT package', ar: 'باقة تدريب خاص' },
  { value: 'pt_session', en: 'PT session', ar: 'جلسة تدريب خاص' },
  { value: 'camp', en: 'Camp', ar: 'مخيم' },
  { value: 'rental', en: 'Rental', ar: 'إيجار' },
  { value: 'event', en: 'Event', ar: 'فعالية' },
  { value: 'other', en: 'Other', ar: 'أخرى' },
]

export function IssueInvoiceForm({
  locale, students, exchangeRate, rateDate,
}: {
  locale: string
  students: { id: string; name: string }[]
  exchangeRate: number | null
  rateDate: string | null
}) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string) => (isRTL ? ar : en)
  const router = useRouter()
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
    if (!studentId) { setError(t('Select a member.', 'اختر عضواً.')); return }
    if (!Number.isFinite(usd) || usd <= 0) { setError(t('Enter a positive amount.', 'أدخل مبلغاً موجباً.')); return }
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
      if (!res.ok) { setError(res.error); return }
      router.push(`/${locale}/invoices/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div data-testid="issue-form" className={`max-w-lg space-y-4 rounded-xl border p-4 ${isRTL ? 'text-right' : ''}`}>
      <div className="space-y-1">
        <Label htmlFor="inv-student">{t('Member', 'العضو')}</Label>
        <select id="inv-student" data-testid="inv-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">{t('Select a member…', 'اختر عضواً…')}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="inv-type">{t('Type', 'النوع')}</Label>
          <select id="inv-type" data-testid="inv-type" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {TYPES.map((x) => <option key={x.value} value={x.value}>{t(x.en, x.ar)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-due">{t('Due date', 'تاريخ الاستحقاق')}</Label>
          <Input id="inv-due" data-testid="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-amount-usd">{t('Amount (USD, pre-TVA)', 'المبلغ (دولار، قبل الضريبة)')}</Label>
          <Input id="inv-amount-usd" data-testid="inv-amount-usd" type="number" step="0.01" min="0"
            value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">{t('11% TVA added automatically.', 'تُضاف ضريبة 11% تلقائياً.')}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-amount-lbp">{t('Amount (LBP)', 'المبلغ (ليرة)')}</Label>
          <Input id="inv-amount-lbp" data-testid="inv-amount-lbp" type="number" step="1" min="0"
            value={amountLbp} onChange={(e) => setAmountLbp(e.target.value)} placeholder={derivedLbp || t('optional', 'اختياري')} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="inv-notes">{t('Notes', 'ملاحظات')}</Label>
        <Input id="inv-notes" data-testid="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('optional', 'اختياري')} />
      </div>

      {error && <div data-testid="issue-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Button data-testid="issue-submit" onClick={submit} disabled={pending} className="bg-[#cd1419] hover:bg-[#a81014]">
        {pending ? t('Issuing…', 'جارٍ الإصدار…') : t('Issue invoice', 'إصدار الفاتورة')}
      </Button>
    </div>
  )
}
