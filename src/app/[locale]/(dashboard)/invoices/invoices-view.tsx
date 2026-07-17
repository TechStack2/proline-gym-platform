import { dateLocale } from '@/lib/utils/locale-format'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Plus, FileText } from 'lucide-react'
import { balanceUsd, localizedName, STATUS_BADGE, statusLabel, displayInvoiceStatus, METHOD_LABEL, INVOICE_TYPE_BADGE, invoiceTypeLabel, invoiceNote } from '@/lib/billing/reconcile'
import { gymCanonicalOrigin } from '@/lib/host/primary-domain'
import { composeInvoiceWa, one, asLoc } from './[id]/wa-message'
import { InvoiceRowWa } from './invoice-row-wa'

type Props = { locale: string; searchParams: { search?: string; status?: string; aging?: string } }

// FIN-1: days-past-due → aging bucket (matches getOutstandingAging).
function agingBucket(dueDate: string | null, today: string): string {
  if (!dueDate) return 'current'
  if (dueDate >= today) return 'current'
  const days = Math.floor((new Date(today + 'T12:00:00Z').getTime() - new Date(dueDate + 'T12:00:00Z').getTime()) / 864e5)
  return days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : 'd60_plus'
}

/**
 * /invoices (D1 repair). The as-is page was DOA — it queried students.first_name
 * (name lives on profiles), invoice.issue_date (the column is created_at), and an
 * embedded PostgREST .or() across a join (unsupported). Rebuilt against the real
 * schema with the canonical reconcile: status + balance are derived from
 * Σ payments. Adds an outstanding-balances summary and a per-method daily tally
 * (the cash drawer: USD/LBP/OMT/Whish/…).
 */
