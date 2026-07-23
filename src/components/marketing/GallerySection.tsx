import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { LandingImage } from './LandingImage';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';
import type { LandingImageRow } from './landing-images';
import { pickCaption } from './landing-images';

type GallerySectionProps = {
  locale: string;
  gymSlug?: string;
};

const GYM_PHOTOS = [1, 2, 3, 4, 5, 6] as const;

export async function GallerySection({ locale, gymSlug }: GallerySectionProps) {
  const t = await getTranslations('landing.gallery');

  // LANDING-CONTENT: THIS gym's gallery rows when present; ZERO rows → the
  // built-in Proline mosaic below renders EXACTLY as before.
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  const supabase = await createClient();
  const { data } = gym
    ? await supabase.rpc('get_landing_images', { p_gym_id: gym.id, p_section: 'gallery' })
    : { data: null };
  const rows = (data || []) as LandingImageRow[];
  const isDefault = gym?.slug === DEFAULT_GYM_SLUG;

  if (rows.length > 0) {
    return (
      // LANDING DA-27: designed-dark band — pinned in both themes (see ScheduleSection).
      <section id="gallery" className="surface-fixed-dark bg-secondary-950 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-white')}>
              {t('title')}
            </h2>
            <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {rows.map((row, i) => {
              const caption = pickCaption(row, locale);
              const feature = i === 0; // first tile anchors the flyer-style mosaic
              return (
                <div
                  key={row.id}
                  data-testid="landing-gallery-tile"
                  className={cn(
                    'group relative overflow-hidden rounded-2xl ring-1 ring-white/10',
                    feature && 'md:col-span-2 md:row-span-2'
                  )}
                >
                  <LandingImage
                    src={storagePublicUrl('gym-landing', row.image_url)}
                    alt={caption || t('title')}
                    fallbackLabel={caption || t('title')}
                    fallbackClassName={feature ? 'aspect-square md:aspect-[4/3]' : 'aspect-square'}
                    className={cn(
                      'w-full object-cover transition-transform duration-300 group-hover:scale-105',
                      feature ? 'aspect-square md:aspect-[4/3]' : 'aspect-square'
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // M2-C: the built-in Proline gym mosaic is DEMO content — default gym only.
  // LANDING DA-13 (§115 decree): a non-default gym with no gallery rows renders
  // NO section — public surfaces collapse, never placeholder.
  if (!isDefault) return null;

  return (
    <section id="gallery" className="surface-fixed-dark bg-secondary-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-white')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {GYM_PHOTOS.map((n) => (
            <div
              key={n}
              className={cn(
                'group relative overflow-hidden rounded-2xl ring-1 ring-white/10',
                // first tile spans 2 cols on larger screens for a flyer-style mosaic
                n === 1 && 'md:col-span-2 md:row-span-2'
              )}
            >
              <LandingImage
                src={`/landing/gym-${n}.jpg`}
                alt={`PRO LINE Gym — ${n}`}
                fallbackLabel={`gym-${n}.jpg`}
                fallbackClassName={n === 1 ? 'aspect-square md:aspect-[4/3]' : 'aspect-square'}
                className={cn(
                  'w-full object-cover transition-transform duration-300 group-hover:scale-105',
                  n === 1 ? 'aspect-square md:aspect-[4/3]' : 'aspect-square'
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
