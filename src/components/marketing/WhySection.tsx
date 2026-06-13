import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Medal, Building2, Users2 } from 'lucide-react';

type WhySectionProps = {
  locale: string;
};

// AX-1: copy lives in landing.why.* (the ar/en field pair dropped fr).
const reasons = [
  { key: 'coaches', icon: Medal, color: 'from-amber-400 to-yellow-600' },
  { key: 'facility', icon: Building2, color: 'from-blue-400 to-cyan-600' },
  { key: 'community', icon: Users2, color: 'from-green-400 to-emerald-600' },
];

export function WhySection({ locale }: WhySectionProps) {
  const t = useTranslations('landing.why');
  const isRTL = locale === 'ar';

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2
            className={cn(
              'text-3xl sm:text-4xl font-bold text-secondary-900',
              isRTL && 'font-arabic'
            )}
          >
            {t('title')}
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
                <div
                  className={cn(
                    'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-300',
                    reason.color
                  )}
                >
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <h3 className={cn('text-xl font-semibold text-secondary-900 mb-3', isRTL && 'font-arabic')}>
                  {t(`${reason.key}Title` as Parameters<typeof t>[0])}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {t(`${reason.key}Desc` as Parameters<typeof t>[0])}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}