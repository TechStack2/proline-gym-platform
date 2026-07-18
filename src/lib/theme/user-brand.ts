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
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('gyms(brand_color)')
      .eq('id', userId)
      .maybeSingle()
    const raw = (data as { gyms?: unknown } | null)?.gyms
    const node = Array.isArray(raw) ? raw[0] : raw
    return (node as { brand_color?: string | null } | null | undefined)?.brand_color ?? null
  } catch {
    return null
  }
}
