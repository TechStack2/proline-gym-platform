import { LandingNav } from '@/components/layout/LandingNav';
import { LandingFooter } from '@/components/layout/LandingFooter';

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export default async function MarketingLayout({ children, params }: Props) {
  const { locale } = params;

  return (
    <div className="min-h-screen flex flex-col">
      <LandingNav locale={locale} />
      <main className="flex-1">{children}</main>
      <LandingFooter locale={locale} />
    </div>
  );
}