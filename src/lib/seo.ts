/**
 * Landing SEO constants + structured-data builder (Cycle 5 / V1 / LPX-1).
 *
 * Tenant-clean: the gym NAME comes from the DB (get_public_gym), all marketing
 * copy comes from the `seo` i18n namespace, and the address is the one fact the
 * prompt supplies for this gym (Sky Business Center, Baabda) — centralized here
 * (accepted white-label debt, like the existing HeroSection brand copy) until a
 * future anon-readable gym-address column exists.
 */

export const LOCALES = ['ar', 'en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Brand crimson (logo) — used as the PWA/browser theme color. */
export const THEME_COLOR = '#cd1419';

/** Committed 1200×630 social-share card (WhatsApp/Instagram/Twitter preview). */
export const OG_IMAGE_PATH = '/landing/og.jpg';

/**
 * Canonical public origin. Operator sets NEXT_PUBLIC_SITE_URL in Vercel once the
 * domain is final; the fallback matches the gym's Instagram handle (@prolinegym.lb).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://prolinegym.lb'
).replace(/\/$/, '');

/** Public contact (already shown on the landing hero) — used in JSON-LD only. */
const PUBLIC_PHONE = '+96170628601';
const INSTAGRAM_URL = 'https://instagram.com/prolinegym.lb';

type JsonLdInput = {
  name: string;
  locale: string;
  description: string;
  /** Localized address parts from the `seo` namespace. */
  streetAddress: string;
  addressLocality: string;
  addressCountry: string; // ISO-3166-1 alpha-2, e.g. 'LB'
};

/**
 * Schema.org SportsActivityLocation (a LocalBusiness subtype) for the gym.
 * Only clean, verifiable fields — no invented geo coordinates or opening hours.
 */
export function buildGymJsonLd({
  name,
  locale,
  description,
  streetAddress,
  addressLocality,
  addressCountry,
}: JsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name,
    description,
    url: `${SITE_URL}/${locale}`,
    image: `${SITE_URL}${OG_IMAGE_PATH}`,
    telephone: PUBLIC_PHONE,
    address: {
      '@type': 'PostalAddress',
      streetAddress,
      addressLocality,
      addressCountry,
    },
    sameAs: [INSTAGRAM_URL],
  };
}
