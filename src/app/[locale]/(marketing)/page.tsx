import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, getGymSlugByDomain, DEFAULT_GYM_SLUG, safeBrandColor } from '@/lib/marketing/gym';
import { HeroSection } from '@/components/marketing/HeroSection';
import { AffiliationsSection } from '@/components/marketing/AffiliationsSection';
import { DisciplinesSection } from '@/components/marketing/DisciplinesSection';
import { ScheduleSection } from '@/components/marketing/ScheduleSection';
import { ChampionsSection } from '@/components/marketing/ChampionsSection';
import { CoachesSection } from '@/components/marketing/CoachesSection';
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

  // WL-DOMAIN-ROUTING: which gym is this request for? ?gym= (explicit; CI + preview)
  // WINS, then the request Host (a mapped custom domain), then DEFAULT_GYM_SLUG (the
  // vendor/Railway domain → the demo — nothing regresses). Reads the proxied host
  // (x-forwarded-host, set by Cloudflare/Railway/Vercel) then the raw Host.
  const hdrs = headers();
  const domainSlug = await getGymSlugByDomain(hdrs.get('x-forwarded-host') || hdrs.get('host'));
  const gymSlug = searchParams?.gym || domainSlug || undefined;

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

  // WL-LANDING: resolve the gym's branding (name/logo/hero/color/tagline). Each
  // falls back to the built-in Proline default when the gym leaves it unset, so
  // the demo renders exactly as before and any gym renders its own look.
  const pick = (ar?: string | null, en?: string | null, fr?: string | null) =>
    (locale === 'ar' ? ar : locale === 'fr' ? fr : en) || en || undefined;
  const branding = {
    name: gym ? (pick(gym.name_ar, gym.name_en, gym.name_fr) || undefined) : undefined,
    logoUrl: gym?.logo_url || undefined,
    heroImageUrl: gym?.hero_image_url || undefined,
    brandColor: safeBrandColor(gym?.brand_color),
    tagline: gym ? pick(gym.tagline_ar, gym.tagline_en, gym.tagline_fr) : undefined,
  };

  return (
    <>
      <HeroSection locale={locale} branding={branding} />
      <AffiliationsSection locale={locale} />
      <DisciplinesSection locale={locale} gymSlug={sectionSlug} />
      <ScheduleSection locale={locale} gymSlug={sectionSlug} />
      <ChampionsSection locale={locale} />
      <CoachesSection locale={locale} gymSlug={sectionSlug} />
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
