import { DevSwCleanup } from '@/components/dev/sw-cleanup'
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import { UseToastRenderer } from '@/components/ui/toaster';
import '@/app/globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
// AX-1 (client: "the font is not the best"): IBM Plex Sans Arabic over the old
// Noto NASKH (a traditional serif-class face — wrong register for app UI) and
// over Cairo (rounder, display-leaning). Plex Sans Arabic is a UI text face
// designed alongside a Latin companion, so it sits naturally next to Inter at
// matching x-height/weight. next/font self-hosts + injects a size-adjusted
// local fallback automatically (adjustFontFallback), so swap causes no CLS.
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
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

  return {
    title: {
      default: t('name'),
      template: `%s | ${t('name')}`,
    },
    description: t('tagline'),
    // AX-3: use the PRO LINE logo as the favicon (there was no /favicon.ico → 404).
    icons: { icon: '/logo.jpg' },
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
          latin.variable,
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
