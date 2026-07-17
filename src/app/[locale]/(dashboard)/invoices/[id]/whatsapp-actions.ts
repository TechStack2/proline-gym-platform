'use server'

/**
 * WA-INVOICE · R3 — the honesty trail. When staff click "Send invoice" / "Send
 * reminder", the wa.me link opens WhatsApp (the browser does that); this action
 * records the HANDOFF so the invoice can show "sent 2×, last Tuesday". It is NOT a
 * delivery claim — a deep link can't confirm receipt (the UI copy says so).
 *
 * No migration (per the slice's no-schema-change constraint): the existing
 * `message_logs` table (000003) is the only staff-writable log surface — its
 * `message_logs_staff` policy is `FOR ALL USING (gym_id = get_user_gym_id() AND
 * is_staff())`, so a request-scoped (authenticated) staff insert passes RLS. It
 * carries channel/status enums, recipient_phone, message_content, locale and
 * sent_at already. It has no invoice_id column, so the invoice linkage rides
 * `provider_message_id` (a nullable free-text ref — there is no provider message id
 * for a wa.me handoff, and nothing else writes this table today, so no collision).
 * template_name carries the kind: 'invoice_due' | 'invoice_reminder'.
 *
 * The body is re-derived server-side from buildInvoiceWaPayload (the same source of
 * truth the button's href uses) so the logged content is exactly what was handed off
 * and the client can't forge it.
 */
import { createClient } from '@/lib/supabase/server'
import { buildInvoiceWaPayload } from './wa-message'

export type LogResult = { ok: boolean }

const KINDS = ['invoice_due', 'invoice_reminder'] as const
type Kind = (typeof KINDS)[number]

export async function logInvoiceWhatsApp(invoiceId: string, kind: Kind): Promise<LogResult> {
  if (!KINDS.includes(kind)) return { ok: false }
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  // Owner + reception only (mirrors the money workspace + the canDiscount gate). The
  // RLS FOR ALL policy would also let a head coach write; the app narrows it to the
  // two billing roles that own this affordance.
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!['owner', 'receptionist'].includes((roleRow as { role?: string } | null)?.role ?? '')) {
    return { ok: false }
  }

  const payload = await buildInvoiceWaPayload(supabase, invoiceId)
  if (!payload || !payload.phone) return { ok: false } // nothing handed off without a number

  const body = kind === 'invoice_reminder' ? payload.reminderBody : payload.dueBody

  const { error } = await supabase.from('message_logs').insert({
    gym_id: payload.gymId,
    recipient_phone: payload.phone,
    channel: 'whatsapp',
    template_name: kind,
    provider_message_id: invoiceId, // repurposed as the invoice ref (no invoice_id column)
    message_content: body,
    locale: payload.memberLocale,
    status: 'sent', // handed to WhatsApp — NOT 'delivered'/'read'
    sent_at: new Date().toISOString(),
  })
  if (error) return { ok: false }
  return { ok: true }
}
