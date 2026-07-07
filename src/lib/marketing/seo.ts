/**
 * SEO-PER-GYM — the landing's <head> metadata + JSON-LD follow the RESOLVED gym.
 *
 * WHY. `generateMetadata` and the JSON-LD used to live in (marketing)/layout.tsx,
 * which CANNOT read searchParams — so every gym got Proline's title/OG/JSON-LD.
 * This resolver runs from page.tsx (which can resolve ?gym= / domain / default),
 * so the share/search identity now matches the gym the visitor actually loaded.
 *
 * RULE. The default/Proline gym (slug === DEFAULT_GYM_SLUG) keeps the curated
 * sitewide `seo` copy + hardcodes byte-identically (across every locale, incl.
 * the /ar hardcodes) — the demo does not regress. Every OTHER gym derives its
 * identity from its own DB fields (name, tagline, address_*, contact_phone,
 * instagram_handle, hero/logo), with the `seo`/default-contact constants as the
 * NULL fallback only. Server-only (never import from a 'use client' module).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getLandingGym, DEFAULT_GYM_SLUG, resolveLandingContact } from './gym';
import { SITE_URL, OG_IMAGE_PATH, buildGymJsonLd } from '@/lib/seo';
import { storagePublicUrl } from '@/lib/storage/public-url';

// og:locale codes (language_TERRITORY) for the three supported locales.
const OG_LOCALE: Record<string, string> = { ar: 'ar_LB', en: 'en_US', fr: 'fr_FR' };

/**
 * Split a single free-text address ("Building, Locality") into the JSON-LD
 * PostalAddress parts. The full string stays the streetAddress (matching today's
 * i18n `streetAddress`, which also carries the locality) and the last comma
 * segment becomes the locality. Handles both the ASCII and Arabic (،) comma.
 */
function splitAddress(addr: string): { streetAddress: string; addressLocality: string } {
  const parts = addr.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  return { streetAddress: addr, addressLocality: parts.length > 1 ? parts[parts.length - 1] : addr };
}

export async function getLandingMeta(
  locale: string,
  gymSlug: string | undefined,
): Promise<{ metadata: Metadata; jsonLd: Record<string, unknown> }> {
  const [gym, tSeo, tApp] = await Promise.all([
    getLandingGym(gymSlug || DEFAULT_GYM_SLUG),
    getTranslations({ locale, namespace: 'seo' }),
    getTranslations({ locale, namespace: 'app' }),
  ]);
  const pick = (ar?: string | null, en?: string | null, fr?: string | null) =>
    (locale === 'ar' ? ar : locale === 'fr' ? fr : en) || en || undefined;

  const isDefault = !gym || gym.slug === DEFAULT_GYM_SLUG;
  const gymName = pick(gym?.name_ar, gym?.name_en, gym?.name_fr);
  const tagline = pick(gym?.tagline_ar, gym?.tagline_en, gym?.tagline_fr);

  // applicationName / og:site_name: the curated brand for the default gym
  // (hardcoded 'PRO LINE Gym', including /ar, as today), else the tenant's name.
  const brandName = isDefault ? 'PRO LINE Gym' : gymName || tApp('name');
  const perGymTitle = tagline ? `${brandName} — ${tagline}` : brandName;
  const title = isDefault ? tSeo('title') : perGymTitle;
  const description = isDefault ? tSeo('description') : perGymTitle;
  const ogAlt = isDefault ? tSeo('ogAlt') : brandName;
  const url = `${SITE_URL}/${locale}`;

  // OG image: the gym's hero (or logo) when set, else the committed default card.
  // width/height 1200×630 are only truthful for that committed asset.
  // AVATAR-PATHS: hero_image_url is a gym-landing path (J5), logo_url an avatars path —
  // resolve each against ITS bucket. A pasted absolute URL or a '/…' asset passes
  // through storagePublicUrl unchanged, so the default/passthrough branches are stable.
  const ogImagePath = isDefault
    ? OG_IMAGE_PATH
    : gym?.hero_image_url
      ? storagePublicUrl('gym-landing', gym.hero_image_url)
      : gym?.logo_url
        ? storagePublicUrl('avatars', gym.logo_url)
        : OG_IMAGE_PATH;
  const ogImages =
    ogImagePath === OG_IMAGE_PATH
      ? [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: ogAlt }]
      : [{ url: ogImagePath, alt: ogAlt }];

  const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    // Default → a string title (the app-wide "%s | PRO LINE Gym" template applies,
    // as today → byte-identical). A tenant → absolute, so the Proline brand
    // template doesn't leak into another gym's title.
    title: isDefault ? title : { absolute: title },
    description,
    applicationName: brandName,
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: '/ar', en: '/en', fr: '/fr', 'x-default': '/en' },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: brandName,
      locale: OG_LOCALE[locale] ?? 'en_US',
      alternateLocale: Object.values(OG_LOCALE).filter((l) => l !== (OG_LOCALE[locale] ?? 'en_US')),
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImagePath],
    },
    robots: { index: true, follow: true },
  };

  // JSON-LD SportsActivityLocation. name (localized) + address from address_* +
  // phone from contact_phone + IG from instagram_handle — each falls back to the
  // curated `seo`/default-contact constant for the default gym or a NULL field.
  const contact = resolveLandingContact(gym);
  const addr = pick(gym?.address_ar, gym?.address_en, gym?.address_fr);
  const { streetAddress, addressLocality } =
    !isDefault && addr
      ? splitAddress(addr)
      : { streetAddress: tSeo('streetAddress'), addressLocality: tSeo('addressLocality') };
  const jsonLdImage = ogImagePath.startsWith('http') ? ogImagePath : `${SITE_URL}${ogImagePath}`;
  const jsonLd = buildGymJsonLd({
    name: gymName || tApp('name'),
    locale,
    description,
    streetAddress,
    addressLocality,
    addressCountry: 'LB',
    telephone: isDefault ? undefined : gym?.contact_phone || undefined,
    image: jsonLdImage,
    sameAs: [`https://instagram.com/${contact.instagram}`],
  }) as Record<string, unknown>;

  return { metadata, jsonLd };
}
