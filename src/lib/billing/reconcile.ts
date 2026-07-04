/**
 * Billing reconcile helpers (Cycle 5 / Phase 1 / D1).
 *
 * Pure, shared by the staff /invoices surfaces, the receipt, and portal/billing.
 * The invoice's settled state is ALWAYS derived from Σ payments.amount_usd vs
 * total_usd (canonical = USD; LBP rides along for the receipt). The DB enforces
 * the same rule atomically in record_payment — these mirror it for display.
 */
export const EPSILON = 0.01

type PaymentLike = { amount_usd: number | null }

export function paidUsd(payments: PaymentLike[] | null | undefined): number {
  return (payments ?? []).reduce((s, p) => s + Number(p.amount_usd ?? 0), 0)
}

export function balanceUsd(totalUsd: number | null, payments: PaymentLike[] | null | undefined): number {
  const bal = Number(totalUsd ?? 0) - paidUsd(payments)
  return bal < EPSILON ? 0 : Math.round(bal * 100) / 100
}

// PORTAL-BALANCE — the ONE source of truth for "what does this member owe".
// The portal HOME tile used to sum raw total_usd over ['pending','overdue'] —
// omitting 'partial' AND ignoring payments — while portal/billing netted
// correctly: a part-paid member saw "$0 / settled" on home and a real balance
// on the billing tab. Both surfaces now compute through here.
export const OPEN_INVOICE_STATUSES = ['pending', 'partial', 'overdue'] as const

type OutstandingInvoice = { id: string; status: string; total_usd: number | null }
type LinkedPayment = { invoice_id: string | null; amount_usd: number | null }

/** Σ amount_usd per invoice_id (unlinked payments are ignored). */
export function paidByInvoice(payments: LinkedPayment[] | null | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }
  return map
}

/** Net outstanding = Σ over OPEN invoices of (total − its payments), in cents-rounded USD. */
export function outstandingUsd(
  invoices: OutstandingInvoice[] | null | undefined,
  payments: LinkedPayment[] | null | undefined,
): number {
  const paid = paidByInvoice(payments)
  let sum = 0
  for (const inv of invoices ?? []) {
    if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status)) continue
    sum += balanceUsd(inv.total_usd, [{ amount_usd: paid.get(inv.id) ?? 0 }])
  }
  return Math.round(sum * 100) / 100
}

type NameRow = {
  first_name_ar?: string | null; first_name_en?: string | null; first_name_fr?: string | null
  last_name_ar?: string | null; last_name_en?: string | null; last_name_fr?: string | null
} | null | undefined

/** Localized "First Last" from a profiles row. */
export function localizedName(p: NameRow, locale: string): string {
  if (!p) return ''
  const first = locale === 'ar' ? p.first_name_ar : locale === 'fr' ? p.first_name_fr : p.first_name_en
  const last = locale === 'ar' ? p.last_name_ar : locale === 'fr' ? p.last_name_fr : p.last_name_en
  return [first || p.first_name_en, last || p.last_name_en].filter(Boolean).join(' ')
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'partial'

export const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-orange-100 text-orange-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  refunded: 'bg-blue-100 text-blue-700',
}

export function statusLabel(status: string, locale: string): string {
  const ar: Record<string, string> = { paid: 'مدفوع', pending: 'معلق', partial: 'جزئي', overdue: 'متأخر', cancelled: 'ملغي', refunded: 'مسترجع' }
  const en: Record<string, string> = { paid: 'Paid', pending: 'Pending', partial: 'Partial', overdue: 'Overdue', cancelled: 'Cancelled', refunded: 'Refunded' }
  const fr: Record<string, string> = { paid: 'Payée', pending: 'En attente', partial: 'Partielle', overdue: 'En retard', cancelled: 'Annulée', refunded: 'Remboursée' }
  return (locale === 'ar' ? ar : locale === 'fr' ? fr : en)[status] || status
}

// INV-LABEL — the invoice's product type, localized + pill-styled (display only;
// the type is written by the issuing RPCs). Same locale-param shape as statusLabel.
export const INVOICE_TYPE_BADGE: Record<string, string> = {
  membership: 'bg-indigo-100 text-indigo-700',
  class_registration: 'bg-sky-100 text-sky-700',
  pt_package: 'bg-purple-100 text-purple-700',
  pt_session: 'bg-fuchsia-100 text-fuchsia-700',
  camp: 'bg-amber-100 text-amber-700',
  rental: 'bg-teal-100 text-teal-700',
  event: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
}

export function invoiceTypeLabel(type: string | null | undefined, locale: string): string {
  const t = type || 'other'
  const ar: Record<string, string> = { membership: 'اشتراك', class_registration: 'حصة', pt_package: 'باقة تدريب خاص', pt_session: 'حصة تدريب خاص', camp: 'مخيم', rental: 'إيجار', event: 'فعالية', other: 'أخرى' }
  const en: Record<string, string> = { membership: 'Membership', class_registration: 'Class', pt_package: 'PT Package', pt_session: 'PT Session', camp: 'Camp', rental: 'Rental', event: 'Event', other: 'Other' }
  const fr: Record<string, string> = { membership: 'Abonnement', class_registration: 'Cours', pt_package: 'Pack PT', pt_session: 'Séance PT', camp: 'Camp', rental: 'Location', event: 'Événement', other: 'Autre' }
  return (locale === 'ar' ? ar : locale === 'fr' ? fr : en)[t] || en[t] || t
}

/** The locale-appropriate descriptive note (e.g. "Class: Muay Thai Beginner"),
 *  falling back to the English note, else null (caller shows the type badge alone). */
export function invoiceNote(
  inv: { notes_ar?: string | null; notes_en?: string | null; notes_fr?: string | null } | null | undefined,
  locale: string,
): string | null {
  if (!inv) return null
  const n = locale === 'ar' ? inv.notes_ar : locale === 'fr' ? inv.notes_fr : inv.notes_en
  return n || inv.notes_en || null
}

export const METHOD_LABEL: Record<string, { en: string; ar: string; fr: string }> = {
  cash_usd: { en: 'Cash (USD)', ar: 'نقداً (دولار)', fr: 'Espèces (USD)' },
  cash_lbp: { en: 'Cash (LBP)', ar: 'نقداً (ليرة)', fr: 'Espèces (LBP)' },
  omt: { en: 'OMT', ar: 'OMT', fr: 'OMT' },
  whish: { en: 'Whish', ar: 'Whish', fr: 'Whish' },
  bank_transfer: { en: 'Bank transfer', ar: 'تحويل مصرفي', fr: 'Virement bancaire' },
  bob_finance: { en: 'BOB Finance', ar: 'BOB Finance', fr: 'BOB Finance' },
}
