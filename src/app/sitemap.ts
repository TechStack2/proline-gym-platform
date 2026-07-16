import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/seo';
import { requestCanonicalOrigin } from '@/lib/host/request-canonical';

/**
 * Sitemap (LPX-1) — the public locale landing routes ONLY (no app/private routes).
 * Each locale lists the other two as hreflang alternates so search engines serve
 * the right language. Served at /sitemap.xml (the middleware matcher skips dotted
 * paths, so this bypasses the i18n locale rewrite).
 *
 * OXY-HOST R4: PER-HOST — the URLs + hreflang alternates are on THIS request's
 * canonical origin (custom domain / subdomain / vendor apex, else SITE_URL for the
 * demo/Railway). Reading the request host opts the route into dynamic rendering.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await requestCanonicalOrigin();
  const lastModified = new Date();
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${origin}/${l}`]));

  return LOCALES.map((locale) => ({
    url: `${origin}/${locale}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: locale === 'en' ? 1 : 0.9,
    alternates: { languages },
  }));
}
