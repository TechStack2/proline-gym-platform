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
import { actionError } from '@/lib/errors/action-error';
import { normalizePhone } from '@/lib/utils/phone';
import type { OfficeHours } from '@/lib/marketing/office-hours';

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
  // BILL-LOCALIZE: billing/localization identity (columns exist since 000002)
  city?: string
  country?: string
  tva_registration_number?: string
  // 000072 branding
  brand_color?: string
  hero_image_url?: string
  tagline_ar?: string
  tagline_en?: string
  tagline_fr?: string
  // LANDING-CUSTOM (000078/000101): public contact + socials + map + hours
  contact_phone?: string
  contact_whatsapp?: string
  contact_email?: string
  instagram_handle?: string
  facebook_handle?: string
  tiktok_handle?: string
  youtube_handle?: string
  instagram_followers?: string | number | null
  map_lat?: string | number | null
  map_lng?: string | number | null
  office_hours?: OfficeHours | null
  // BILL-POLICY (000107): the gym's billing-cycle policy + month-grid day.
  billing_cycle_policy?: string
  billing_cycle_day?: string | number | null
}

const EDITABLE = [
  'name_ar', 'name_en', 'name_fr',
  'address_ar', 'address_en', 'address_fr',
  'phone', 'email', 'website', 'timezone', 'currency_preference',
  'city', 'country', 'tva_registration_number',
  'brand_color', 'hero_image_url', 'tagline_ar', 'tagline_en', 'tagline_fr',
  // LANDING-CUSTOM public string fields
  'contact_phone', 'contact_whatsapp', 'contact_email',
  'instagram_handle', 'facebook_handle', 'tiktok_handle', 'youtube_handle',
] as const

// LANDING-CUSTOM: numeric public fields (parsed + range-checked, not string-trimmed).
const NUMERIC: { key: 'instagram_followers' | 'map_lat' | 'map_lng'; min: number; max: number }[] = [
  { key: 'instagram_followers', min: 0, max: 1_000_000_000 },
  { key: 'map_lat', min: -90, max: 90 },
  { key: 'map_lng', min: -180, max: 180 },
]

export async function saveGymSettings(
  input: GymSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Whitelist + trim; '' → NULL so clearing a field truly clears it.
  const payload: Record<string, string | number | null | OfficeHours> = {}
  for (const key of EDITABLE) {
    const v = input[key]
    if (v === undefined) continue
    payload[key] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  // LANDING-CUSTOM: numeric fields — '' / null → NULL; else a finite in-range number.
  for (const { key, min, max } of NUMERIC) {
    const v = input[key]
    if (v === undefined) continue
    if (v === null || (typeof v === 'string' && v.trim() === '')) { payload[key] = null; continue }
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: 'invalid_number' }
    payload[key] = key === 'instagram_followers' ? Math.round(n) : n
  }

  // LANDING-CUSTOM: office_hours JSONB — object or explicit null (don't render).
  if (input.office_hours !== undefined) payload.office_hours = input.office_hours ?? null

  // BILL-POLICY: a closed set + a bounded day. Handled here rather than in EDITABLE
  // because EDITABLE maps '' → NULL, and these columns are NOT NULL — a blank must
  // be rejected, never written as null.
  if (input.billing_cycle_policy !== undefined) {
    const v = String(input.billing_cycle_policy)
    if (!['calendar', 'anniversary'].includes(v)) return { ok: false, error: 'invalid_billing_policy' }
    payload.billing_cycle_policy = v
  }
  if (input.billing_cycle_day !== undefined) {
    const n = Math.trunc(Number(input.billing_cycle_day))
    // 1..28 mirrors the CHECK constraint: every month has these days, so the grid
    // never walks backwards after a short month.
    if (!Number.isFinite(n) || n < 1 || n > 28) return { ok: false, error: 'invalid_number' }
    payload.billing_cycle_day = n
  }

  if (Object.keys(payload).length === 0) return { ok: false, error: 'nothing_to_save' }

  // MJ-2: store the gym's contact phone in the canonical shape (display formats it).
  if (typeof payload.phone === 'string') payload.phone = normalizePhone(payload.phone) || null

  if (typeof payload.brand_color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(payload.brand_color)) {
    return { ok: false, error: 'invalid_color' }
  }
  if (typeof payload.currency_preference === 'string' && !['USD', 'LBP', 'BOTH'].includes(payload.currency_preference.toUpperCase())) {
    return { ok: false, error: 'invalid_currency' }
  }
  if (typeof payload.currency_preference === 'string') payload.currency_preference = payload.currency_preference.toUpperCase()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_signed_in' }
  const { data: prof } = await supabase.from('profiles').select('gym_id').eq('id', user.id).maybeSingle()
  if (!prof?.gym_id) return { ok: false, error: 'no_gym' }

  // Caller-RLS update of the caller's OWN gym; select back to detect a
  // silently-filtered write (RLS returns 0 rows for non-staff).
  const { data: updated, error } = await supabase
    .from('gyms').update(payload).eq('id', prof.gym_id).select('id')
  if (error) return { ok: false, error: actionError(error) }
  if (!updated || updated.length === 0) return { ok: false, error: 'not_allowed' }

  revalidatePath('/', 'layout') // gym name/branding surfaces app-wide (header, landing, login)
  return { ok: true }
}
