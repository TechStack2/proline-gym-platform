import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { LandingImage } from './LandingImage';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import type { LandingImageRow } from './landing-images';
import { pickCaption } from './landing-images';

type GallerySectionProps = {
  locale: string;
  gymSlug?: string;
};

const GYM_PHOTOS = [1, 2, 3, 4, 5, 6] as const;

export async function GallerySection({ locale, gymSlug }: GallerySectionProps) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('landing.gallery');

  // LANDING-CONTENT: THIS gym's gallery rows when present; ZERO rows → the
  // built-in Proline mosaic below renders EXACTLY as before.
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  const supabase = await createClient();
  const { data } = gym
    ? await supabase.rpc('get_landing_images', { p_gym_id: gym.id, p_section: 'gallery' })
    : { data: null };
  const rows = (data || []) as LandingImageRow[];

  if (rows.length > 0) {
    return (
      <section id="gallery" className="bg-secondary-950 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'font-arabic')}>
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
                    src={row.image_url}
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

  return (
    <section id="gallery" className="bg-secondary-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'font-arabic')}>
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
