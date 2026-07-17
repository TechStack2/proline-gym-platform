import { dateLocale } from '@/lib/utils/locale-format'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { paidUsd, balanceUsd, localizedName, statusLabel, METHOD_LABEL, invoiceTypeLabel, invoiceNote } from '@/lib/billing/reconcile'
import { getTranslations } from 'next-intl/server'
import { WhatsAppShare } from '@/components/shared/whatsapp-share'
import { PrintButton } from './print-button'
import { normalizeCurrencyPref, orderedMoney, fmtUsd } from '@/lib/billing/currency'
import { storagePublicUrl } from '@/lib/storage/public-url'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string } }

/**
 * PRINT-FIX — thermal 80mm payment receipt / invoice. Field finding [8]: the old
 * A4-width card, built from theme-token neutrals, printed dark-on-dark from a dark
 * session and carried the browser's URL header/footer. This is now a self-contained
 * paper document: an 80mm monochrome layout pinned to the LIGHT ramp (see the
 * `[data-testid="receipt"]` rules + @media print block in globals.css) with a scoped
 * @page that drops the browser chrome. Same document serves the receipt and the
 * invoice; the "PAID / DUE" stamp is driven by the outstanding balance. RLS-scoped:
 * staff see any gym invoice; the owning member sees their own. Reachable from the
 * invoice detail, the payments list, the settlement redirect, and portal/billing.
 */
