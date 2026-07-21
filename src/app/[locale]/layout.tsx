import { DevSwCleanup } from '@/components/dev/sw-cleanup'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { StrictIntlProvider } from '@/i18n/StrictIntlProvider';
import { GYM_TIME_ZONE } from '@/lib/fmt';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getCurrentUserGym, getAppleTouchIconUrl } from '@/lib/pwa/identity';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { DARK_APP_GROUND } from '@/lib/theme/brand';
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

// DISPLAY-FONT (owner-approved Option A): a DISPLAY superfamily for LANDING
// display headings ONLY (hero headline + marketing section titles) — the
// .font-display / .font-display-hero utilities in globals.css consume these two
// tokens. Body/UI type everywhere stays Geist + IBM Plex Sans Arabic (untouched).
// Self-hosted via next/font/local (woff2 in ./fonts) — NO CDN link (prod CSP is
// strict; fonts must be same-origin). Each ships a metrics-adjusted fallback
// (adjustFontFallback default) so display:'swap' reflows minimally.
const displayLatin = localFont({
  // Anton — a condensed, single-weight (400) uppercase-natured display face (EN/FR).
  src: '../fonts/anton-latin-400.woff2',
  weight: '400',
  style: 'normal',
  variable: '--font-display-latin',
  display: 'swap',
});
const displayArabic = localFont({
  // Alexandria ExtraBold (800) — the Arabic display companion (AR headings only).
  // preload:false — only rendered under [dir="rtl"], so English pages don't fetch it.
  src: '../fonts/alexandria-arabic-800.woff2',
  weight: '800',
  style: 'normal',
  variable: '--font-display-arabic',
  display: 'swap',
  preload: false,
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// DS-2: NO-FOUC theme init. Runs synchronously at the TOP of <body> — before the
// browser paints the content — so the stored/system theme is on <html> from the
// first frame (no light flash). Default = SYSTEM (no stored pref OR 'system' →
// prefers-color-scheme). Add-only: the server always renders light, so we only
// promote to dark here; ThemeToggle handles both directions after hydration.
// CSP: injected with the per-request nonce (prod strict-dynamic blocks un-nonced
// inline scripts); dev has no CSP. Kept tiny + wrapped in try/catch (a private-mode
// localStorage throw must never break render).
// W2c §5/DA-62 additions, same no-FOUC slot:
//  · theme-color follows the APP's dark state, not the OS media query — the
//    server emits ONE light meta; this promotes it to the shared dark ground
//    when the app boots dark (ThemeToggle handles later flips). The light value
//    is parked in data-light so a toggle back restores it.
//  · stored-theme-at-install approximation: when the app booted dark, the
//    manifest link gains &theme=dark so an install made now gets the dark
//    splash ground.
const THEME_INIT = `try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark')}
var m=document.querySelector('meta[name="theme-color"]');if(m){if(!m.getAttribute('data-light')){m.setAttribute('data-light',m.getAttribute('content')||'')}if(d){m.setAttribute('content','${DARK_APP_GROUND}')}}
if(d){var l=document.querySelector('link[rel="manifest"]');if(l&&l.href.indexOf('theme=')<0){l.href+=(l.href.indexOf('?')<0?'?':'&')+'theme=dark'}}
}catch(e){}`;

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
  const favicon = storagePublicUrl('avatars', userGym?.logo_url) || '/logo.jpg';
  const appleIcon = await getAppleTouchIconUrl();

  return {
    title: {
      default: brand,
      template: `%s | ${brand}`,
    },
    description: t('tagline'),
    // OFF-1: link the web-app manifest so the app is INSTALLABLE (desktop Chrome
    // "Install app" + mobile A2HS). PWA-IDENTITY: the dynamic /manifest.webmanifest
    // route resolves the gym by Host. W2c §5: the link carries the PAGE's locale,
    // so the installed app opens in the installing user's language (start_url/
    // lang/dir/description vary per locale; the boot script appends &theme=dark
    // for the splash-ground approximation).
    manifest: `/manifest.webmanifest?locale=${locale}`,
    // AX-3: the gym logo as the favicon (there was no /favicon.ico → 404); the
    // signed-in user's gym logo when set, else the PRO LINE default.
    // W2c §5 Apple layer: apple-touch-icon from the processed maskable set when
    // the gym has one (180×180), else the shipped 192 square.
    icons: { icon: favicon, apple: appleIcon },
    // W2c §5 Apple layer: installed-grade on iOS — standalone-capable, the
    // status bar draws over the app's own §2.1 status zone, and the home-screen
    // title is the USER's gym.
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: brand,
    },
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
  // DS-2: the per-request CSP nonce (prod). Same header the marketing/schedule/
  // today server components already read for their nonce'd <style> blocks.
  const nonce = headers().get('X-CSP-Nonce') ?? '';

  return (
    // suppressHydrationWarning: the init script adds .dark to <html> before React
    // hydrates, so the client className legitimately differs from the SSR'd one.
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'} translate="no" suppressHydrationWarning>
      <body
        className={cn(
          GeistSans.variable,
          arabic.variable,
          displayLatin.variable,
          displayArabic.variable,
          'min-h-screen bg-gray-50',
          isRTL ? 'font-arabic' : 'font-latin'
        )}
      >
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <StrictIntlProvider messages={messages} locale={locale} timeZone={GYM_TIME_ZONE}>
          {children}
          <Toaster richColors position={isRTL ? 'bottom-left' : 'bottom-right'} />
          <UseToastRenderer />
        <DevSwCleanup />
        <ServiceWorkerRegister />
        </StrictIntlProvider>
      </body>
    </html>
  );
}
