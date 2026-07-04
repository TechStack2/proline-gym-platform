import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Receipt as ReceiptIcon, ArrowLeft, Printer } from 'lucide-react'
import { PaymentForm } from '../../payments/components/payment-form'
import { InvoiceActions } from './invoice-actions'
import { balanceUsd, paidUsd, localizedName, STATUS_BADGE, statusLabel, METHOD_LABEL } from '@/lib/billing/reconcile'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string } }

export default async function InvoiceDetailPage({ params: { locale, id } }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, amount_usd, amount_lbp, tax_amount_usd, total_usd, total_lbp,
      exchange_rate, rate_date, status, due_date, paid_at, created_at, notes_en, notes_ar, notes_fr, student_id, payer_profile_id,
      students(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
    .eq('id', id)
    .maybeSingle()

  if (!inv) notFound()

  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount_usd, amount_lbp, payment_method, payment_date, reference_number, created_at')
    .eq('invoice_id', id)
    .order('payment_date', { ascending: true })

  const studentProfiles: any = (inv as any).students?.profiles
  const profile = Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles
  const studentName = localizedName(profile, locale)
  const paid = paidUsd(payments)
  const balance = balanceUsd(inv.total_usd, payments)
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')

  return (
    <div className={cn('space-y-6 p-6', isRTL && 'rtl text-right')}>
      <div className="flex items-center justify-between">
        <Link href={`/${locale}/invoices`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('Invoices', 'الفواتير', 'Factures')}
        </Link>
        <Link href={`/${locale}/invoices/${id}/receipt`}
          data-testid="receipt-link"
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <Printer className="h-4 w-4" /> {t('Receipt', 'الإيصال', 'Reçu')}
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-lg font-bold" data-testid="invoice-number">{inv.invoice_number}</p>
            <p className="text-sm text-muted-foreground">{studentName} · {inv.invoice_type}</p>
            {(inv as any).payer_profile_id && (
              <p className="text-xs text-muted-foreground" data-testid="invoice-detail-payer">
                {t('Payer', 'الدافع', 'Payeur')}: {localizedName((Array.isArray((inv as any).payer) ? (inv as any).payer[0] : (inv as any).payer), locale)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('Due', 'الاستحقاق', 'Échéance')}: {fmtDate(inv.due_date)}</p>
          </div>
          <span data-testid="invoice-status"
            className={cn('inline-flex rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[inv.status])}>
            {statusLabel(inv.status, locale)}
          </span>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-4 text-sm">
          <div><dt className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي', 'Sous-total')}</dt><dd className="font-medium">${Number(inv.amount_usd).toFixed(2)}</dd></div>
          <div><dt className="text-muted-foreground">{t('TVA (11%)', 'ض.ق.م (11%)', 'TVA (11%)')}</dt><dd className="font-medium">${Number(inv.tax_amount_usd).toFixed(2)}</dd></div>
          <div><dt className="text-muted-foreground">{t('Total', 'الإجمالي', 'Total')}</dt><dd className="font-bold" data-testid="invoice-total">${Number(inv.total_usd).toFixed(2)}</dd></div>
          <div><dt className="text-muted-foreground">{t('Balance', 'الرصيد', 'Solde')}</dt><dd className={cn('font-bold', balance > 0 ? 'text-red-600' : 'text-green-600')} data-testid="invoice-balance">${balance.toFixed(2)}</dd></div>
        </dl>
        {inv.total_lbp ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('Total in LBP', 'الإجمالي بالليرة', 'Total en LBP')}: {Number(inv.total_lbp).toLocaleString()} LBP</p>
        ) : null}
      </div>

      {/* Settlement */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">{t('Record a payment', 'تسجيل دفعة', 'Enregistrer un paiement')}</h2>
        <PaymentForm
          locale={locale}
          invoice={{
            id: inv.id,
            invoice_number: inv.invoice_number,
            total_usd: Number(inv.total_usd),
            balance_usd: balance,
            status: inv.status,
            exchange_rate: inv.exchange_rate != null ? Number(inv.exchange_rate) : null,
          }}
        />
      </div>

      {/* Payment history */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">{t('Payments', 'المدفوعات', 'Paiements')} ({paid.toFixed(2)} {t('paid', 'مدفوع', 'payé')})</h2>
        {payments && payments.length > 0 ? (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left">
                <th className="p-2">{t('Date', 'التاريخ', 'Date')}</th><th className="p-2">{t('Method', 'الطريقة', 'Méthode')}</th>
                <th className="p-2">{t('USD', 'دولار', 'USD')}</th><th className="p-2">{t('LBP', 'ليرة', 'LBP')}</th><th className="p-2">{t('Reference', 'المرجع', 'Référence')}</th>
              </tr></thead>
              <tbody data-testid="payment-history">
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b" data-testid="payment-row">
                    <td className="p-2">{fmtDate(p.payment_date)}</td>
                    <td className="p-2">{(locale === 'ar' ? METHOD_LABEL[p.payment_method]?.ar : locale === 'fr' ? METHOD_LABEL[p.payment_method]?.fr : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}</td>
                    <td className="p-2">${Number(p.amount_usd).toFixed(2)}</td>
                    <td className="p-2">{p.amount_lbp ? Number(p.amount_lbp).toLocaleString() : '—'}</td>
                    <td className="p-2 text-muted-foreground">{p.reference_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">{t('No payments recorded yet.', 'لم تُسجَّل أي دفعات بعد.', 'Aucun paiement enregistré pour le moment.')}</p>
        )}
      </div>

      <InvoiceActions invoiceId={inv.id} status={inv.status} locale={locale} />
    </div>
  )
}
