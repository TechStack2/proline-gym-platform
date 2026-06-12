import { HeroSection } from '@/components/marketing/HeroSection';
import { AffiliationsSection } from '@/components/marketing/AffiliationsSection';
import { DisciplinesSection } from '@/components/marketing/DisciplinesSection';
import { ScheduleSection } from '@/components/marketing/ScheduleSection';
import { ChampionsSection } from '@/components/marketing/ChampionsSection';
import { GallerySection } from '@/components/marketing/GallerySection';
import { WhySection } from '@/components/marketing/WhySection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { PtSection } from '@/components/marketing/PtSection';
import { FacilitySection } from '@/components/marketing/FacilitySection';
import { TrialCTASection } from '@/components/marketing/TrialCTASection';

export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string };
  // X1: an explicit gym selector so CI's public-lead submit + catalog target the
  // run gym; prod (no ?gym) falls back to the demo gym (DEFAULT_GYM_SLUG).
  searchParams?: { gym?: string };
};

/**
 * Public landing (Cycle 5 / V1 / LP). Renders the brand + the gym's live catalog
 * to LOGGED-OUT visitors via the anon public-read policies (000035): disciplines,
 * weekly schedule grid, membership plans + class monthly fees. Section order is
 * the validated structure. All data sections are gym-scoped + active-only.
 */
export default async function LandingPage({ params: { locale }, searchParams }: Props) {
  const gymSlug = searchParams?.gym;

  return (
    <>
      <HeroSection locale={locale} />
      <AffiliationsSection locale={locale} />
      <DisciplinesSection locale={locale} gymSlug={gymSlug} />
      <ScheduleSection locale={locale} gymSlug={gymSlug} />
      <ChampionsSection locale={locale} />
      <GallerySection locale={locale} />
      <WhySection locale={locale} />
      <PricingSection locale={locale} gymSlug={gymSlug} />
      <PtSection locale={locale} gymSlug={gymSlug} />
      <FacilitySection locale={locale} />
      <TrialCTASection locale={locale} gymSlug={gymSlug} />
    </>
  );
}
