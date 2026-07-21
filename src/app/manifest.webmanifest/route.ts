import { NextResponse } from 'next/server';
import { getLandingGym, getGymSlugByDomain, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { buildGymManifest } from '@/lib/pwa/identity';
import { effectiveHost } from '@/lib/host/effective-host';

// PWA-IDENTITY: the web-app manifest is fetched at INSTALL time, so per-gym
// identity needs a dynamic route (a static public/manifest.json can't resolve a
// gym — W2c §5 DELETED that stale copy; this route is the only manifest).
// Resolve the gym by the request Host — a mapped custom domain (the same
// WL-DOMAIN resolver the landing uses) else DEFAULT_GYM_SLUG → the demo.
//
// W2c §5: the <link rel="manifest"> in the locale layout appends
// `?locale=<locale>` (and the theme boot script appends `&theme=dark` when the
// app booted dark), so the manifest ALSO varies per locale (start_url/lang/dir/
// description) and per stored theme (background_color splash ground).
//
// Lives at the app root (not under [locale]) and the path is dotted, so the
// next-intl middleware matcher (excludes `.*\..*`) never locale-redirects it.
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const host = effectiveHost(request.headers); // OXY-HOST: trusted host (proxy-gated), not x-forwarded-host
  let gym = null;
  try {
    const slug = (await getGymSlugByDomain(host)) || DEFAULT_GYM_SLUG;
    gym = await getLandingGym(slug);
  } catch {
    gym = null; // any resolution error → the default manifest (no broken install)
  }

  const params = new URL(request.url).searchParams;
  const rawLocale = params.get('locale');
  const locale = rawLocale === 'ar' || rawLocale === 'fr' || rawLocale === 'en' ? rawLocale : 'en';
  const theme = params.get('theme') === 'dark' ? ('dark' as const) : ('light' as const);

  return NextResponse.json(await buildGymManifest(gym, { locale, theme }), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Per-request (Host-scoped) → let a shared cache vary and stay short-lived.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      Vary: 'host, x-praxella-host',
    },
  });
}