export async function InvoicesView({ locale, searchParams }: Props) {
  const isRTL = locale === 'ar'
  const t = (en: string, ar: string, fr: string) => (locale === 'ar' ? ar : locale === 'fr' ? fr : en)
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, notes_en, notes_ar, notes_fr, total_usd, total_lbp, exchange_rate, status, voided_at, due_date, created_at, student_id, payer_profile_id, gym_id,
      gyms(slug, name_ar, name_en, name_fr),
      students(profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, locale)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, phone, locale)`)
    .order('created_at', { ascending: false })
    .limit(100)

  const invList = invoices ?? []
  const ids = invList.map((i) => i.id)

  const { data: pays } = ids.length
    ? await supabase.from('payments').select('invoice_id, amount_usd').in('invoice_id', ids)
    : { data: [] as { invoice_id: string; amount_usd: number | null }[] }

  const paidByInvoice = new Map<string, number>()
  for (const p of pays ?? []) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }
  const balOf = (inv: { id: string; total_usd: number | null }) =>
    balanceUsd(inv.total_usd, [{ amount_usd: paidByInvoice.get(inv.id) ?? 0 }])

  // Outstanding = Σ balance over still-collectible invoices.
  const outstanding = invList
    .filter((i) => ['pending', 'partial', 'overdue'].includes(i.status))
    .reduce((s, i) => s + balOf(i), 0)

  // WA-INVOICE: per-row "Send invoice" / "Send reminder" for collectible rows, owner+
  // reception only. Compose the member-locale bodies from the already-fetched rows —
  // one canonical-origin resolve for the whole list, translators memoized per locale
  // (no per-row invoice re-fetch). The chip labels below are the staff-locale `ti`.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: roleRow } = user
    ? await supabase.from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
    : { data: null }
  const canSendWa = ['owner', 'receptionist'].includes((roleRow as { role?: string } | null)?.role ?? '')
  const ti = await getTranslations({ locale, namespace: 'invoices' })

  const waByInvoice = new Map<string, { phone: string | null; due: string; reminder: string }>()
  if (canSendWa) {
    const gymSlug = one<{ slug?: string | null }>((invList.find((i: any) => i.gyms) as any)?.gyms)?.slug ?? null
    const origin = await gymCanonicalOrigin(gymSlug)
    const twCache = new Map<string, (k: string, v: Record<string, string>) => string>()
    const twFor = async (loc: string | null | undefined) => {
      const key = asLoc(loc)
      if (!twCache.has(key)) {
        twCache.set(key, (await getTranslations({ locale: key, namespace: 'whatsapp' })) as unknown as (k: string, v: Record<string, string>) => string)
      }
      return twCache.get(key)!
    }
    const collectible = invList.filter((i: any) => ['pending', 'partial', 'overdue'].includes(i.status) && balOf(i) > 0.005)
    await Promise.all(collectible.map(async (inv: any) => {
      const target = inv.payer_profile_id ? one<any>(inv.payer) : one<any>(one<any>(inv.students)?.profiles)
      const tw = await twFor(target?.locale)
      waByInvoice.set(inv.id, composeInvoiceWa(tw, {
        gym: one<any>(inv.gyms),
        target,
        locale: asLoc(target?.locale),
        origin,
        invoiceNumber: inv.invoice_number,
        invoiceType: inv.invoice_type,
        notes: inv,
        balanceUsd: balOf(inv),
        exchangeRate: inv.exchange_rate,
      }))
    }))
  }

  // Per-method daily tally (today's drawer).
  const today = new Date().toISOString().slice(0, 10)
  // QUICK-WINS #4b: the identical future-payment bug as #1 (daily-tally) — bound the
  // drawer to a true same-day window [today, tomorrow). A naked .limit() would instead
  // truncate a busy day and undercount the drawer, so the window is the correct bound.
  const nextDay = new Date(`${today}T00:00:00.000Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const tomorrow = nextDay.toISOString().slice(0, 10)
  const { data: todayPays } = await supabase
    .from('payments')
    .select('amount_usd, amount_lbp, payment_method')
    .gte('payment_date', today)
    .lt('payment_date', tomorrow)
  const tally = new Map<string, { usd: number; lbp: number }>()
  for (const p of (todayPays ?? []) as any[]) {
    const cur = tally.get(p.payment_method) ?? { usd: 0, lbp: 0 }
    cur.usd += Number(p.amount_usd ?? 0)
    cur.lbp += Number(p.amount_lbp ?? 0)
    tally.set(p.payment_method, cur)
  }

  const search = (searchParams.search ?? '').toLowerCase()
  const statusFilter = searchParams.status ?? ''
  const agingFilter = searchParams.aging ?? '' // FIN-1 aging drill-down
  const filtered = invList.filter((inv: any) => {
    const profRow = inv.students?.profiles
    const profile = Array.isArray(profRow) ? profRow[0] : profRow
    const name = localizedName(profile, locale).toLowerCase()
    const matchSearch = !search || name.includes(search) || (inv.invoice_number || '').toLowerCase().includes(search)
    const matchStatus = !statusFilter || inv.status === statusFilter
    // Aging drill-down: only open invoices, in the selected days-past-due bucket.
    const isOpen = ['pending', 'partial', 'overdue'].includes(inv.status)
    const matchAging = !agingFilter || (isOpen && balOf(inv) > 0 && agingBucket(inv.due_date, today) === agingFilter)
    return matchSearch && matchStatus && matchAging
  })

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(locale)) : '—')

  return (
    <div className={cn('space-y-6', isRTL && 'rtl text-right')}>
      <div className="flex items-center justify-end">
        <Link href={`/${locale}/invoices/new`} data-testid="new-invoice-btn"
          className="inline-flex items-center rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-800">
          <Plus className="me-2 h-4 w-4" /> {t('New invoice', 'فاتورة جديدة', 'Nouvelle facture')}
        </Link>
      </div>

      {/* Outstanding + daily tally */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('Outstanding balance', 'الرصيد المستحق', 'Solde impayé')}</p>
          <p className="mt-1 text-2xl font-bold text-red-600" data-testid="outstanding-total">${outstanding.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm sm:col-span-2">
          <p className="mb-2 text-xs text-muted-foreground">{t("Today's collections (by method)", 'تحصيلات اليوم (حسب الطريقة)', 'Encaissements du jour (par méthode)')}</p>
          <div className="flex flex-wrap gap-3 text-sm" data-testid="daily-tally">
            {tally.size === 0 ? (
              <span className="text-muted-foreground">{t('No payments today.', 'لا مدفوعات اليوم.', "Aucun paiement aujourd'hui.")}</span>
            ) : (
              [...tally.entries()].map(([method, v]) => (
                <span key={method} className="rounded-full bg-muted px-3 py-1">
                  {(locale === 'ar' ? METHOD_LABEL[method]?.ar : locale === 'fr' ? METHOD_LABEL[method]?.fr : METHOD_LABEL[method]?.en) || method}: ${v.usd.toFixed(2)}{v.lbp ? ` · ${v.lbp.toLocaleString()} LBP` : ''}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <form className="flex gap-2" action={`/${locale}/money`} method="get">
        <input type="hidden" name="tab" value="invoices" />
        <input name="search" defaultValue={searchParams.search ?? ''} placeholder={t('Search name or number…', 'ابحث بالاسم أو الرقم…', 'Rechercher par nom ou numéro…')}
          className="h-9 flex-1 rounded-md border px-3 text-sm" data-testid="invoice-search" />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">{t('Search', 'بحث', 'Rechercher')}</button>
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <FileText className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm text-muted-foreground">{t('No invoices found.', 'لا توجد فواتير.', 'Aucune facture trouvée.')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-start">
              <th className="p-3">{t('Number', 'الرقم', 'Numéro')}</th><th className="p-3">{t('Member', 'العضو', 'Membre')}</th>
              <th className="p-3">{t('Total', 'الإجمالي', 'Total')}</th><th className="p-3">{t('Balance', 'الرصيد', 'Solde')}</th>
              <th className="p-3">{t('Due', 'الاستحقاق', 'Échéance')}</th><th className="p-3">{t('Status', 'الحالة', 'Statut')}</th>
            </tr></thead>
            <tbody data-testid="invoice-list">
              {filtered.map((inv: any) => {
                const profRow = inv.students?.profiles
                const profile = Array.isArray(profRow) ? profRow[0] : profRow
                const bal = balOf(inv)
                return (
                  <tr key={inv.id} className="border-b hover:bg-muted/40" data-testid="invoice-row" data-invoice-number={inv.invoice_number}>
                    <td className="p-3">
                      <Link href={`/${locale}/invoices/${inv.id}`} className="font-mono font-medium text-primary-700 hover:underline">{inv.invoice_number}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span data-testid="invoice-type-badge" data-type={inv.invoice_type || 'other'}
                          className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', INVOICE_TYPE_BADGE[inv.invoice_type] || INVOICE_TYPE_BADGE.other)}>
                          {invoiceTypeLabel(inv.invoice_type, locale)}
                        </span>
                        {invoiceNote(inv, locale) && (
                          <span className="text-[11px] text-muted-foreground" data-testid="invoice-note">{invoiceNote(inv, locale)}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <Link href={`/${locale}/students/${inv.student_id}`} data-testid="invoice-member-link" className="hover:underline">
                        {localizedName(profile, locale)}
                      </Link>
                      {inv.payer_profile_id && (
                        <span className="block text-[10px] text-gray-400" data-testid="invoice-payer">
                          {t('Payer', 'الدافع', 'Payeur')}: {localizedName(Array.isArray(inv.payer) ? inv.payer[0] : inv.payer, locale)}
                        </span>
                      )}
                      {canSendWa && waByInvoice.has(inv.id) && (
                        <InvoiceRowWa
                          invoiceId={inv.id}
                          phone={waByInvoice.get(inv.id)!.phone}
                          dueMessage={waByInvoice.get(inv.id)!.due}
                          reminderMessage={waByInvoice.get(inv.id)!.reminder}
                          sendLabel={ti('waSendInvoice')}
                          remindLabel={ti('waSendReminder')}
                        />
                      )}
                    </td>
                    <td className="p-3 font-medium">${Number(inv.total_usd).toFixed(2)}</td>
                    <td className={cn('p-3 font-medium', bal > 0 ? 'text-red-600' : 'text-green-600')}>${bal.toFixed(2)}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(inv.due_date)}</td>
                    <td className="p-3"><span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[displayInvoiceStatus(inv.status, inv.voided_at)])}>{statusLabel(displayInvoiceStatus(inv.status, inv.voided_at), locale)}</span></td>
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
