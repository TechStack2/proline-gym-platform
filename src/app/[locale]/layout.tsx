import { DevSwCleanup } from '@/components/dev/sw-cleanup'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getCurrentUserGym } from '@/lib/pwa/identity';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import { UseToastRenderer } from '@/components/ui/toaster';
import '@/app/globals.css';

// DS-1: Geist (Vercel's UI sans) over Inter — the approved v4 prototype's Latin face.
// Ships via the `geist` package (self-hosted next/font; Geist is NOT in
// next/font/google's list in next 14.2). GeistSans.variable sets --font-geist-sans;
// globals.css aliases --font-latin → var(--font-geist-sans). CSP-safe (self-hosted).
// AX-1 (client: "the font is not the best"): IBM Plex Sans Arabic over the old
// Noto NASKH (a traditional serif-class face — wrong register for app UI) and
// over Cairo (rounder, display-leaning). Plex Sans Arabic is a UI text face
// designed alongside a Latin companion, so it sits naturally next to Geist at
// matching x-height/weight. next/font self-hosts + injects a size-adjusted
// local fallback automatically (adjustFontFallback), so swap causes no CLS.
const arabic = IBM_Plex_Sans_Arabic({
  // AR-TYPE: 'latin' subset so Western numerals + embedded Latin (brand, codes)
  // render in the same superfamily inside the Arabic UI; weight 600 added so
  // font-semibold resolves to a real weight (not faux-bold). dabbira-validated.
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: Omit<Props, 'children'>) {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'app' });

  // PWA-IDENTITY: on AUTHENTICATED surfaces the tab title + favicon are the
  // SIGNED-IN user's gym (resolvable for staff; members → the default). Anon
  // surfaces (the landing) get null → the default brand, and the landing page's
  // own generateMetadata (SEO-PER-GYM) overrides with its resolved gym anyway.
  const userGym = await getCurrentUserGym();
  const brand =
    (userGym &&
      (locale === 'ar' ? userGym.name_ar : locale === 'fr' ? userGym.name_fr : userGym.name_en)) ||
    t('name');
  const favicon = userGym?.logo_url || '/logo.jpg';

  return {
    title: {
      default: brand,
      template: `%s | ${brand}`,
    },
    description: t('tagline'),
    // OFF-1: link the web-app manifest so the app is INSTALLABLE (desktop Chrome
    // "Install app" + mobile A2HS). PWA-IDENTITY: the dynamic /manifest.webmanifest
    // route resolves the gym by Host, so the INSTALLED app carries the tenant's
    // name/color/icon (was a static public/manifest.json = "PRO LINE" for everyone).
    manifest: '/manifest.webmanifest',
    // AX-3: the gym logo as the favicon (there was no /favicon.ico → 404); the
    // signed-in user's gym logo when set, else the PRO LINE default.
    icons: { icon: favicon },
    // Prevent in-browser auto-translation (e.g. Chrome) from rewriting text
    // nodes React owns, which corrupts reconciliation and crashes with
    // "NotFoundError: Node.removeChild" on client navigations.
    other: { google: 'notranslate' },
  };
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'ar' | 'en' | 'fr')) {
    notFound();
  }

  // AX-1 ROOT CAUSE of "Arabic is not fully active on multiple pages": with
  // generateStaticParams present, next-intl's requestLocale does NOT resolve
  // from the URL segment unless setRequestLocale is called — getMessages()/
  // useTranslations silently fell back to defaultLocale (en) on routes
  // rendered without it (the landing tree, incl. the CLIENT provider's
  // messages). Must run BEFORE getMessages().
  setRequestLocale(locale);

  const messages = await getMessages();
  const isRTL = locale === 'ar';

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'} translate="no">
      <body
        className={cn(
          GeistSans.variable,
          arabic.variable,
          'min-h-screen bg-gray-50',
          isRTL ? 'font-arabic' : 'font-latin'
        )}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster richColors position={isRTL ? 'bottom-left' : 'bottom-right'} />
          <UseToastRenderer />
        <DevSwCleanup />
        <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
