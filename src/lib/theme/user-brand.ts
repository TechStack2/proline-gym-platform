import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * WL-THEME · PORTAL-BRAND — resolve the AUTHED user's gym brand_color for the app
 * shell, keyed by the USER's gym (never the Host — per-gym-identity rule).
 *
 * Why this exists: staff (owner/head_coach/coach/receptionist) read gyms.brand_color
 * directly under RLS (`gyms_staff_read` = `is_staff()`), so the dashboard + coach
 * shells brand correctly with a plain `profiles → gyms(brand_color)` join. But a
 * MEMBER / GUARDIAN is NOT `is_staff()`, so that embedded read is filtered to null
 * and the portal shell falls back to the globals.css crimson — a branded gym's member
 * saw a RED portal. brand_color is a single, non-sensitive value already public on the
 * landing (get_public_gym), so we read it here through the server-only service-role
 * client, scoped to the user's OWN gym_id. No schema/RLS change.
 *
 * Degrades to null (→ the byte-identical crimson default) on ANY failure — a missing
 * SUPABASE_SERVICE_ROLE_KEY, no gym, a query error — so the portal never crashes and an
 * unbranded (NULL brand_color) gym stays pixel-identical to before.
 */
export async function getUserBrandColor(userId: string): Promise<string | null> {
  return (await getUserGymChrome(userId, 'en')).brandColor
}

export type UserGymChrome = {
  brandColor: string | null
  gymName: string
  logoUrl: string | null
}

/**
 * DS 2.0 §4.1 (W2a) — the identity bar needs the USER's gym NAME + LOGO on the
 * portal/coach desktop shells, and members hit the same RLS filter as
 * brand_color (name/logo are already public via get_public_gym — non-sensitive).
 * Same server-only admin read, widened; same degrade-to-empty contract. The
 * default gym keeps the static /logo.jpg (the staff-shell convention).
 */
export async function getUserGymChrome(userId: string, locale: string): Promise<UserGymChrome> {
  try {
    const { DEFAULT_GYM_SLUG } = await import('@/lib/marketing/gym')
    const { storagePublicUrl } = await import('@/lib/storage/public-url')
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('gyms(slug, name_ar, name_en, name_fr, logo_url, brand_color)')
      .eq('id', userId)
      .maybeSingle()
    const raw = (data as { gyms?: unknown } | null)?.gyms
    const g = (Array.isArray(raw) ? raw[0] : raw) as {
      slug?: string
      name_ar?: string
      name_en?: string
      name_fr?: string
      logo_url?: string | null
      brand_color?: string | null
    } | null | undefined
    const gymName = (locale === 'ar' ? g?.name_ar : locale === 'fr' ? g?.name_fr : g?.name_en) || g?.name_en || ''
    const logoUrl = g?.slug === DEFAULT_GYM_SLUG ? '/logo.jpg' : storagePublicUrl('avatars', g?.logo_url) || null
    return { brandColor: g?.brand_color ?? null, gymName, logoUrl }
  } catch {
    return { brandColor: null, gymName: '', logoUrl: null }
  }
}
