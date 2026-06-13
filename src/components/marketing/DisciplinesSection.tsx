import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Dumbbell, Heart, Music, Users, Shield, Baby } from 'lucide-react';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type DisciplinesSectionProps = {
  locale: string;
  gymSlug?: string;
};

// ADM-1 tenant-clean: icons/colors rotate by row position — disciplines are
// per-gym DATA (the SSOT is the disciplines table), never name-keyed constants.
const ICONS: React.ComponentType<{ className?: string }>[] = [Dumbbell, Shield, Heart, Music, Users, Baby];
const COLORS: string[] = [
  'from-red-500 to-orange-500',
  'from-blue-500 to-indigo-500',
  'from-green-500 to-emerald-500',
  'from-pink-500 to-purple-500',
  'from-violet-500 to-fuchsia-500',
  'from-yellow-500 to-amber-500',
];

export async function DisciplinesSection({ locale, gymSlug }: DisciplinesSectionProps) {
  const t = await getTranslations({ locale, namespace: 'landing.disciplinesSec' });
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  // GYM-FILTER + active only (anon-readable via 000035) — SSOT, no fallback list.
  const { data: disciplines } = gym
    ? await supabase
        .from('disciplines')
        .select('name_ar, name_en, name_fr')
        .eq('gym_id', gym.id)
        .eq('is_active', true)
        .order('sort_order')
    : { data: null };

  const programs = (disciplines || []).map((d: any, i: number) => ({
    name: d[`name_${locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'}`] || d.name_en,
    key: d.name_en,
    idx: i,
  }));

  return (
    <section id="disciplines" className="py-20 lg:py-28 bg-gray-50">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program: { name: string; key: string; idx: number }) => {
            const Icon = ICONS[program.idx % ICONS.length] || Dumbbell;
            const gradient = COLORS[program.idx % COLORS.length] || 'from-primary-500 to-primary-700';

            return (
              <div
                key={program.key}
                className="group relative rounded-2xl bg-white p-6 shadow-elevation-1 hover:shadow-elevation-3 transition-all duration-300 hover:-translate-y-1"
              >
                <div
                  className={cn(
                    'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br',
                    gradient
                  )}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                  {program.name}
                </h3>
                <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 group-hover:w-20 transition-all duration-300" />
              </div>
            );
          })}
        </div>

        {(!disciplines || disciplines.length === 0) && (
          <p className="text-center text-gray-400" data-testid="disciplines-empty">
            {t('empty')}
          </p>
        )}
      </div>
    </section>
  );
}