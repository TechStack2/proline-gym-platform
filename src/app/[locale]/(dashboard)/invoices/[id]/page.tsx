import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Receipt as ReceiptIcon, ArrowLeft, Printer } from 'lucide-react'
import { PaymentForm } from '../../payments/components/payment-form'
import { InvoiceActions } from './invoice-actions'
import { InvoiceWhatsApp } from './invoice-whatsapp'
import { buildInvoiceWaPayload } from './wa-message'
import { balanceUsd, paidUsd, localizedName, STATUS_BADGE, statusLabel, displayInvoiceStatus, METHOD_LABEL } from '@/lib/billing/reconcile'
import { normalizeCurrencyPref, orderedMoney, fmtUsd } from '@/lib/billing/currency'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string; id: string } }

export default async function InvoiceDetailPage({ params: { locale, id } }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const supabase = await createClient()

  // DISCOUNT (finding 16): a payment-time discount is an owner/receptionist power only
  // (the DB re-checks — this just gates the affordance). Coach/head-coach can record a
  // payment but not discount it.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: roleRow } = user
    ? await supabase.from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
    : { data: null }
  const canDiscount = ['owner', 'receptionist'].includes((roleRow as { role?: string } | null)?.role ?? '')

  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, amount_usd, amount_lbp, tax_amount_usd, tax_rate, total_usd, total_lbp,
      exchange_rate, rate_date, status, voided_at, void_reason, due_date, paid_at, created_at, notes_en, notes_ar, notes_fr, student_id, payer_profile_id,
      gyms(tva_registration_number, currency_preference),
      students(id, profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)`)
    .eq('id', id)
    .maybeSingle()

  if (!inv) notFound()

  // BILL-LOCALIZE: honest tax + preferred display currency, driven by the gym.
  const ti = await getTranslations('invoices')
  const gymRow: any = (inv as any).gyms
  const gymBilling = Array.isArray(gymRow) ? gymRow[0] : gymRow
  const tvaNumber: string | null = gymBilling?.tva_registration_number ?? null
  const pref = normalizeCurrencyPref(gymBilling?.currency_preference)
  // The tax line shows ONLY for a TVA-registered gym with real tax on the invoice — no
  // registration number → no tax-line pretense. The rate comes from the invoice's own
  // stored tax_rate (per-gym since 000074), never a hardcoded 11%.
  const showTax = !!tvaNumber && Number(inv.tax_amount_usd) > 0
  const ratePct = Number(inv.tax_rate ?? 0)
  const rateLabel = Number.isInteger(ratePct) ? String(ratePct) : ratePct.toFixed(2)
  const totalMoney = orderedMoney(inv.total_usd, inv.total_lbp, pref)

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

  // WA-INVOICE (finding 4): prefilled WhatsApp "Send invoice" / "Send reminder"
  // actions for a still-collectible invoice — owner+reception only (same gate as
  // discount). The payload picks the payer's phone for a guardian-billed invoice,
  // writes the body in the MEMBER's locale, and links to the portal on the gym's
  // canonical host. The trace is the R3 honesty log: how many times each was handed
  // off, and when (not a delivery claim).
  const showWa = canDiscount && balance > 0.005 && !inv.voided_at
  const waPayload = showWa ? await buildInvoiceWaPayload(supabase, id) : null
  let waTrace = { invoice: '', reminder: '' }
  if (showWa) {
    const { data: waLogs } = await supabase
      .from('message_logs')
      .select('template_name, created_at')
      .eq('provider_message_id', id)
      .in('template_name', ['invoice_due', 'invoice_reminder'])
      .order('created_at', { ascending: false })
    const stat = (k: string) => {
      const rows = (waLogs ?? []).filter((r: any) => r.template_name === k)
      return { count: rows.length, last: rows[0]?.created_at as string | undefined }
    }
    const di = stat('invoice_due')
    const rm = stat('invoice_reminder')
    waTrace = {
      invoice: di.count ? ti('waTraceInvoice', { count: di.count, date: fmtDate(di.last ?? null) }) : '',
      reminder: rm.count ? ti('waTraceReminder', { count: rm.count, date: fmtDate(rm.last ?? null) }) : '',
    }
  }

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
            className={cn('inline-flex rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[displayInvoiceStatus(inv.status, inv.voided_at)])}>
            {statusLabel(displayInvoiceStatus(inv.status, inv.voided_at), locale)}
          </span>
        </div>
        {/* CANCEL-FLOW: the VOID reason, recorded when the invoice was nullified. */}
        {inv.voided_at && inv.void_reason && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="invoice-void-reason">
            {t('Voided', 'ملغاة', 'Annulée')}: {inv.void_reason}
          </p>
        )}

        <dl className={cn('mt-6 grid gap-3 text-sm', showTax ? 'sm:grid-cols-4' : 'sm:grid-cols-2')}>
          {showTax && (
            <div><dt className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي', 'Sous-total')}</dt><dd className="font-medium">{fmtUsd(inv.amount_usd)}</dd></div>
          )}
          {showTax && (
            <div>
              <dt className="text-muted-foreground" data-testid="invoice-tva-label">{ti('tvaLine', { rate: rateLabel })}</dt>
              <dd className="font-medium">{fmtUsd(inv.tax_amount_usd)}</dd>
            </div>
          )}
          <div><dt className="text-muted-foreground">{t('Total', 'الإجمالي', 'Total')}</dt><dd className="font-bold" data-testid="invoice-total">{totalMoney.primary}</dd></div>
          <div><dt className="text-muted-foreground">{t('Balance', 'الرصيد', 'Solde')}</dt><dd className={cn('font-bold', balance > 0 ? 'text-red-600' : 'text-green-600')} data-testid="invoice-balance">{fmtUsd(balance)}</dd></div>
        </dl>
        {totalMoney.secondary ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="invoice-total-secondary">{t('Also', 'أيضاً', 'Aussi')}: {totalMoney.secondary}</p>
        ) : null}
        {tvaNumber && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="invoice-tva-number">{ti('tvaRegistered', { number: tvaNumber })}</p>
        )}
      </div>

      {/* WA-INVOICE: WhatsApp send/remind + handoff trace (owner+reception, collectible). */}
      {showWa && waPayload && (
        <InvoiceWhatsApp
          invoiceId={inv.id}
          phone={waPayload.phone}
          dueMessage={waPayload.dueBody}
          reminderMessage={waPayload.reminderBody}
          title={ti('waTitle')}
          sendInvoiceLabel={ti('waSendInvoice')}
          sendReminderLabel={ti('waSendReminder')}
          disclaimer={ti('waDisclaimer')}
          noPhone={ti(waPayload.targetKind === 'payer' ? 'waNoPhonePayer' : 'waNoPhoneMember')}
          traceInvoice={waTrace.invoice}
          traceReminder={waTrace.reminder}
          traceNone={ti('waTraceNone')}
        />
      )}

      {/* Settlement */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">{t('Record a payment', 'تسجيل دفعة', 'Enregistrer un paiement')}</h2>
        <PaymentForm
          locale={locale}
          canDiscount={canDiscount}
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
              <thead><tr className="border-b bg-muted/50 text-start">
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
