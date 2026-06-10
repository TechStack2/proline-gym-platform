import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

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
};

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
