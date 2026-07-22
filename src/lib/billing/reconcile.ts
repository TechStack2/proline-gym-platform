/**
 * Billing reconcile helpers (Cycle 5 / Phase 1 / D1).
 *
 * Pure, shared by the staff /invoices surfaces, the receipt, and portal/billing.
 * The invoice's settled state is ALWAYS derived from Σ payments.amount_usd vs
 * total_usd (canonical = USD; LBP rides along for the receipt). The DB enforces
 * the same rule atomically in record_payment — these mirror it for display.
 */
export const EPSILON = 0.01
// LBP is a whole-piastre currency with huge magnitudes — sub-1 LBP is noise.
export const EPSILON_LBP = 1

type PaymentLike = { amount_usd: number | null; amount_lbp?: number | null }

export function paidUsd(payments: PaymentLike[] | null | undefined): number {
  return (payments ?? []).reduce((s, p) => s + Number(p.amount_usd ?? 0), 0)
}

export function balanceUsd(totalUsd: number | null, payments: PaymentLike[] | null | undefined): number {
  const bal = Number(totalUsd ?? 0) - paidUsd(payments)
  return bal < EPSILON ? 0 : Math.round(bal * 100) / 100
}

// MONEY-LBP — the LBP twin of paidUsd/balanceUsd. Both figures ride the SAME payment
// rows (amount_usd + amount_lbp are recorded together), so a refund's negative LBP and
// a discount's net LBP net here for free — nothing signs or converts. An invoice with
// no LBP total (USD-priced) yields a 0 LBP balance.
export function paidLbp(payments: PaymentLike[] | null | undefined): number {
  return (payments ?? []).reduce((s, p) => s + Number(p.amount_lbp ?? 0), 0)
}

export function balanceLbp(totalLbp: number | null, payments: PaymentLike[] | null | undefined): number {
  const bal = Number(totalLbp ?? 0) - paidLbp(payments)
  return bal < EPSILON_LBP ? 0 : Math.round(bal)
}

// PORTAL-BALANCE — the ONE source of truth for "what does this member owe".
// The portal HOME tile used to sum raw total_usd over ['pending','overdue'] —
// omitting 'partial' AND ignoring payments — while portal/billing netted
// correctly: a part-paid member saw "$0 / settled" on home and a real balance
// on the billing tab. Both surfaces now compute through here.
export const OPEN_INVOICE_STATUSES = ['pending', 'partial', 'overdue'] as const

type OutstandingInvoice = { id: string; status: string; total_usd: number | null; total_lbp?: number | null }
type LinkedPayment = { invoice_id: string | null; amount_usd: number | null; amount_lbp?: number | null }

/** Σ amount_usd per invoice_id (unlinked payments are ignored). */
export function paidByInvoice(payments: LinkedPayment[] | null | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  }
  return map
}

/** Σ amount_lbp per invoice_id (the LBP twin of paidByInvoice). */
export function paidLbpByInvoice(payments: LinkedPayment[] | null | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount_lbp ?? 0))
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

/** MONEY-LBP — net LBP outstanding = Σ over OPEN invoices of (total_lbp − its LBP
 *  payments). Only LBP-denominated invoices contribute; a USD-priced invoice
 *  (total_lbp 0/null) adds nothing. Honest, never cross-converted. */
export function outstandingLbp(
  invoices: OutstandingInvoice[] | null | undefined,
  payments: LinkedPayment[] | null | undefined,
): number {
  const paid = paidLbpByInvoice(payments)
  let sum = 0
  for (const inv of invoices ?? []) {
    if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status)) continue
    sum += balanceLbp(inv.total_lbp ?? 0, [{ amount_usd: 0, amount_lbp: paid.get(inv.id) ?? 0 }])
  }
  return Math.round(sum)
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

// CANCEL-FLOW: 'void' is a DISPLAY pseudo-status — a voided invoice is stored as
// status='cancelled' + voided_at set. Call sites pass `inv.voided_at ? 'void' : inv.status`.
export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'partial' | 'void'

/** Map a raw invoice status + voided_at to the DISPLAY status ('void' when voided). */
export function displayInvoiceStatus(status: string, voidedAt: string | null | undefined): string {
  return voidedAt ? 'void' : status
}

// W3b (DA-25/32): the STATUS_BADGE colour map is DEAD — invoice status colour is
// the status vocabulary's call (`statusEntry('invoice', …)` via StatusChip); the
// light-pinned -100 pills it carried were the dark-mode breakage class. Labels
// below stay: callers pass them to StatusChip as the historical-text override.
export function statusLabel(status: string, locale: string): string {
  const ar: Record<string, string> = { paid: 'مدفوع', pending: 'معلق', partial: 'جزئي', overdue: 'متأخر', cancelled: 'ملغي', refunded: 'مسترجع', void: 'ملغاة' }
  const en: Record<string, string> = { paid: 'Paid', pending: 'Pending', partial: 'Partial', overdue: 'Overdue', cancelled: 'Cancelled', refunded: 'Refunded', void: 'Void' }
  const fr: Record<string, string> = { paid: 'Payée', pending: 'En attente', partial: 'Partielle', overdue: 'En retard', cancelled: 'Annulée', refunded: 'Remboursée', void: 'Annulée' }
  return (locale === 'ar' ? ar : locale === 'fr' ? fr : en)[status] || status
}

// INV-LABEL — the invoice's product type, localized + pill-styled (display only;
// the type is written by the issuing RPCs). Same locale-param shape as statusLabel.
// W3b (DA-25): a product type is a CATEGORY, not a status — the pill wears the
// DISC-COLOR `cat-tint` layer (`.cat-tint` + `data-cat`, dark-correct by
// construction) instead of the light-pinned per-hue -100 map it had.
export const INVOICE_TYPE_CAT: Record<string, string> = {
  membership: '1',
  class_registration: '2',
  camp: '3',
  rental: '4',
  pt_package: '5',
  pt_session: '6',
  event: '7',
  other: '8',
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
