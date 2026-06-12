import type { Metadata, Viewport } from 'next';
import { getTranslations } from 'next-intl/server';
import { LandingNav } from '@/components/layout/LandingNav';
import { LandingFooter } from '@/components/layout/LandingFooter';
import { getLandingGym } from '@/lib/marketing/gym';
import { SITE_URL, THEME_COLOR, OG_IMAGE_PATH, buildGymJsonLd } from '@/lib/seo';

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

// og:locale codes (language_TERRITORY) for the three supported locales.
const OG_LOCALE: Record<string, string> = { ar: 'ar_LB', en: 'en_US', fr: 'fr_FR' };

/**
 * Per-locale landing metadata (LPX-1): localized title/description, canonical +
 * hreflang alternates, and OpenGraph/Twitter cards pointing at the committed
 * 1200×630 OG image (the WhatsApp/Instagram share-preview use case). Built purely
 * from the `seo` i18n namespace so it never depends on a DB round-trip at build.
 */
export async function generateMetadata({ params: { locale } }: Omit<Props, 'children'>): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'seo' });
  const title = t('title');
  const description = t('description');
  const url = `${SITE_URL}/${locale}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: 'PRO LINE Gym',
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: '/ar', en: '/en', fr: '/fr', 'x-default': '/en' },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'PRO LINE Gym',
      locale: OG_LOCALE[locale] ?? 'en_US',
      alternateLocale: Object.values(OG_LOCALE).filter((l) => l !== (OG_LOCALE[locale] ?? 'en_US')),
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: t('ogAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE_PATH],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default async function MarketingLayout({ children, params }: Props) {
  const { locale } = params;

  // JSON-LD: real gym name from the public RPC (tenant-clean), localized copy +
  // the prompt-supplied address from i18n. Falls back to the brand name if the
  // public gym is unavailable. (ld+json is a data block — not subject to the
  // strict-dynamic script-src CSP — so no nonce is required.)
  const [gym, tSeo, tApp] = await Promise.all([
    getLandingGym(),
    getTranslations({ locale, namespace: 'seo' }),
    getTranslations({ locale, namespace: 'app' }),
  ]);
  const gymName = gym
    ? locale === 'ar'
      ? gym.name_ar
      : locale === 'fr'
        ? gym.name_fr
        : gym.name_en
    : tApp('name');

  const jsonLd = buildGymJsonLd({
    name: gymName,
    locale,
    description: tSeo('description'),
    streetAddress: tSeo('streetAddress'),
    addressLocality: tSeo('addressLocality'),
    addressCountry: 'LB',
  });

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        data-testid="landing-jsonld"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingNav locale={locale} />
      <main className="flex-1">{children}</main>
      <LandingFooter locale={locale} />
    </div>
  );
}
