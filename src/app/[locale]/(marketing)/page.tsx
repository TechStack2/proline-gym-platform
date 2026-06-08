import { getTranslations } from 'next-intl/server';
import { HeroSection } from '@/components/marketing/HeroSection';
import { DisciplinesSection } from '@/components/marketing/DisciplinesSection';
import { WhySection } from '@/components/marketing/WhySection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { FacilitySection } from '@/components/marketing/FacilitySection';
import { TrialCTASection } from '@/components/marketing/TrialCTASection';

type Props = {
  params: { locale: string };
};

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

function getLocalizedCampName(camp: any, locale: string): string {
  if (locale === 'ar') return camp.name_ar || camp.name_en;
  if (locale === 'fr') return camp.name_fr || camp.name_en;
  return camp.name_en;
}

export default async function LandingPage({ params }: Props) {
  const { locale } = params;
  const t = await getTranslations('camps');
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];
  const { data: upcomingCamps } = await supabase
    .from('camps')
    .select('*')
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .limit(3);

  return (
    <>
      <HeroSection locale={locale} />
      <DisciplinesSection locale={locale} />
      <WhySection locale={locale} />
      <PricingSection locale={locale} />

      {(upcomingCamps && upcomingCamps.length > 0) && (
        <section id="camps" className="py-20 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('upcoming_camps')}
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                {t('upcoming_subtitle')}
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {upcomingCamps.map((camp: any) => (
                <div key={camp.id} className="bg-gray-800 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-white mb-3">
                    {getLocalizedCampName(camp, locale)}
                  </h3>
                  <p className="text-sm text-gray-400 mb-1">
                    {new Date(camp.start_date).toLocaleDateString()} - {new Date(camp.end_date).toLocaleDateString()}
                  </p>
                  {camp.price_usd && <p className="text-primary-400 font-medium text-sm mt-2">${camp.price_usd}</p>}
                  <Link href={`/${locale}/auth/login`} className="inline-block mt-3 text-sm text-primary-400 hover:text-primary-300 font-medium">
                    {t('register_now')}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <FacilitySection locale={locale} />
      <TrialCTASection locale={locale} />
    </>
  );
}
