import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { LandingImage } from './LandingImage';

type GallerySectionProps = {
  locale: string;
};

const GYM_PHOTOS = [1, 2, 3, 4, 5, 6] as const;

export async function GallerySection({ locale }: GallerySectionProps) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('landing.gallery');

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
