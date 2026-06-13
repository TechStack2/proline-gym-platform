import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { cn } from '@/lib/utils';
import '@/app/globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export default async function AuthLayout({ children, params }: Props) {
  const { locale } = params;
  const messages = await getMessages();
  const isRTL = locale === 'ar';

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
