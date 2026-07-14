import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Dumbbell, Clock } from 'lucide-react';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type PtSectionProps = {
  locale: string;
  gymSlug?: string;
};

function localized(row: any, base: string, locale: string): string {
  return (locale === 'ar' ? row[`${base}_ar`] : locale === 'fr' ? row[`${base}_fr`] : row[`${base}_en`]) || row[`${base}_en`];
}

/**
 * Landing PT section (PT-1, journey-pt-360 §2C) — markets the gym's ACTIVE +
 * show_on_landing package types (anon read = the 000041 staged-publish policy,
 * same gate as classes) + the "private sessions available" CTA into the trial
 * form (23R entry). Renders nothing when the gym publishes no types.
 */
export async function PtSection({ locale, gymSlug }: PtSectionProps) {
  const t = await getTranslations({ locale, namespace: 'landing.pt' });
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  // CATALOG-SCOPE: per-gym definer RPC (000080) — active + show_on_landing types
  // of the active gym only; no blanket anon table read.
  const { data: types } = gym
    ? await supabase.rpc('get_landing_pt', { p_gym_id: gym.id })
    : { data: null };

  if (!types || types.length === 0) return null;

  return (
    <section id="pt" className="py-20 lg:py-28 bg-white" data-testid="landing-pt">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-secondary-900')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {types.map((p: any) => (
            <div key={p.id} data-testid="landing-pt-card" data-name-en={p.name_en}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-2">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--brand-soft)]">
                <Dumbbell className="h-5 w-5 text-[color:var(--brand)]" />
              </div>
              <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                {localized(p, 'name', locale)}
              </h3>
              <p className="mt-2">
                <span className="text-3xl font-bold text-secondary-900">${Number(p.price_usd).toFixed(0)}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {t('sessions', { n: p.session_count })}
              </p>
              {p.validity_days ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {t('valid', { n: p.validity_days })}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a href="#trial" data-testid="landing-pt-cta"
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[color:var(--brand-dark)]">
            <Dumbbell className="h-4 w-4" />
            {t('cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
