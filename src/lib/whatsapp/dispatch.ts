import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from './crypto'
import { sendWhatsApp } from './provider'
import { toE164Digits } from './link'

/**
 * G1-full dispatch (server-side, best-effort). If the gym is ACTIVE with creds:
 * enqueue an outbound_messages row + call the provider (record/live). On any
 * other gym: NO-OP — the in-app notification + the wa.me bridge remain the path.
 * NEVER throws: a WhatsApp failure must never roll back the primary write or the
 * in-app notification (the GRW-1 lesson). Reads creds via the service-role
 * client (the token column is unreadable by the client).
 */
export async function dispatchWhatsApp(
  gymId: string, toPhone: string | null | undefined, template: string, body: string,
  // DUNNING-AUTO: when set, stamps the outbound row's dedup_key (partial-unique) so
  // the same reminder is never queued twice. The auto-dun reader already excludes
  // sent keys; this is the atomic backstop against a concurrent double-send.
  dedupKey?: string,
): Promise<{ dispatched: boolean; status?: 'sent' | 'failed'; deduped?: boolean }> {
  try {
    if (!toPhone) return { dispatched: false }
    const admin = createAdminClient()
    const { data: cfg } = await admin
      .from('gym_whatsapp_config')
      .select('status, access_token, phone_number_id, default_country_code')
      .eq('gym_id', gymId).maybeSingle()
    if (!cfg || cfg.status !== 'active' || !cfg.access_token || !cfg.phone_number_id) {
      return { dispatched: false } // inactive gym → no-op
    }
    const toDigits = toE164Digits(toPhone, cfg.default_country_code ?? '961')
    const { data: row, error: insErr } = await admin
      .from('outbound_messages')
      .insert({ gym_id: gymId, to_phone: toDigits, body, template, status: 'queued', dedup_key: dedupKey ?? null })
      .select('id').single()
    // A dedup_key collision (23505 on the partial-unique index) means this exact
    // reminder was already queued by a concurrent run → skip, don't double-send.
    if (insErr) return { dispatched: false, deduped: !!dedupKey }
    if (!row) return { dispatched: false }

    let token = ''
    try { token = decryptToken(cfg.access_token) } catch { /* unreadable ciphertext */ }
    const res = token
      ? await sendWhatsApp({ phoneNumberId: cfg.phone_number_id, accessToken: token, toDigits, body })
      : { ok: false as const, error: 'token unreadable' }
    const status: 'sent' | 'failed' = res.ok ? 'sent' : 'failed'
    if (row) {
      await admin.from('outbound_messages')
        .update({ status, error: res.ok ? null : (res as { error: string }).error, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
    return { dispatched: true, status }
  } catch {
    return { dispatched: false } // best-effort — swallow everything
  }
}
