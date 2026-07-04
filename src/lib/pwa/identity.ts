/**
 * PWA-IDENTITY — the installed app + browser tab say the GYM's name, not "PRO
 * LINE" for every tenant.
 *
 * Two resolution paths, both fall back to today's Proline values byte-for-byte:
 *  · buildGymManifest(gym): the dynamic /manifest.webmanifest body. The gym is
 *    resolved by Host (a mapped custom domain) else the default — so the INSTALL
 *    prompt (which fetches the manifest at install time) carries that gym's
 *    name/short_name/theme_color/icon.
 *  · getCurrentUserGym(): the signed-in user's gym (profile.gym_id → gyms) for
 *    the authenticated <head> title/favicon. STAFF can read their gym row
 *    (000077 gyms_staff_read); members' reads return empty → the default (no RLS
 *    change — "where cleanly resolvable"). Cached per request.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_GYM_SLUG, safeBrandColor, type LandingGym } from '@/lib/marketing/gym';

// The byte-identical default manifest (mirrors public/manifest.json). The dynamic
// route emits EXACTLY this for the default gym or any gym with unset fields.
const DEFAULT_NAME = 'PRO LINE Gym';
const DEFAULT_SHORT = 'PRO LINE';
const DEFAULT_THEME = '#cd1419';
const DEFAULT_ICONS = [72, 96, 128, 144, 152, 192, 384, 512].map((s) => ({
  src: `/icons/icon-${s}x${s}.png`,
  sizes: `${s}x${s}`,
  type: 'image/png',
  purpose: 'any maskable',
}));

export function buildGymManifest(gym: LandingGym | null) {
  // The default gym keeps today's exact static values; any OTHER gym overrides
  // only name/short_name/theme_color/icons from its own row (each field NULL →
  // the default), so an unset tenant renders byte-equivalently to today.
  const isDefault = !gym || gym.slug === DEFAULT_GYM_SLUG;
  const name = isDefault ? DEFAULT_NAME : gym!.name_en || DEFAULT_NAME;
  const shortName = isDefault ? DEFAULT_SHORT : gym!.name_en || DEFAULT_SHORT;
  const themeColor = isDefault ? DEFAULT_THEME : safeBrandColor(gym!.brand_color);
  const icons =
    !isDefault && gym!.logo_url
      ? [
          { src: gym!.logo_url, sizes: '192x192', purpose: 'any' },
          { src: gym!.logo_url, sizes: '512x512', purpose: 'any' },
        ]
      : DEFAULT_ICONS;

  return {
    name,
    short_name: shortName,
    description: 'PRO LINE Gym Management Platform — Tri-lingual martial arts gym management',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#252525',
    theme_color: themeColor,
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    categories: ['health', 'fitness', 'sports'],
    icons,
    screenshots: [],
    related_applications: [],
    prefer_related_applications: false,
  };
}

type UserGym = { name_ar: string; name_en: string; name_fr: string; logo_url: string | null };

export const getCurrentUserGym = cache(async (): Promise<UserGym | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null; // anon (e.g. the landing) → the default identity
    const { data: profile } = await supabase
      .from('profiles')
      .select('gym_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.gym_id) return null;
    const { data: gym } = await supabase
      .from('gyms')
      .select('name_ar, name_en, name_fr, logo_url')
      .eq('id', profile.gym_id)
      .maybeSingle();
    return (gym as UserGym) ?? null;
  } catch {
    return null; // never let identity resolution break metadata → fall back to default
  }
});
