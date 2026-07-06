import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Award, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type CoachesSectionProps = {
  locale: string;
  gymSlug?: string;
};

type LandingCoach = {
  id: string;
  first_name_ar: string | null; first_name_en: string | null; first_name_fr: string | null;
  last_name_ar: string | null; last_name_en: string | null; last_name_fr: string | null;
  avatar_url: string | null;
  specialization_ar: string | null; specialization_en: string | null; specialization_fr: string | null;
  bio_ar: string | null; bio_en: string | null; bio_fr: string | null;
  landing_status: string;
};

const pick = (row: any, base: string, locale: string): string =>
  (row?.[`${base}_${locale}`] || row?.[`${base}_en`] || '') as string;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '·';

/**
 * COACH-LP — the grandiose public coach showcase. Reads ONLY published,
 * landing_visible coaches via the SECURITY DEFINER `get_landing_coaches` RPC
 * (never drafts / hidden coaches — the leak guard lives in the DB). Current
 * coaches lead; `coming_soon` coaches get a tasteful teaser treatment. Anon,
 * read-time, i18n ar/en/fr + RTL, on-brand crimson.
 */
export async function CoachesSection({ locale, gymSlug }: CoachesSectionProps) {
  const t = await getTranslations({ locale, namespace: 'landing.coachesSec' });
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  const { data } = gym
    ? await supabase.rpc('get_landing_coaches', { p_gym_id: gym.id })
    : { data: null };
  const coaches = (data || []) as LandingCoach[];

  // Empty → render nothing (no hollow section on a gym with no published coaches).
  if (coaches.length === 0) return null;

  return (
    <section id="coaches" className="bg-secondary-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/15 ring-1 ring-primary-500/30">
            <Award className="h-6 w-6 text-primary-400" />
          </div>
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'font-arabic')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {coaches.map((c) => {
            const name = [pick(c, 'first_name', locale), pick(c, 'last_name', locale)].filter(Boolean).join(' ').trim();
            const specialty = pick(c, 'specialization', locale);
            const bio = pick(c, 'bio', locale);
            const comingSoon = c.landing_status === 'coming_soon';
            return (
              <article
                key={c.id}
                data-testid="landing-coach-card"
                data-status={c.landing_status}
                dir={isRTL ? 'rtl' : 'ltr'}
                className={cn(
                  'group relative overflow-hidden rounded-3xl ring-1 ring-white/10 bg-gradient-to-b from-secondary-900 to-secondary-950',
                  'p-6 flex flex-col items-center text-center transition-transform duration-300 hover:-translate-y-1',
                  comingSoon && 'opacity-95',
                )}
              >
                {/* avatar */}
                <div className="relative mb-5">
                  <div className={cn(
                    'h-28 w-28 rounded-2xl ring-2 ring-primary-500/40 overflow-hidden bg-secondary-800',
                    'flex items-center justify-center shadow-lg shadow-black/40',
                  )}>
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar_url} alt={name} className={cn('h-full w-full object-cover', comingSoon && 'grayscale')} />
                    ) : (
                      <span className="text-3xl font-extrabold text-primary-300">{initials(name)}</span>
                    )}
                  </div>
                  {comingSoon && (
                    <span
                      data-testid="coach-coming-soon-badge"
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary-600 px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-md"
                    >
                      <Clock className="h-3 w-3" /> {t('comingSoon')}
                    </span>
                  )}
                </div>

                <h3 className={cn('text-xl font-bold text-white', isRTL && 'font-arabic')} data-testid="coach-name">
                  {name || '—'}
                </h3>

                {specialty && (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5" data-testid="coach-specialty">
                    {specialty.split(/[,،/]+/).map((s) => s.trim()).filter(Boolean).map((s) => (
                      <span key={s} className="rounded-full bg-primary-500/15 px-3 py-1 text-xs font-medium text-primary-300 ring-1 ring-primary-500/30">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {bio && (
                  <p className={cn('mt-4 text-sm leading-relaxed text-gray-400 line-clamp-4', isRTL && 'text-right')} data-testid="coach-bio">
                    {bio}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
