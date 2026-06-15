import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { HeroSection } from '@/components/marketing/HeroSection';
import { AffiliationsSection } from '@/components/marketing/AffiliationsSection';
import { DisciplinesSection } from '@/components/marketing/DisciplinesSection';
import { ScheduleSection } from '@/components/marketing/ScheduleSection';
import { ChampionsSection } from '@/components/marketing/ChampionsSection';
import { GallerySection } from '@/components/marketing/GallerySection';
import { WhySection } from '@/components/marketing/WhySection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { PtSection } from '@/components/marketing/PtSection';
import { CampsSection } from '@/components/marketing/CampsSection';
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
  setRequestLocale(locale); // pages render independently of layouts — both need it
  const gymSlug = searchParams?.gym;

  // GRW-1: gym's active disciplines (anon-readable, 000035) → trial-capture
  // interest chips. One fetch here keeps the chips id-accurate for the RPC.
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  // AX-2 (defect 4): the RESOLVED, post-fallback slug. On the bare prod landing
  // (no ?gym=) the raw `gymSlug` is undefined → the trial RPC got p_gym_slug=null
  // → 'invalid' → dead form. Every gym-scoped section gets the resolved slug.
  const sectionSlug = gym?.slug ?? DEFAULT_GYM_SLUG;
  const supabase = await createClient();
  const { data: discRows } = gym
    ? await supabase.from('disciplines').select('id, name_ar, name_en, name_fr')
        .eq('gym_id', gym.id).eq('is_active', true).order('sort_order')
    : { data: null };
  const captureDisciplines = (discRows ?? []).map((d: any) => ({
    id: d.id,
    name: (locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en,
  }));

  return (
    <>
      <HeroSection locale={locale} />
      <AffiliationsSection locale={locale} />
      <DisciplinesSection locale={locale} gymSlug={sectionSlug} />
      <ScheduleSection locale={locale} gymSlug={sectionSlug} />
      <ChampionsSection locale={locale} />
      <GallerySection locale={locale} />
      <WhySection locale={locale} />
      <PricingSection locale={locale} gymSlug={sectionSlug} />
      <PtSection locale={locale} gymSlug={sectionSlug} />
      <CampsSection locale={locale} gymSlug={sectionSlug} />
      <FacilitySection locale={locale} />
      <TrialCTASection locale={locale} gymSlug={sectionSlug} disciplines={captureDisciplines} />
    </>
  );
}
