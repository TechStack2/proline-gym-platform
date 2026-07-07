'use client'

/**
 * RecordPaymentForm (Cycle 5 / Phase 1 / D1) — the single settlement surface.
 *
 * Replaces the cosmetic as-is form (which inserted payments.amount / .currency /
 * .status — none of which exist — and never touched the invoice). It is now
 * invoice-targeted and calls the canonical record_payment service via the
 * recordPayment server action: the RPC locks the invoice, BLOCKS overpayment,
 * inserts the payment, recomputes status from Σ payments, and emits
 * payment_received. The amount defaults to the remaining balance (walk-in
 * "issue & pay" one motion); LBP is recorded alongside for the receipt but the
 * invoice reconciles on amount_usd.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordPayment, referenceExists } from '../../invoices/actions'
import { useErrorText } from '@/lib/errors/use-error-text';

type Method = 'cash_usd' | 'cash_lbp' | 'omt' | 'whish' | 'bank_transfer' | 'bob_finance'

export interface PayableInvoice {
  id: string
  invoice_number: string
  total_usd: number
  balance_usd: number
  status: string
  exchange_rate: number | null
}

const METHODS: { value: Method; en: string; ar: string; fr: string }[] = [
  { value: 'cash_usd', en: 'Cash (USD)', ar: 'نقداً (دولار)', fr: 'Espèces (USD)' },
  { value: 'cash_lbp', en: 'Cash (LBP)', ar: 'نقداً (ليرة)', fr: 'Espèces (LBP)' },
  { value: 'omt', en: 'OMT', ar: 'OMT', fr: 'OMT' },
  { value: 'whish', en: 'Whish', ar: 'Whish', fr: 'Whish' },
  { value: 'bank_transfer', en: 'Bank transfer', ar: 'تحويل مصرفي', fr: 'Virement bancaire' },
  { value: 'bob_finance', en: 'BOB Finance', ar: 'BOB Finance', fr: 'BOB Finance' },
]

export function PaymentForm({ invoice, locale }: { invoice: PayableInvoice; locale: string }) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const router = useRouter()
  const errText = useErrorText();
  const [pending, startTransition] = useTransition()

  const settled = ['paid', 'cancelled', 'refunded'].includes(invoice.status)
  const [amountUsd, setAmountUsd] = useState<string>(invoice.balance_usd.toFixed(2))
  const [amountLbp, setAmountLbp] = useState<string>('')
  const [method, setMethod] = useState<Method>('cash_usd')
  const [reference, setReference] = useState<string>('')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string>('')

  async function submit() {
    setError('')
    const usd = parseFloat(amountUsd)
    if (!Number.isFinite(usd) || usd <= 0) {
      setError(t('Enter a positive amount.', 'أدخل مبلغاً موجباً.', 'Saisissez un montant positif.'))
      return
    }
    // E10: duplicate-reference soft warn (non-blocking).
    if (reference.trim()) {
      const dup = await referenceExists(invoice.id, reference.trim())
      if (dup && !window.confirm(t('A payment with this reference already exists on this invoice. Record anyway?', 'توجد دفعة بنفس المرجع على هذه الفاتورة. تسجيل على أي حال؟', 'Un paiement avec cette référence existe déjà sur cette facture. Enregistrer quand même ?'))) {
        return
      }
    }
    startTransition(async () => {
      const res = await recordPayment({
        invoiceId: invoice.id,
        amountUsd: usd,
        amountLbp: amountLbp ? parseFloat(amountLbp) : 0,
        method,
        reference: reference.trim() || null,
        exchangeRate: invoice.exchange_rate,
        paymentDate: date,
      })
      if (!res.ok) {
        setError(errText(res.error))
        return
      }
      // Full settlement → jump to the printable receipt (walk-in "issue & pay").
      // Partial → stay to record the remainder.
      if (res.data.status === 'paid') {
        router.push(`/${locale}/invoices/${invoice.id}/receipt`)
      }
      router.refresh()
    })
  }

  if (settled) {
    return (
      <div data-testid="payment-form" className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t('This invoice is settled — no further payment can be recorded.', 'تمت تسوية هذه الفاتورة — لا يمكن تسجيل دفعة أخرى.', 'Cette facture est réglée — aucun autre paiement ne peut être enregistré.')}
      </div>
    )
  }

  return (
    <div data-testid="payment-form" className={`space-y-4 rounded-xl border p-4 ${isRTL ? 'text-right' : ''}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pay-amount-usd">{t('Amount (USD)', 'المبلغ (دولار)', 'Montant (USD)')}</Label>
          <Input id="pay-amount-usd" data-testid="pay-amount-usd" type="number" step="0.01" min="0"
            value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            {t('Balance', 'الرصيد', 'Solde')}: ${invoice.balance_usd.toFixed(2)}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay-amount-lbp">{t('Amount (LBP)', 'المبلغ (ليرة)', 'Montant (LBP)')}</Label>
          <Input id="pay-amount-lbp" data-testid="pay-amount-lbp" type="number" step="1" min="0"
            placeholder={t('optional', 'اختياري', 'facultatif')} value={amountLbp} onChange={(e) => setAmountLbp(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay-method">{t('Method', 'طريقة الدفع', 'Méthode')}</Label>
          <select id="pay-method" data-testid="pay-method" value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{t(m.en, m.ar, m.fr)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay-date">{t('Date', 'التاريخ', 'Date')}</Label>
          <Input id="pay-date" data-testid="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="pay-reference">{t('Reference (OMT/Whish/transfer #)', 'المرجع (رقم OMT/Whish/تحويل)', 'Référence (n° OMT/Whish/virement)')}</Label>
          <Input id="pay-reference" data-testid="pay-reference" value={reference}
            onChange={(e) => setReference(e.target.value)} placeholder={t('optional', 'اختياري', 'facultatif')} />
        </div>
      </div>

      {error && (
        <div data-testid="pay-error" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Button data-testid="pay-submit" onClick={submit} disabled={pending}
        className="bg-[#cd1419] hover:bg-[#a81014]">
        {pending ? t('Recording…', 'جارٍ التسجيل…', 'Enregistrement…') : t('Record payment', 'تسجيل الدفعة', 'Enregistrer le paiement')}
      </Button>
    </div>
  )
}
