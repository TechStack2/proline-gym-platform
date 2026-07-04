import { NextResponse } from 'next/server';
import { getLandingGym, getGymSlugByDomain, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { buildGymManifest } from '@/lib/pwa/identity';

// PWA-IDENTITY: the web-app manifest is fetched at INSTALL time, so per-gym
// identity needs a dynamic route (a static public/manifest.json can't resolve a
// gym). Resolve the gym by the request Host — a mapped custom domain (the same
// WL-DOMAIN resolver the landing uses) else DEFAULT_GYM_SLUG → the demo. The
// <link rel="manifest"> in the root layout points here; public/manifest.json
// stays as the byte-identical static fallback if this route is ever unavailable.
//
// Lives at the app root (not under [locale]) and the path is dotted, so the
// next-intl middleware matcher (excludes `.*\..*`) never locale-redirects it.
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  let gym = null;
  try {
    const slug = (await getGymSlugByDomain(host)) || DEFAULT_GYM_SLUG;
    gym = await getLandingGym(slug);
  } catch {
    gym = null; // any resolution error → the default manifest (no broken install)
  }

  return NextResponse.json(buildGymManifest(gym), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Per-request (Host-scoped) → let a shared cache vary and stay short-lived.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      Vary: 'x-forwarded-host, host',
    },
  });
}
