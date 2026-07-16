import type { MetadataRoute } from 'next';
import { requestCanonicalOrigin } from '@/lib/host/request-canonical';

/**
 * robots.txt (LPX-1) — crawlers may index the public landing; everything private
 * is disallowed. Route groups ((dashboard)/(marketing)) don't appear in the URL,
 * so staff/member surfaces are locale-prefixed bare paths (e.g. /en/students) and
 * are disallowed explicitly with per-segment locale wildcards. Served at /robots.txt.
 *
 * OXY-HOST R4: now PER-HOST — the sitemap + host point at THIS request's canonical
 * origin (the gym's custom domain / subdomain, the vendor apex, else SITE_URL for
 * the demo/Railway). Reading the request host opts the route into dynamic rendering.
 */
export const dynamic = 'force-dynamic';

const PRIVATE_SEGMENTS = [
  'dashboard', 'today', 'inbox', 'students', 'money', 'schedule', 'coaches',
  'team', 'settings', 'profile', 'belts', 'disciplines', 'leads', 'classes',
  'attendance', 'invoices', 'payments', 'pt', 'camps', 'reports',
  'notifications', 'portal', 'coach', 'auth',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await requestCanonicalOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', ...PRIVATE_SEGMENTS.map((s) => `/*/${s}`)],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
