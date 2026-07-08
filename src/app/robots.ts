import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.txt (LPX-1) — crawlers may index the public landing; everything private
 * is disallowed. Route groups ((dashboard)/(marketing)) don't appear in the URL,
 * so staff/member surfaces are locale-prefixed bare paths (e.g. /en/students) and
 * are disallowed explicitly with per-segment locale wildcards. Served at /robots.txt.
 */
const PRIVATE_SEGMENTS = [
  'dashboard', 'today', 'inbox', 'students', 'money', 'schedule', 'coaches',
  'team', 'settings', 'profile', 'belts', 'disciplines', 'leads', 'classes',
  'attendance', 'invoices', 'payments', 'pt', 'camps', 'reports',
  'notifications', 'portal', 'coach', 'auth',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', ...PRIVATE_SEGMENTS.map((s) => `/*/${s}`)],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
