import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { balanceUsd, localizedName, statusLabel, STATUS_BADGE } from '@/lib/billing/reconcile'
import { PaymentForm } from '../components/payment-form'

export const dynamic = 'force-dynamic'

type Props = { params: { locale: string }; searchParams: { invoice?: string } }

/**
 * Record a payment (D1). The settlement is invoice-targeted: pick an open
 * invoice, then the form calls record_payment. With `?invoice=<id>` it renders
 * the form directly (the invoice detail's "Record payment" deep-links here too).
 */
export default async function NewPaymentPage({ params: { locale }, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const supabase = await createClient()

  if (searchParams.invoice) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_usd, status, exchange_rate')
      .eq('id', searchParams.invoice)
      .maybeSingle()
    const { data: pays } = await supabase.from('payments').select('amount_usd').eq('invoice_id', searchParams.invoice)
    if (inv) {
      return (
        <div className={`space-y-6 p-6 ${isRTL ? 'rtl text-right' : ''}`}>
          <h1 className="text-3xl font-bold tracking-tight">{t('Record payment', 'تسجيل دفعة', 'Enregistrer le paiement')} · {inv.invoice_number}</h1>
          <PaymentForm
            locale={locale}
            invoice={{
              id: inv.id, invoice_number: inv.invoice_number, total_usd: Number(inv.total_usd),
              balance_usd: balanceUsd(inv.total_usd, pays as any), status: inv.status,
              exchange_rate: inv.exchange_rate != null ? Number(inv.exchange_rate) : null,
            }}
          />
        </div>
      )
    }
  }

  // No invoice chosen → list still-collectible invoices.
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`id, invoice_number, total_usd, status, student_id,
      students(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr))`)
    .in('status', ['pending', 'partial', 'overdue'])
    .order('created_at', { ascending: false })
    .limit(100)

  const list = invoices ?? []
  const ids = list.map((i) => i.id)
  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }
  const paidBy = new Map<string, number>()
  for (const p of pays ?? []) paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))

  return (
    <div className={`space-y-6 p-6 ${isRTL ? 'rtl text-right' : ''}`}>
      <h1 className="text-3xl font-bold tracking-tight">{t('Record payment', 'تسجيل دفعة', 'Enregistrer le paiement')}</h1>
      <p className="text-muted-foreground">{t('Pick an open invoice to settle.', 'اختر فاتورة مفتوحة للتسوية.', 'Choisissez une facture ouverte à régler.')}</p>
      {list.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{t('No open invoices.', 'لا فواتير مفتوحة.', 'Aucune facture ouverte.')}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {list.map((inv: any) => {
                const profRow = inv.students?.profiles
                const profile = Array.isArray(profRow) ? profRow[0] : profRow
                const bal = balanceUsd(inv.total_usd, [{ amount_usd: paidBy.get(inv.id) ?? 0 }])
                return (
                  <tr key={inv.id} className="border-b hover:bg-muted/40">
                    <td className="p-3">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono font-medium text-[#cd1419] hover:underline">{inv.invoice_number}</Link>
                    </td>
                    <td className="p-3">{localizedName(profile, locale)}</td>
                    <td className="p-3 font-medium text-red-600">${bal.toFixed(2)}</td>
                    <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status]}`}>{statusLabel(inv.status, locale)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
