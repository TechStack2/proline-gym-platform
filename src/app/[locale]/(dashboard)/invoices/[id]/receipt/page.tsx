import { dateLocale } from '@/lib/utils/locale-format'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { paidUsd, balanceUsd, localizedName, statusLabel, METHOD_LABEL, INVOICE_TYPE_BADGE, invoiceTypeLabel, invoiceNote } from '@/lib/billing/reconcile'
import { getTranslations } from 'next-intl/server'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'
import { PrintButton } from './print-button'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string } }

/**
 * Printable dual-currency receipt (D1). RLS-scoped: staff see any gym invoice;
 * the owning member sees their own (invoices_student + payments_student). The
 * durable record of settlement — reachable from the invoice detail and from
 * portal/billing. Chrome is hidden on print via the `print:hidden` utilities.
 */
export default async function ReceiptPage({ params: { locale, id } }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string) => (isRTL ? ar : en)
  const tw = await getTranslations('whatsapp')
  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, notes_en, notes_ar, notes_fr, amount_usd, tax_amount_usd, total_usd, total_lbp,
      exchange_rate, status, due_date, paid_at, created_at, payer_profile_id,
      gyms(name_ar, name_en, name_fr),
      students(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
    .eq('id', id)
    .maybeSingle()

  if (!inv) notFound()

  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount_usd, amount_lbp, payment_method, payment_date, reference_number')
    .eq('invoice_id', id)
    .order('payment_date', { ascending: true })

  const gymRow: any = (inv as any).gyms
  const gym = Array.isArray(gymRow) ? gymRow[0] : gymRow
  const gymName = gym ? (isRTL ? gym.name_ar : locale === 'fr' ? gym.name_fr : gym.name_en) : 'PRO LINE Gym'
  const profRow: any = (inv as any).students?.profiles
  const profile = Array.isArray(profRow) ? profRow[0] : profRow
  const studentName = localizedName(profile, locale)
  const paid = paidUsd(payments)
  const balance = balanceUsd(inv.total_usd, payments)
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')

  return (
    <div className={cn('mx-auto max-w-xl p-6', isRTL && 'rtl text-right')} data-testid="receipt">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/${locale}/invoices/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← {t('Back', 'رجوع')}</a>
        <span className="flex items-center gap-2">
          <WhatsAppShare phone={profile?.phone} testid="receipt-wa" variant="button"
            message={tw('tmpl.receipt', { name: studentName, number: inv.invoice_number, gym: gymName,
              usd: Number(inv.total_usd ?? 0).toFixed(2),
              lbp: inv.total_lbp ? ` / ${Number(inv.total_lbp).toLocaleString()} LBP` : '' })}
            label={tw('share.sendReceipt')} />
          <PrintButton label={t('Print', 'طباعة')} />
        </span>
      </div>

      <div className="rounded-2xl border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="mb-6 border-b pb-4 text-center">
          <h1 className="text-xl font-bold">{gymName}</h1>
          <p className="text-sm text-muted-foreground">{t('Payment Receipt', 'إيصال دفع')}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">{t('Invoice', 'الفاتورة')}: </span><span className="font-mono font-medium" data-testid="receipt-invoice-number">{inv.invoice_number}</span></div>
          <div><span className="text-muted-foreground">{t('Date', 'التاريخ')}: </span>{fmtDate(inv.created_at)}</div>
          <div><span className="text-muted-foreground">{t('Member', 'العضو')}: </span>{studentName}</div>
          {(inv as any).payer_profile_id && (
            <div data-testid="receipt-payer"><span className="text-muted-foreground">{t('Payer', 'الدافع')}: </span>
              {localizedName((Array.isArray((inv as any).payer) ? (inv as any).payer[0] : (inv as any).payer), locale)}
            </div>
          )}
          <div><span className="text-muted-foreground">{t('Status', 'الحالة')}: </span><span data-testid="receipt-status">{statusLabel(inv.status, locale)}</span></div>
          <div><span className="text-muted-foreground">{t('Type', 'النوع')}: </span>
            <span data-testid="receipt-invoice-type" data-type={inv.invoice_type || 'other'}
              className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', INVOICE_TYPE_BADGE[inv.invoice_type] || INVOICE_TYPE_BADGE.other)}>
              {invoiceTypeLabel(inv.invoice_type, locale)}
            </span>
          </div>
        </div>
        {invoiceNote(inv, locale) && (
          <p className="mb-4 text-sm text-muted-foreground" data-testid="receipt-note">{invoiceNote(inv, locale)}</p>
        )}

        <table className="mb-4 w-full text-sm">
          <tbody>
            <tr className="border-b"><td className="py-1 text-muted-foreground">{t('Subtotal', 'المجموع الفرعي')}</td><td className="py-1 text-right">${Number(inv.amount_usd).toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-1 text-muted-foreground">{t('TVA (11%)', 'ض.ق.م (11%)')}</td><td className="py-1 text-right">${Number(inv.tax_amount_usd).toFixed(2)}</td></tr>
            <tr className="border-b font-bold"><td className="py-1">{t('Total', 'الإجمالي')}</td><td className="py-1 text-right">${Number(inv.total_usd).toFixed(2)}{inv.total_lbp ? ` · ${Number(inv.total_lbp).toLocaleString()} LBP` : ''}</td></tr>
          </tbody>
        </table>

        <h2 className="mb-1 text-sm font-semibold">{t('Payments', 'المدفوعات')}</h2>
        <table className="mb-4 w-full text-sm">
          <tbody>
            {(payments ?? []).map((p: any) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{fmtDate(p.payment_date)} · {(isRTL ? METHOD_LABEL[p.payment_method]?.ar : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}{p.reference_number ? ` · ${p.reference_number}` : ''}</td>
                <td className="py-1 text-right">${Number(p.amount_usd).toFixed(2)}{p.amount_lbp ? ` · ${Number(p.amount_lbp).toLocaleString()} LBP` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between border-t pt-2 text-sm font-bold">
          <span>{t('Paid', 'المدفوع')}: ${paid.toFixed(2)}</span>
          <span data-testid="receipt-balance" className={balance > 0 ? 'text-red-600' : 'text-green-600'}>{t('Balance', 'الرصيد')}: ${balance.toFixed(2)}</span>
        </div>

        {inv.exchange_rate ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t('Rate', 'سعر الصرف')}: 1 USD = {Number(inv.exchange_rate).toLocaleString()} LBP</p>
        ) : null}
        <p className="mt-2 text-center text-xs text-muted-foreground">{t('Thank you', 'شكراً لكم')}</p>
      </div>
    </div>
  )
}
