/**
 * WA-INVOICE (finding 4) — the prefilled WhatsApp message for a due invoice.
 *
 * Two staff actions ("Send invoice" / "Send reminder") open the staff member's own
 * WhatsApp (the G1 wa.me bridge — no Meta Cloud API in this slice) with a message
 * addressed to the member. The message body is written in the MEMBER's locale (not
 * the staff UI locale — the receipt page's staff-locale shortcut is the wrong
 * pattern; follow registration-actions.ts), signs with the gym's display name, and
 * links to the member-portal invoice surface built on the gym's CANONICAL host
 * (gymCanonicalOrigin — Proline links must read on the gym's own domain, never
 * SITE_URL guesswork).
 *
 * For a guardian-billed invoice (payer_profile_id set) the message goes to the
 * PAYER (the guardian) — the family model already stamps the payer; we resolve the
 * payer's phone/locale/name, falling back to the student for a self-paying member.
 *
 * `composeInvoiceWa` is the PURE source of truth for the bodies (exercised by the
 * unit guard). The detail page uses `buildInvoiceWaPayload` (fetches one invoice);
 * the outstanding list composes per already-fetched row with a shared origin — both
 * route through composeInvoiceWa, so the rendered href and the logged body match.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fmtLbpCompact } from '@/lib/fmt'
import { getTranslations } from 'next-intl/server'
import { gymCanonicalOrigin } from '@/lib/host/primary-domain'
import { gymDisplayName, type MessagingGym } from '@/lib/whatsapp/identity'
import { balanceUsd, invoiceNote, invoiceTypeLabel } from '@/lib/billing/reconcile'

export type Loc = 'ar' | 'en' | 'fr'
export const asLoc = (l: string | null | undefined): Loc => (l === 'ar' ? 'ar' : l === 'fr' ? 'fr' : 'en')
export const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null))

export type ProfileRow = {
  first_name_ar?: string | null; first_name_en?: string | null; first_name_fr?: string | null
  phone?: string | null; locale?: string | null
}

function firstName(p: ProfileRow | null, l: Loc): string {
  const localized = p ? (l === 'ar' ? p.first_name_ar : l === 'fr' ? p.first_name_fr : p.first_name_en) : null
  return (localized || p?.first_name_en || '').trim()
}

/** The invoice's due-amount parts, formatted the same way the receipt template is:
 *  "{usd}" is the balance; "{lbp}" is a " / N LBP" suffix (or '') derived from the
 *  invoice's own stored exchange_rate, never a hardcoded rate. */
export function invoiceDueParts(balanceUsdVal: number, exchangeRate: number | null | undefined) {
  const usd = balanceUsdVal.toFixed(2)
  const rate = exchangeRate != null ? Number(exchangeRate) : 0
  const lbp = rate > 0 ? ` / ${fmtLbpCompact(balanceUsdVal * rate)}` : ''
  return { usd, lbp }
}

type NotesRow = { notes_ar?: string | null; notes_en?: string | null; notes_fr?: string | null }
type ComposeGym = (MessagingGym & { slug?: string | null }) | null

/**
 * PURE composition of the two localized bodies + the resolved recipient phone from
 * already-fetched row data. `origin` is the gym's canonical origin (resolved once by
 * the caller). No I/O — the unit guard proves the placeholder + encoding wiring here.
 */
export function composeInvoiceWa(
  tw: (key: string, vars: Record<string, string>) => string,
  args: {
    gym: ComposeGym
    target: ProfileRow | null
    locale: string
    origin: string
    invoiceNumber: string
    invoiceType: string | null | undefined
    notes: NotesRow
    balanceUsd: number
    exchangeRate: number | null | undefined
  },
): { phone: string | null; due: string; reminder: string } {
  const loc = asLoc(args.locale)
  const label = invoiceNote(args.notes, loc) || invoiceTypeLabel(args.invoiceType, loc)
  const { usd, lbp } = invoiceDueParts(args.balanceUsd, args.exchangeRate)
  const vars = {
    name: firstName(args.target, loc),
    gym: gymDisplayName(args.gym, loc),
    number: args.invoiceNumber,
    label,
    usd,
    lbp,
    link: `${args.origin}/${loc}/portal/billing`,
  }
  return {
    phone: args.target?.phone?.trim() || null,
    due: tw('tmpl.invoiceDue', vars),
    reminder: tw('tmpl.invoiceReminder', vars),
  }
}

export type InvoiceWaPayload = {
  gymId: string
  invoiceNumber: string
  phone: string | null
  /** which party the message is addressed to — drives the no-phone guidance copy */
  targetKind: 'member' | 'payer'
  memberLocale: Loc
  balanceUsd: number
  dueBody: string
  reminderBody: string
}

/**
 * Resolve the WhatsApp payload for one invoice (the detail page + the log action):
 * recipient (payer when guardian-billed, else the member), the member-locale bodies,
 * the amount due, and the canonical-host portal link. Returns null if the invoice is
 * gone; `phone` is null when the recipient has no number on file.
 */
export async function buildInvoiceWaPayload(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceWaPayload | null> {
  const { data: inv } = await supabase
    .from('invoices')
    .select(`id, invoice_number, invoice_type, total_usd, total_lbp, exchange_rate,
      notes_en, notes_ar, notes_fr, payer_profile_id, gym_id,
      gyms(slug, name_ar, name_en, name_fr),
      students(profiles(first_name_ar, first_name_en, first_name_fr, phone, locale)),
      payer:profiles!invoices_payer_profile_id_fkey(first_name_ar, first_name_en, first_name_fr, phone, locale)`)
    .eq('id', invoiceId)
    .maybeSingle()
  if (!inv) return null

  const { data: payments } = await supabase
    .from('payments').select('amount_usd').eq('invoice_id', invoiceId)
  const balance = balanceUsd((inv as { total_usd: number | null }).total_usd, (payments ?? []) as { amount_usd: number | null }[])

  const invoice = inv as Record<string, unknown>
  const studentProfile = one<ProfileRow>((one<{ profiles: ProfileRow | ProfileRow[] }>(invoice.students as never) || { profiles: null }).profiles)
  const payerProfile = one<ProfileRow>(invoice.payer as never)
  const isGuardianBilled = !!invoice.payer_profile_id
  const target = isGuardianBilled ? payerProfile : studentProfile

  const memberLocale = asLoc(target?.locale)
  const tw = await getTranslations({ locale: memberLocale, namespace: 'whatsapp' })
  const gym = one<ComposeGym>(invoice.gyms as never)
  const origin = await gymCanonicalOrigin(gym?.slug)

  const composed = composeInvoiceWa(tw, {
    gym,
    target,
    locale: memberLocale,
    origin,
    invoiceNumber: invoice.invoice_number as string,
    invoiceType: invoice.invoice_type as string | null,
    notes: invoice as NotesRow,
    balanceUsd: balance,
    exchangeRate: invoice.exchange_rate as number | null,
  })

  return {
    gymId: invoice.gym_id as string,
    invoiceNumber: invoice.invoice_number as string,
    phone: composed.phone,
    targetKind: isGuardianBilled ? 'payer' : 'member',
    memberLocale,
    balanceUsd: balance,
    dueBody: composed.due,
    reminderBody: composed.reminder,
  }
}
