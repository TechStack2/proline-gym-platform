import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Medal, Building2, Users2 } from 'lucide-react';

type WhySectionProps = {
  locale: string;
  // TENANT-CONTENT: the default gym keeps the curated "Why PRO LINE?" + founder/location
  // copy; every other tenant gets a brand-neutral variant (no "PRO LINE" / "Fakih
  // Brothers" / "Sky Business Center" leak).
  isDefault?: boolean;
};

// AX-1: copy lives in landing.why.* (the ar/en field pair dropped fr).
// LANDING DA-57: the value-prop tiles ride the ONE brand icon-tile idiom (the
// pricing/schedule section-icon recipe) — the amber/blue/green candy gradients
// were three extra accent families against the brand on one screen.
const reasons = [
  { key: 'coaches', icon: Medal },
  { key: 'facility', icon: Building2 },
  { key: 'community', icon: Users2 },
];

export function WhySection({ locale, isDefault = false }: WhySectionProps) {
  const t = useTranslations('landing.why');
  const isRTL = locale === 'ar';
  // The coaches/facility descriptions name the Proline founders + the Baabda address;
  // swap to neutral copy off the default gym.
  const descKey = (key: string) =>
    (!isDefault && (key === 'coaches' || key === 'facility') ? `${key}DescAlt` : `${key}Desc`) as Parameters<typeof t>[0];

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2
            className={cn(
              // DISPLAY-FONT: .font-display owns the AR font too (via [dir="rtl"]); no
              // font-arabic here — twMerge would drop the earlier font-family class.
              'font-display text-3xl sm:text-4xl font-bold text-secondary-900'
            )}
          >
            {isDefault ? t('title') : t('titleAlt')}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reasons.map((reason) => {
            const Icon = reason.icon;
            return (
              <div key={reason.key} className="text-center group">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600/10 ring-1 ring-primary-500/20 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className={cn('text-xl font-semibold text-secondary-900 mb-3', isRTL && 'font-arabic')}>
                  {t(`${reason.key}Title` as Parameters<typeof t>[0])}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {t(descKey(reason.key))}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}