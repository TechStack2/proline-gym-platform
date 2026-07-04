'use server'

/**
 * G1 WhatsApp settings actions. The token is encrypted (AES-GCM) and written via
 * the SERVICE-ROLE client so it never transits an RLS-readable path; the table
 * is REVOKED from the client (000055). Status is read via the SECURITY DEFINER
 * reader (no token). All gated on the caller's staff + gym.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/whatsapp/crypto'
import { dispatchWhatsApp } from '@/lib/whatsapp/dispatch'
import { whatsappTestBody, type MessagingGym } from '@/lib/whatsapp/identity'

const STAFF = ['owner', 'head_coach', 'receptionist']

async function staffGym(): Promise<{ userId: string; gymId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: role } = await supabase.from('user_roles').select('role, gym_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!role || !STAFF.includes(role.role)) return null
  return { userId: user.id, gymId: role.gym_id }
}

export type WhatsAppStatus = { status: string; configured: boolean; phoneNumberId: string | null; defaultCountryCode: string }

/** Read status (NO token) via the definer reader. */
export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const ctx = await staffGym()
  if (!ctx) return { status: 'not_configured', configured: false, phoneNumberId: null, defaultCountryCode: '961' }
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_whatsapp_status', { p_gym_id: ctx.gymId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    status: row?.status ?? 'not_configured',
    configured: !!row?.configured,
    phoneNumberId: row?.phone_number_id ?? null,
    defaultCountryCode: row?.default_country_code ?? '961',
  }
}

/** Save credentials — encrypts the token server-side; sets status from completeness. */
export async function saveWhatsAppConfig(input: {
  phoneNumberId: string; wabaId: string; accessToken: string; defaultCountryCode?: string
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const ctx = await staffGym()
  if (!ctx) return { ok: false, error: 'forbidden' }

  const phoneNumberId = input.phoneNumberId.trim()
  const wabaId = input.wabaId.trim()
  const token = input.accessToken.trim()
  // active when fully credentialed; pending if partial; never store plaintext token.
  const status = phoneNumberId && token ? 'active' : (phoneNumberId || wabaId || token) ? 'pending' : 'not_configured'

  const admin = createAdminClient()
  const { error } = await admin.from('gym_whatsapp_config').upsert({
    gym_id: ctx.gymId,
    status,
    phone_number_id: phoneNumberId || null,
    waba_id: wabaId || null,
    access_token: token ? encryptToken(token) : null,
    default_country_code: (input.defaultCountryCode || '961').replace(/\D/g, '') || '961',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'gym_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true, status }
}

/** Send a test message to a staff-provided number (best-effort; only when active). */
export async function sendWhatsAppTest(toPhone: string): Promise<{ ok: true; dispatched: boolean; status?: string } | { ok: false; error: string }> {
  const ctx = await staffGym()
  if (!ctx) return { ok: false, error: 'forbidden' }
  // WL-IDENTITY: sign the test message with the gym's own name (not "PRO LINE").
  const supabase = await createClient()
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', ctx.gymId).maybeSingle()
  const res = await dispatchWhatsApp(ctx.gymId, toPhone, 'test', whatsappTestBody(gymRow as MessagingGym | null))
  return { ok: true, dispatched: res.dispatched, status: res.status }
}