export default async function ReceiptPage({ params: { locale, id } }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const tw = await getTranslations('whatsapp')
  const supabase = await createClient()

  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, notes_en, notes_ar, notes_fr, amount_usd, tax_amount_usd, tax_rate, total_usd, total_lbp,
      exchange_rate, rate_date, status, due_date, paid_at, created_at, payer_profile_id,
      gyms(name_ar, name_en, name_fr, logo_url, updated_at, tva_registration_number, currency_preference),
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
  const logoUrl = storagePublicUrl('avatars', gym?.logo_url, gym?.updated_at)
  // BILL-LOCALIZE: honest tax + preferred display currency (see currency.ts). The tax
  // row shows only for a TVA-registered gym with real tax; the rate is the invoice's own
  // stored tax_rate (per-gym, 000074), never a hardcoded 11%.
  const ti = await getTranslations('invoices')
  const tvaNumber: string | null = gym?.tva_registration_number ?? null
  const pref = normalizeCurrencyPref(gym?.currency_preference)
  const showTax = !!tvaNumber && Number(inv.tax_amount_usd) > 0
  const ratePct = Number(inv.tax_rate ?? 0)
  const rateLabel = Number.isInteger(ratePct) ? String(ratePct) : ratePct.toFixed(2)
  // Discount is not a stored column — derive it (subtotal + tax − total) and show the
  // line ONLY when a positive discount actually applied. No schema change.
  const discountUsd = Number(inv.amount_usd ?? 0) + Number(inv.tax_amount_usd ?? 0) - Number(inv.total_usd ?? 0)
  const showDiscount = discountUsd > 0.005
  const totalMoney = orderedMoney(inv.total_usd, inv.total_lbp, pref)
  const profRow: any = (inv as any).students?.profiles
  const profile = Array.isArray(profRow) ? profRow[0] : profRow
  const studentName = localizedName(profile, locale)
  const paid = paidUsd(payments)
  const balance = balanceUsd(inv.total_usd, payments)
  const settled = balance <= 0.005
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')
  // INVOICE-POLISH 6a/6b: the customer-facing "what it's for" label lives in notes_*
  // (composed at creation by the billing RPCs). Rendered on the receipt (receipt-note)
  // + passed into the WhatsApp share below.
  const label = invoiceNote(inv, locale)

  // Meta rows — stacked single-column (thermal is narrow), label · value.
  const meta: Array<{ k: string; v: ReactNode; testid?: string }> = [
    { k: t('Invoice', 'الفاتورة', 'Facture'), v: <span className="font-mono font-medium" data-testid="receipt-invoice-number">{inv.invoice_number}</span> },
    { k: t('Date', 'التاريخ', 'Date'), v: fmtDate((inv as any).paid_at || inv.created_at) },
    { k: t('Member', 'العضو', 'Membre'), v: studentName },
  ]
  if ((inv as any).payer_profile_id) {
    meta.push({ k: t('Payer', 'الدافع', 'Payeur'), testid: 'receipt-payer', v: localizedName(Array.isArray((inv as any).payer) ? (inv as any).payer[0] : (inv as any).payer, locale) })
  }
  meta.push({ k: t('Status', 'الحالة', 'Statut'), v: <span data-testid="receipt-status">{statusLabel(inv.status, locale)}</span> })
  meta.push({ k: t('Type', 'النوع', 'Type'), v: <span data-testid="receipt-invoice-type" data-type={inv.invoice_type || 'other'}>{invoiceTypeLabel(inv.invoice_type, locale)}</span> })

  return (
    <div className={cn('mx-auto max-w-md p-4 sm:p-6', isRTL && 'rtl text-right')}>
      {/* Scoped @page: 80mm thermal roll, zero margins → no browser URL header/footer.
          Injected here (not globals) so only the receipt route resizes the sheet.
          Inline <style> is CSP-safe: prod style-src is 'self' 'unsafe-inline'. */}
      <style dangerouslySetInnerHTML={{ __html: '@media print{@page{size:80mm auto;margin:0}}' }} />

      {/* Chrome — hidden on print. */}
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

      {/* The thermal document. 80mm on paper (globals @media print); on screen a
          centred paper card so staff preview exactly what prints. Monochrome — no
          coloured badges, no theme tokens that could bleed dark. */}
      <div
        data-testid="receipt"
        className={cn(
          'mx-auto w-[80mm] max-w-full bg-white p-5 text-gray-900 shadow-md ring-1 ring-gray-200',
          'font-mono text-[12px] leading-snug',
          'print:w-full print:p-0 print:shadow-none print:ring-0',
        )}
      >
        {/* Header — logo (if any) + gym name line. */}
        <div className="mb-3 border-b border-dashed border-gray-400 pb-3 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mx-auto mb-2 max-h-12 w-auto object-contain" data-testid="receipt-logo" />
          ) : null}
          <h1 className="text-base font-bold uppercase tracking-wide">{gymName}</h1>
          <p className="text-[11px]">{t('Payment Receipt', 'إيصال دفع', 'Reçu de paiement')}</p>
          {tvaNumber && (
            <p className="text-[10px]" data-testid="receipt-tva-number">{ti('tvaRegistered', { number: tvaNumber })}</p>
          )}
        </div>

        {/* Meta — single column, label · value. */}
        <dl className="mb-3 space-y-0.5">
          {meta.map((m, i) => (
            <div key={i} className="flex justify-between gap-2" {...(m.testid ? { 'data-testid': m.testid } : {})}>
              <dt className="text-gray-500">{m.k}</dt>
              <dd className="text-end font-medium">{m.v}</dd>
            </div>
          ))}
        </dl>

        {label && (
          <p className="mb-3 border-y border-dashed border-gray-300 py-1.5 text-center font-semibold" data-testid="receipt-note">{label}</p>
        )}

        {/* Line items + totals. */}
        <table className="mb-3 w-full">
          <tbody>
            {showTax && (
              <tr><td className="py-0.5 text-gray-500">{t('Subtotal', 'المجموع الفرعي', 'Sous-total')}</td><td className="py-0.5 text-end tabular-nums">{fmtUsd(inv.amount_usd)}</td></tr>
            )}
            {showDiscount && (
              <tr data-testid="receipt-discount"><td className="py-0.5 text-gray-500">{t('Discount', 'الخصم', 'Remise')}</td><td className="py-0.5 text-end tabular-nums">−{fmtUsd(discountUsd)}</td></tr>
            )}
            {showTax && (
              <tr><td className="py-0.5 text-gray-500" data-testid="receipt-tva-label">{ti('tvaLine', { rate: rateLabel })}</td><td className="py-0.5 text-end tabular-nums">{fmtUsd(inv.tax_amount_usd)}</td></tr>
            )}
            <tr className="border-t border-gray-400 text-[13px] font-bold">
              <td className="pt-1.5">{t('Total', 'الإجمالي', 'Total')}</td>
              <td className="pt-1.5 text-end tabular-nums" data-testid="receipt-total">{totalMoney.primary}{totalMoney.secondary ? ` · ${totalMoney.secondary}` : ''}</td>
            </tr>
          </tbody>
        </table>

        {/* Payments. */}
        {(payments ?? []).length > 0 && (
          <>
            <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('Payments', 'المدفوعات', 'Paiements')}</h2>
            <table className="mb-3 w-full">
              <tbody>
                {(payments ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b border-dashed border-gray-200">
                    <td className="py-0.5">{fmtDate(p.payment_date)} · {(locale === 'ar' ? METHOD_LABEL[p.payment_method]?.ar : locale === 'fr' ? METHOD_LABEL[p.payment_method]?.fr : METHOD_LABEL[p.payment_method]?.en) || p.payment_method}{p.reference_number ? ` · ${p.reference_number}` : ''}</td>
                    <td className="py-0.5 text-end tabular-nums">${Number(p.amount_usd).toFixed(2)}{p.amount_lbp ? ` · ${Number(p.amount_lbp).toLocaleString()}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Paid / Balance + the PAID·DUE stamp (monochrome — a bordered box, not colour). */}
        <div className="flex items-center justify-between border-t border-gray-400 pt-2 font-bold">
          <span>{t('Paid', 'المدفوع', 'Payé')}: ${paid.toFixed(2)}</span>
          <span data-testid="receipt-balance">{t('Balance', 'الرصيد', 'Solde')}: ${balance.toFixed(2)}</span>
        </div>
        <div className="mt-2 text-center">
          <span
            data-testid="receipt-paid-stamp"
            data-state={settled ? 'paid' : 'due'}
            className="inline-block rounded border-2 border-gray-900 px-3 py-0.5 text-sm font-extrabold uppercase tracking-widest"
          >
            {settled ? t('Paid', 'مدفوع', 'Payé') : t('Due', 'مستحق', 'Dû')}
          </span>
        </div>

        {inv.exchange_rate ? (
          <p className="mt-3 text-center text-[10px] text-gray-500" data-testid="receipt-rate">
            {t('Rate', 'سعر الصرف', 'Taux')}: 1 USD = {Number(inv.exchange_rate).toLocaleString()} LBP{inv.rate_date ? ` · ${fmtDate(inv.rate_date)}` : ''}
          </p>
        ) : null}
        <p className="mt-1 text-center text-[10px] text-gray-500">{t('Thank you', 'شكراً لكم', 'Merci')}</p>
      </div>
    </div>
  )
}
