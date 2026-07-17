import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { OfficeHours } from './office-hours';

/**
 * The public landing always targets Proline's gym. CI can override via ?gym=<slug>
 * (see (marketing)/page.tsx X1 note); prod with no param falls back to this slug.
 */
export const DEFAULT_GYM_SLUG = 'proline-gym';

export type LandingGym = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  // WL-LANDING: per-gym branding (all nullable → the template falls back to the
  // built-in Proline default when unset, so nothing regresses).
  logo_url: string | null;
  brand_color: string | null;
  hero_image_url: string | null;
  tagline_ar: string | null;
  tagline_en: string | null;
  tagline_fr: string | null;
  // PROLINE-LANDING-DATA (000078): public contact/social identity + address.
  address_ar: string | null;
  address_en: string | null;
  address_fr: string | null;
  contact_whatsapp: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  facebook_handle: string | null;
  map_lat: number | null;
  map_lng: number | null;
  // LANDING-CUSTOM (000101): structured office hours (JSONB) + extra socials.
  office_hours: OfficeHours | null;
  tiktok_handle: string | null;
  youtube_handle: string | null;
};

// PROLINE-LANDING-DATA: the contact primitives live in the CLIENT-SAFE
// ./contact module (LandingNav/LandingFooter are 'use client' and must not pull
// this module's next/headers graph). Re-exported here for server callers.
export { DEFAULT_CONTACT, resolveLandingContact, type LandingContact } from './contact';

/** A valid 6-digit hex brand color, or the default crimson when unset/invalid.
 *  (Validated because it flows into an SVG attribute — only trust a real hex.) */
export const DEFAULT_BRAND_COLOR = '#cd1419';
export function safeBrandColor(c: string | null | undefined): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_BRAND_COLOR;
}

/**
 * WL-DOMAIN-ROUTING: map a request Host → the mapped gym's slug (or null when the
 * host isn't a custom domain → the caller falls back to ?gym / DEFAULT_GYM_SLUG).
 * Normalizes the host (lowercase, strip port); the domain is matched anon-safely
 * via the definer RPC (returns only a slug). Cached per-request.
 */
export const getGymSlugByDomain = cache(
  async (host: string | null | undefined): Promise<string | null> => {
    if (!host) return null;
    const domain = host.trim().toLowerCase().split(':')[0]; // drop any :port
    if (!domain) return null;
    const supabase = await createClient();
    const { data } = await supabase.rpc('get_gym_slug_by_domain', { p_domain: domain });
    return (typeof data === 'string' && data) ? data : null;
  }
);

/**
 * Resolve the active landing gym by slug. Cached per-request (React cache) so the
 * Disciplines / Pricing / Schedule sections can each call it without N round-trips.
 * Returns null when the gym is missing or inactive — callers render a graceful empty state.
 */
export const getLandingGym = cache(
  async (slug: string = DEFAULT_GYM_SLUG): Promise<LandingGym | null> => {
    const supabase = await createClient();
    // Resolve via a SECURITY DEFINER RPC that returns only {id, slug, name_*} of an
    // ACTIVE gym — so a logged-out visitor never reads the gyms row (which holds the
    // tvA number / email). Public-catalog visibility only (000035).
    const { data } = await supabase.rpc('get_public_gym', { p_slug: slug || DEFAULT_GYM_SLUG });
    const row = Array.isArray(data) ? data[0] : data;
    return (row as LandingGym) ?? null;
  }
);
