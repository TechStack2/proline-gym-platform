import { Inter, Noto_Naskh_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import { UseToastRenderer } from '@/components/ui/toaster';
import '@/app/globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin' });
const arabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
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
    icons: { icon: '/favicon.ico' },
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
