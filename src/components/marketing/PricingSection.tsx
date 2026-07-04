import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Check, Zap, CalendarClock } from 'lucide-react';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type PricingSectionProps = {
  locale: string;
  gymSlug?: string;
};

// Static perk copy keyed by plan duration (the DB carries the names + prices).
const PERKS: Record<string, { en: string[]; ar: string[]; fr: string[] }> = {
  monthly: {
    en: ['All group classes', 'Locker room access', '1 guest pass/month'],
    ar: ['كل الحصص الجماعية', 'غرفة تبديل الملابس', 'بطاقة ضيف واحدة/شهر'],
    fr: ['Tous les cours collectifs', 'Accès vestiaire', '1 invité/mois'],
  },
  quarterly: {
    en: ['All Monthly perks', '1 PT session/month', 'Priority class booking'],
    ar: ['كل مميزات الشهري', 'جلسة تدريب خاص/شهر', 'حجز أولوية للحصص'],
    fr: ['Avantages mensuels', '1 séance PT/mois', 'Réservation prioritaire'],
  },
  annual: {
    en: ['All Quarterly perks', 'Unlimited PT sessions', 'Exclusive PRO LINE gear'],
    ar: ['كل مميزات الربع سنوي', 'جلسات PT غير محدودة', 'معدات برو لاين حصرية'],
    fr: ['Avantages trimestriels', 'Séances PT illimitées', 'Équipement PRO LINE'],
  },
};

function perkTier(durationDays: number): keyof typeof PERKS {
  if (durationDays >= 300) return 'annual';
  if (durationDays >= 80) return 'quarterly';
  return 'monthly';
}

function localized(row: any, base: string, locale: string): string {
  return (locale === 'ar' ? row[`${base}_ar`] : locale === 'fr' ? row[`${base}_fr`] : row[`${base}_en`]) || row[`${base}_en`];
}

export async function PricingSection({ locale, gymSlug }: PricingSectionProps) {
  const t = await getTranslations({ locale, namespace: 'landing.pricing' });
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  // CATALOG-SCOPE: per-gym definer RPCs (000080) — no blanket anon table reads.
  const { data: plans } = gym
    ? await supabase.rpc('get_landing_plans', { p_gym_id: gym.id })
    : { data: null };

  // Classes that carry a monthly fee (B2) — shown as the per-program option.
  const { data: feeClasses } = gym
    ? await supabase.rpc('get_landing_class_fees', { p_gym_id: gym.id })
    : { data: null };

  const hasPlans = !!(plans && plans.length > 0);

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        {/* Membership plans (live, gym-scoped; static fallback if none yet) */}
        {hasPlans ? (
          <div data-testid="pricing-plans" className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans!.map((plan: any, i: number) => {
              const tier = perkTier(plan.duration_days);
              const isAnnual = tier === 'annual';
              const perks = PERKS[tier][locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'];
              const period = plan.duration_days >= 300 ? t('perYr') : plan.duration_days >= 80 ? t('per3mo') : t('perMo');
              return (
                <div key={i} className={cn('relative rounded-2xl bg-white p-8 shadow-elevation-1 hover:shadow-elevation-3 transition-all duration-300 hover:-translate-y-1', isAnnual && 'ring-2 ring-amber-400 shadow-elevation-2')}>
                  {isAnnual && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-900">
                      <Zap className="h-3 w-3" />{t('bestValue')}
                    </div>
                  )}
                  <h3 className={cn('text-xl font-semibold text-secondary-900', isRTL && 'font-arabic')}>{localized(plan, 'name', locale)}</h3>
                  <p className="mt-4">
                    <span className="text-4xl font-bold text-secondary-900">${Number(plan.price_usd).toFixed(0)}</span>
                    <span className="text-gray-500 text-sm">/{period}</span>
                  </p>
                  {plan.price_lbp ? <p className="text-xs text-gray-400 mt-1">{Number(plan.price_lbp).toLocaleString()} LBP</p> : null}
                  <ul className="mt-6 space-y-3">
                    {perks.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <a href="#trial" className={cn('block text-center rounded-xl px-6 py-3 text-sm font-semibold transition-all hover:scale-105 active:scale-95', isAnnual ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-glow-primary' : 'bg-secondary-900 text-white hover:bg-secondary-800')}>
                      {t('getStarted')}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-400" data-testid="pricing-plans-empty">
            {t('empty')}
          </p>
        )}

        {/* Per-class monthly fees (B2 recurring-class registration) */}
        {feeClasses && feeClasses.length > 0 && (
          <div className="mt-14" data-testid="pricing-class-fees">
            <div className="text-center mb-8">
              <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600/10 ring-1 ring-primary-500/20">
                <CalendarClock className="h-5 w-5 text-primary-600" />
              </div>
              <h3 className={cn('text-2xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
                {t('classRegTitle')}
              </h3>
              <p className="mt-2 text-sm text-gray-500 max-w-xl mx-auto">
                {t('classRegSubtitle')}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {feeClasses.map((c: any) => (
                <div key={c.id} className="rounded-xl bg-white p-5 text-center shadow-elevation-1">
                  <p className={cn('text-sm font-semibold text-secondary-900', isRTL && 'font-arabic')}>{localized(c, 'name', locale)}</p>
                  <p className="mt-2 text-2xl font-bold text-primary-600">${Number(c.monthly_fee_usd).toFixed(0)}<span className="text-xs text-gray-400 font-normal">/{t('perMo')}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
