import type { MetadataRoute } from 'next';
import { SITE_URL, LOCALES } from '@/lib/seo';

/**
 * Sitemap (LPX-1) — the public locale landing routes ONLY (no app/private routes).
 * Each locale lists the other two as hreflang alternates so search engines serve
 * the right language. Served at /sitemap.xml (the middleware matcher skips dotted
 * paths, so this bypasses the i18n locale rewrite).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}`]));

  return LOCALES.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: locale === 'en' ? 1 : 0.9,
    alternates: { languages },
  }));
}
