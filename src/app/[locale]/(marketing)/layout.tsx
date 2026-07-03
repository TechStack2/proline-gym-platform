import type { Viewport } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { THEME_COLOR } from '@/lib/seo';

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default async function MarketingLayout({ children, params }: Props) {
  const { locale } = params;
  setRequestLocale(locale); // see [locale]/layout.tsx — required under generateStaticParams

  return (
    <div className="min-h-screen flex flex-col">
      {/* SEO-PER-GYM / PROLINE-LANDING-DATA: generateMetadata, the JSON-LD block,
          and LandingNav/LandingFooter all live in page.tsx — a layout cannot read
          searchParams, so only the page can resolve which gym the request is for
          (?gym= || custom domain || default) and emit THAT gym's <head> + chrome. */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
