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
import { createTranslator } from 'next-intl';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_GYM_SLUG, safeBrandColor, type LandingGym } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { processedIconPath } from '@/lib/pwa/icon-paths';
import enMessages from '@/i18n/messages/en.json';
import arMessages from '@/i18n/messages/ar.json';
import frMessages from '@/i18n/messages/fr.json';

// The byte-identical default identity. (public/manifest.json is GONE — W2c §5:
// the dynamic route is the ONLY manifest; a stale static copy could never carry
// per-tenant or per-locale identity and was pure precache dead weight.)
const DEFAULT_NAME = 'PRO LINE Gym';
const DEFAULT_SHORT = 'PRO LINE';
const DEFAULT_THEME = '#cd1419';
const DEFAULT_ICONS = [72, 96, 128, 144, 152, 192, 384, 512].map((s) => ({
  src: `/icons/icon-${s}x${s}.png`,
  sizes: `${s}x${s}`,
  type: 'image/png',
  purpose: 'any maskable',
}));

export type ManifestLocale = 'ar' | 'en' | 'fr';
const MESSAGES: Record<ManifestLocale, unknown> = { en: enMessages, ar: arMessages, fr: frMessages };

/**
 * §5: does the processed maskable set exist for this logo? The uploader writes
 * `gym-icon-192/512/180.png` next to the logo; there is no DB record (no
 * migration), so existence is probed once per request (react cache) with a
 * short timeout — a miss (legacy logo, storage down) degrades to the legacy
 * icon behavior, never a broken install.
 */
const hasProcessedIcons = cache(async (icon192Url: string): Promise<boolean> => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(icon192Url, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
});

export async function buildGymManifest(
  gym: LandingGym | null,
  opts: { locale?: ManifestLocale; theme?: 'light' | 'dark' } = {},
) {
  // The default gym keeps its static identity values; any OTHER gym overrides
  // name/short_name/theme_color/icons from its own row (each field NULL → the
  // default). W2c (§5, DA-15/16): the manifest additionally varies by LOCALE
  // (start_url/lang/dir/description — an Arabic owner's installed app opens in
  // Arabic) and by the installing user's stored THEME (background_color = the
  // splash ground; stored-theme-at-install approximation — the manifest link
  // carries ?theme= only when the app booted dark, so a later toggle does not
  // retroactively change an existing install).
  const locale: ManifestLocale = opts.locale === 'ar' || opts.locale === 'fr' ? opts.locale : 'en';
  const t = createTranslator({ locale, messages: MESSAGES[locale] as never, namespace: 'pwa' });
  const isDefault = !gym || gym.slug === DEFAULT_GYM_SLUG;
  const name = isDefault ? DEFAULT_NAME : gym!.name_en || DEFAULT_NAME;
  const shortName = isDefault ? DEFAULT_SHORT : gym!.name_en || DEFAULT_SHORT;
  const themeColor = isDefault ? DEFAULT_THEME : safeBrandColor(gym!.brand_color);

  // AVATAR-PATHS: logo_url is a stored bucket path → resolve to a public URL for the
  // manifest icon src (a committed '/…' asset or legacy absolute url passes through).
  const logoIcon = storagePublicUrl('avatars', gym?.logo_url);
  let icons: Array<{ src: string; sizes: string; type?: string; purpose: string }> = DEFAULT_ICONS;
  if (!isDefault && logoIcon && gym?.logo_url) {
    const icon192 = storagePublicUrl('avatars', processedIconPath(gym.logo_url, 192));
    const icon512 = storagePublicUrl('avatars', processedIconPath(gym.logo_url, 512));
    if (icon192 && icon512 && (await hasProcessedIcons(icon192))) {
      // §5: REAL padded maskable squares emitted at upload — the sizes are true.
      icons = [
        { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ];
    } else {
      // Legacy logo (uploaded before W2c): the raw image is still the best
      // identity available, but the sizes STOP LYING — a rectangle is not a
      // 192/512 square, so it is declared `sizes:'any'` and never maskable.
      icons = [{ src: logoIcon, sizes: 'any', purpose: 'any' }];
    }
  }

  return {
    name,
    short_name: shortName,
    // §5: the gym's own identity, localized — never the vendor pitch.
    description: t('manifestDescription', { gym: name }),
    start_url: `/${locale}`,
    display: 'standalone',
    orientation: 'any',
    // §5: the splash ground follows the stored theme at install time.
    background_color: opts.theme === 'dark' ? '#131317' : '#ffffff',
    theme_color: themeColor,
    scope: '/',
    lang: locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    categories: ['health', 'fitness', 'sports'],
    icons,
    screenshots: [],
    related_applications: [],
    prefer_related_applications: false,
  };
}

type UserGym = { slug: string | null; name_ar: string; name_en: string; name_fr: string; logo_url: string | null; brand_color: string | null };

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
      .select('slug, name_ar, name_en, name_fr, logo_url, brand_color')
      .eq('id', profile.gym_id)
      .maybeSingle();
    return (gym as UserGym) ?? null;
  } catch {
    return null; // never let identity resolution break metadata → fall back to default
  }
});

/**
 * W2c §5 Apple layer: the apple-touch-icon for the SIGNED-IN user's gym — the
 * processed 180×180 square when the upload-time set exists (probed via the same
 * cached 192 HEAD the manifest uses), else the shipped 192 default (Safari
 * scales it). Members resolve no gym row → the default, same as the favicon.
 */
export async function getAppleTouchIconUrl(): Promise<string> {
  try {
    const gym = await getCurrentUserGym();
    if (gym?.logo_url && gym.slug !== DEFAULT_GYM_SLUG) {
      const url180 = storagePublicUrl('avatars', processedIconPath(gym.logo_url, 180));
      const probe192 = storagePublicUrl('avatars', processedIconPath(gym.logo_url, 192));
      if (url180 && probe192 && (await hasProcessedIcons(probe192))) return url180;
    }
  } catch {
    // fall through to the default — identity resolution must never break metadata
  }
  return '/icons/icon-192x192.png';
}

// WL-CHROME: the authed user's PWA / browser status-bar theme colour — the gym brand for a
// real tenant, the byte-identical Proline crimson for the default gym or any unset field.
// Mirrors buildGymManifest's theme_color EXACTLY (safeBrandColor → DEFAULT_BRAND_COLOR =
// DEFAULT_THEME = #cd1419), so the meta tag and the installed manifest agree. Reuses the
// cached getCurrentUserGym (no extra round-trip). A member (gym row not readable) → null
// → the default, which is the neutral #cd1419 they'd see anyway.
export async function getUserThemeColor(): Promise<string> {
  const gym = await getCurrentUserGym();
  if (!gym || gym.slug === DEFAULT_GYM_SLUG) return DEFAULT_THEME;
  return safeBrandColor(gym.brand_color);
}
