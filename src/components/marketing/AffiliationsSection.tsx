import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { LandingImage } from './LandingImage';
import { LandingSectionEmpty } from './LandingSectionEmpty';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';
import type { LandingImageRow } from './landing-images';
import { pickCaption } from './landing-images';

type AffiliationsSectionProps = {
  locale: string;
  gymSlug?: string;
};

// ADM-1: the four REAL logo files the operator dropped (graceful text fallback
// stays via LandingImage). The arab-muaythai slot had no asset — removed.
const AFFILIATIONS = [
  { file: 'lmf.jpg', key: 'lmf' },
  { file: 'ifma.png', key: 'ifma' },
  { file: 'lmmaf.png', key: 'lmmaf' },
  { file: 'mma-lebanon.jpg', key: 'mmaLebanon' },
] as const;

export async function AffiliationsSection({ locale, gymSlug }: AffiliationsSectionProps) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('landing.affiliations');

  // LANDING-CONTENT: THIS gym's affiliation logos when present; ZERO rows → the
  // built-in Proline set below renders EXACTLY as before.
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  const supabase = await createClient();
  const { data } = gym
    ? await supabase.rpc('get_landing_images', { p_gym_id: gym.id, p_section: 'affiliations' })
    : { data: null };
  const rows = (data || []) as LandingImageRow[];
  const isDefault = gym?.slug === DEFAULT_GYM_SLUG;

  if (rows.length > 0) {
    return (
      <section id="affiliations" className="bg-secondary-950 py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className={cn('font-display text-2xl sm:text-3xl font-bold text-white')}>
              {t('title')}
            </h2>
            <p className="mt-2 text-sm text-gray-400 max-w-xl mx-auto">{t('subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 items-center justify-items-center">
            {rows.map((row) => {
              const caption = pickCaption(row, locale);
              return (
                <div key={row.id} className="flex flex-col items-center gap-3" data-testid="affiliation-slot">
                  <LandingImage
                    src={storagePublicUrl('gym-landing', row.image_url)}
                    alt={caption || t('title')}
                    fallbackLabel={caption || t('title')}
                    className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-contain bg-white/5 p-2 ring-1 ring-white/10"
                  />
                  {caption && <span className="text-xs text-gray-400 text-center max-w-[8rem]">{caption}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // M2-C: the built-in Proline affiliation logos are DEMO content — default gym only.
  // A non-default gym with no affiliation rows shows a tasteful empty state.
  if (!isDefault) {
    return (
      <LandingSectionEmpty id="affiliations" bgClass="bg-secondary-950" compact title={t('title')} subtitle={t('subtitle')} emptyLabel={t('empty')} isRTL={isRTL} />
    );
  }

  return (
    <section id="affiliations" className="bg-secondary-950 py-14 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className={cn('font-display text-2xl sm:text-3xl font-bold text-white')}>
            {t('title')}
          </h2>
          <p className="mt-2 text-sm text-gray-400 max-w-xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 items-center justify-items-center">
          {AFFILIATIONS.map((a) => (
            <div key={a.file} className="flex flex-col items-center gap-3" data-testid="affiliation-slot">
              <LandingImage
                src={`/landing/affiliations/${a.file}`}
                alt={t(a.key)}
                fallbackLabel={t(a.key)}
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl object-contain bg-white/5 p-2 ring-1 ring-white/10"
              />
              <span className="text-xs text-gray-400 text-center max-w-[8rem]">{t(a.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
