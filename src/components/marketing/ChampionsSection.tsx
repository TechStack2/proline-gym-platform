import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';
import { LandingImage } from './LandingImage';
import { LandingSectionEmpty } from './LandingSectionEmpty';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';
import type { LandingImageRow } from './landing-images';
import { pickCaption } from './landing-images';

type ChampionsSectionProps = {
  locale: string;
  gymSlug?: string;
};

const CHAMPIONS = [
  { slot: 'champions-1.jpg', caption: 'c1' },
  { slot: 'champions-2.jpg', caption: 'c2' },
  { slot: 'champions-3.jpg', caption: 'c3' },
  { slot: 'champions-4.jpg', caption: 'c4' },
] as const;

export async function ChampionsSection({ locale, gymSlug }: ChampionsSectionProps) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('landing.champions');

  // LANDING-CONTENT: render THIS gym's champion rows when it has any (anon RPC,
  // the get_landing_coaches pattern); ZERO rows → the built-in Proline set below
  // renders EXACTLY as before (demo parity without seeding).
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  const supabase = await createClient();
  const { data } = gym
    ? await supabase.rpc('get_landing_images', { p_gym_id: gym.id, p_section: 'champions' })
    : { data: null };
  const rows = (data || []) as LandingImageRow[];
  const isDefault = gym?.slug === DEFAULT_GYM_SLUG;

  if (rows.length > 0) {
    return (
      <section id="champions" className="bg-secondary-900 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/15 ring-1 ring-primary-500/30">
              <Trophy className="h-6 w-6 text-primary-400" />
            </div>
            <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-white')}>
              {t('title')}
            </h2>
            <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {rows.map((row) => {
              const caption = pickCaption(row, locale);
              return (
                <figure
                  key={row.id}
                  data-testid="landing-champion"
                  className="group relative overflow-hidden rounded-2xl ring-1 ring-white/10 bg-secondary-950"
                >
                  <LandingImage
                    src={storagePublicUrl('gym-landing', row.image_url)}
                    alt={caption || t('title')}
                    fallbackLabel={caption || t('title')}
                    fallbackClassName="aspect-[3/4]"
                    className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-10">
                      <figcaption className="text-xs sm:text-sm font-medium text-white leading-snug">
                        {caption}
                      </figcaption>
                    </div>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // M2-C: the built-in Proline champions are DEMO content — render them ONLY on the
  // default gym. A non-default gym with no champion rows shows a tasteful empty state,
  // never Proline's athletes.
  if (!isDefault) {
    return (
      <LandingSectionEmpty id="champions" bgClass="bg-secondary-900" title={t('title')} subtitle={t('subtitle')} emptyLabel={t('empty')} isRTL={isRTL} />
    );
  }

  return (
    <section id="champions" className="bg-secondary-900 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/15 ring-1 ring-primary-500/30">
            <Trophy className="h-6 w-6 text-primary-400" />
          </div>
          <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-white')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {CHAMPIONS.map((c) => (
            <figure
              key={c.slot}
              className="group relative overflow-hidden rounded-2xl ring-1 ring-white/10 bg-secondary-950"
            >
              <LandingImage
                src={`/landing/${c.slot}`}
                alt={t(c.caption)}
                fallbackLabel={t(c.caption)}
                fallbackClassName="aspect-[3/4]"
                className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-10">
                <figcaption className="text-xs sm:text-sm font-medium text-white leading-snug">
                  {t(c.caption)}
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
