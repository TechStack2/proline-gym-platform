'use server'

/**
 * SETTINGS-LIVE — save the gym profile (the Settings → Gym editor was an inert
 * stub). Staff-gated by RLS: the update rides the CALLER's client, and 000004's
 * `gyms_staff_own` (FOR ALL, `id = get_user_gym_id() AND is_staff()`) means a
 * non-staff caller — or any attempt at another gym's row — updates nothing.
 * No service role, no policy change.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type GymSettingsInput = {
  name_ar?: string
  name_en?: string
  name_fr?: string
  address_ar?: string
  address_en?: string
  address_fr?: string
  phone?: string
  email?: string
  website?: string
  timezone?: string
  currency_preference?: string
  // 000072 branding
  brand_color?: string
  hero_image_url?: string
  tagline_ar?: string
  tagline_en?: string
  tagline_fr?: string
}

const EDITABLE = [
  'name_ar', 'name_en', 'name_fr',
  'address_ar', 'address_en', 'address_fr',
  'phone', 'email', 'website', 'timezone', 'currency_preference',
  'brand_color', 'hero_image_url', 'tagline_ar', 'tagline_en', 'tagline_fr',
] as const

export async function saveGymSettings(
  input: GymSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Whitelist + trim; '' → NULL so clearing a field truly clears it.
  const payload: Record<string, string | null> = {}
  for (const key of EDITABLE) {
    const v = input[key]
    if (v === undefined) continue
    payload[key] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  if (Object.keys(payload).length === 0) return { ok: false, error: 'nothing_to_save' }

  if (payload.brand_color && !/^#[0-9a-fA-F]{6}$/.test(payload.brand_color)) {
    return { ok: false, error: 'invalid_color' }
  }
  if (payload.currency_preference && !['USD', 'LBP', 'BOTH'].includes(payload.currency_preference.toUpperCase())) {
    return { ok: false, error: 'invalid_currency' }
  }
  if (payload.currency_preference) payload.currency_preference = payload.currency_preference.toUpperCase()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const { data: prof } = await supabase.from('profiles').select('gym_id').eq('id', user.id).maybeSingle()
  if (!prof?.gym_id) return { ok: false, error: 'no_gym' }

  // Caller-RLS update of the caller's OWN gym; select back to detect a
  // silently-filtered write (RLS returns 0 rows for non-staff).
  const { data: updated, error } = await supabase
    .from('gyms').update(payload).eq('id', prof.gym_id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: 'not_allowed' }

  revalidatePath('/', 'layout') // gym name/branding surfaces app-wide (header, landing, login)
  return { ok: true }
}
