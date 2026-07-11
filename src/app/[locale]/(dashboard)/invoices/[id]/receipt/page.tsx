import { dateLocale } from '@/lib/utils/locale-format'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { paidUsd, balanceUsd, localizedName, statusLabel, METHOD_LABEL, INVOICE_TYPE_BADGE, invoiceTypeLabel, invoiceNote } from '@/lib/billing/reconcile'
import { getTranslations } from 'next-intl/server'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'
import { PrintButton } from './print-button'
import { normalizeCurrencyPref, orderedMoney, fmtUsd } from '@/lib/billing/currency'

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
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const tw = await getTranslations('whatsapp')
  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, notes_en, notes_ar, notes_fr, amount_usd, tax_amount_usd, tax_rate, total_usd, total_lbp,
      exchange_rate, status, due_date, paid_at, created_at, payer_profile_id,
      gyms(name_ar, name_en, name_fr, tva_registration_number, currency_preference),
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
  // BILL-LOCALIZE: honest tax + preferred display currency (see currency.ts). The tax
  // row shows only for a TVA-registered gym with real tax; the rate is the invoice's own
  // stored tax_rate (per-gym, 000074), never a hardcoded 11%.
  const ti = await getTranslations('invoices')
  const tvaNumber: string | null = gym?.tva_registration_number ?? null
  const pref = normalizeCurrencyPref(gym?.currency_preference)
  const showTax = !!tvaNumber && Number(inv.tax_amount_usd) > 0
  const ratePct = Number(inv.tax_rate ?? 0)
  const rateLabel = Number.isInteger(ratePct) ? String(ratePct) : ratePct.toFixed(2)
  const totalMoney = orderedMoney(inv.total_usd, inv.total_lbp, pref)
  const profRow: any = (inv as any).students?.profiles
  const profile = Array.isArray(profRow) ? profRow[0] : profRow
  const studentName = localizedName(profile, locale)
  const paid = paidUsd(payments)
  const balance = balanceUsd(inv.total_usd, payments)
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')
  // INVOICE-POLISH 6a/6b: the customer-facing "what it's for" label lives in notes_*
  // (composed at creation by the billing RPCs). Rendered on the receipt (receipt-note)
  // + passed into the WhatsApp share below.
  const label = invoiceNote(inv, locale)

  return (
    <div className={cn('mx-auto max-w-xl p-6', isRTL && 'rtl text-right')} data-testid="receipt">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/${locale}/invoices/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← {t('Back', 'رجوع', 'Retour')}</a>
        <span className="flex items-center gap-2">
          <WhatsAppShare phone={profile?.phone} testid="receipt-wa" variant="button"
            message={tw('tmpl.receipt', { name: studentName, number: inv.invoice_number, gym: gymName,
              label: label || invoiceTypeLabel(inv.invoice_type, locale),
              usd: Number(inv.total_usd ?? 0).toFixed(2),
              lbp: inv.total_lbp ? ` / ${Number(inv.total_lbp).toLocaleString()} LBP` : '',
              date: fmtDate((inv as any).paid_at || inv.created_at),
              balance: balance.toFixed(2) })}
            label={tw('share.sendReceipt')} />
          <PrintButton label={t('Print', 'طباعة', 'Imprimer')} />
        </span>
      </div>

      <div className="rounded-2xl border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="mb-6 border-b pb-4 text-center">
          <h1 className="text-xl font-bold">{gymName}</h1>
          <p className="text-sm text-muted-foreground">{t('Payment Receipt', 'إيصال دفع', 'Reçu de paiement')}</p>
          {tvaNumber && (
            <p className="text-xs text-muted-foreground" data-testid="receipt-tva-number">{ti('tvaRegistered', { number: tvaNumber })}</p>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">{t('Invoice', 'الفاتورة', 'Facture')}: </span><span className="font-mono font-medium" data-testid="receipt-invoice-number">{inv.invoice_number}</span></div>
          <div><span className="text-muted-foreground">{t('Date', 'التاريخ', 'Date')}: </span>{fmtDate(inv.created_at)}</div>
          <div><span className="text-muted-foreground">{t('Member', 'العضو', 'Membre')}: </span>{studentName}</div>
          {(inv as any).payer_profile_id && (
            <div data-testid="receipt-payer"><span className="text-muted-foreground">{t('Payer', 'الدافع', 'Payeur')}: </span>
              {localizedName((Array.isArray((inv as any).payer) ? (inv as any).payer[0] : (inv as any).payer), locale)}
            </div>
          )}
          <div><span className="text-muted-foreground">{t('Status', 'الحالة', 'Statut')}: </span><span data-testid="receipt-status">{statusLabel(inv.status, locale)}</span></div>
          <div><span className="text-muted-foreground">{t('Type', 'النوع', 'Type')}: </span>
            <span data-testid="receipt-invoice-type" data-type={inv.invoice_type || 'other'}
              className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', INVOICE_TYPE_BADGE[inv.invoice_type] || INVOICE_TYPE_BADGE.other)}>
              {invoiceTypeLabel(inv.invoice_type, locale)}
            </span>
          </div>
        </div>
        {invoiceNote(inv, locale) && (
          <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800" data-testid="receipt-note">{invoiceNote(inv, locale)}</p>
        )}

        <table className="mb-4 w-full text-sm">
          <tbody>
            {showTax && (
              <tr className="border-b"><td className="py-1 text-muted-foreground">{t('Subtotal', 'المجموع الفرعي', 'Sous-total')}</td><td className="py-1 text-end">{fmtUsd(inv.amount_usd)}</td></tr>
            )}
            {showTax && (
              <tr className="border-b"><td className="py-1 text-muted-foreground" data-testid="receipt-tva-label">{ti('tvaLine', { rate: rateLabel })}</td><td className="py-1 text-end">{fmtUsd(inv.tax_amount_usd)}</td></tr>
            )}
            <tr className="border-b font-bold"><td className="py-1">{t('Total', 'الإجمالي', 'Total')}</td><td className="py-1 text-end" data-testid="receipt-total">{totalMoney.primary}{totalMoney.secondary ? ` · ${totalMoney.secondary}` : ''}</td></tr>
          </tbody>
        </table>

        <h2 className="mb-1 text-sm font-semibold">{t('Payments', 'المدفوعات', 'Paiements')}</h2>
        <table className="mb-4 w-full text-sm">
          <tbody>
            {(payments ?? []).map((p: any) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{fmtDate(p.payment_date)} · {(locale === 'ar' ? METHOD_LABEL[p.payment_method]?.ar : locale === 'fr' ? METHOD_LABEL[p.payment_method]?.fr : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}{p.reference_number ? ` · ${p.reference_number}` : ''}</td>
                <td className="py-1 text-end">${Number(p.amount_usd).toFixed(2)}{p.amount_lbp ? ` · ${Number(p.amount_lbp).toLocaleString()} LBP` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between border-t pt-2 text-sm font-bold">
          <span>{t('Paid', 'المدفوع', 'Payé')}: ${paid.toFixed(2)}</span>
          <span data-testid="receipt-balance" className={balance > 0 ? 'text-red-600' : 'text-green-600'}>{t('Balance', 'الرصيد', 'Solde')}: ${balance.toFixed(2)}</span>
        </div>

        {inv.exchange_rate ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t('Rate', 'سعر الصرف', 'Taux')}: 1 USD = {Number(inv.exchange_rate).toLocaleString()} LBP</p>
        ) : null}
        <p className="mt-2 text-center text-xs text-muted-foreground">{t('Thank you', 'شكراً لكم', 'Merci')}</p>
      </div>
    </div>
  )
}
