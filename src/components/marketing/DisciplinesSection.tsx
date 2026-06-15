import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type DisciplinesSectionProps = {
  locale: string;
  gymSlug?: string;
};

// AX-2 tenant-clean icon MAP — keyed on combat-sport KEYWORDS in the discipline's
// English name (not row position, which gave MMA a music note). A sensible
// default covers unknown disciplines for any gym. `kick` is checked before `box`
// so "Kick Boxing" doesn't fall into the boxing-glove bucket. (Emoji chosen for
// crisp cross-platform rendering with no asset pipeline; a trivial swap to SVGs.)
const ICON_MAP: { kw: string[]; key: string; glyph: string; gradient: string }[] = [
  { kw: ['kick'], key: 'kickboxing', glyph: '🦵', gradient: 'from-blue-500 to-indigo-500' },
  { kw: ['muay'], key: 'muaythai', glyph: '🥋', gradient: 'from-red-500 to-orange-500' },
  { kw: ['mma', 'mixed'], key: 'mma', glyph: '🤼', gradient: 'from-violet-500 to-fuchsia-500' },
  { kw: ['box'], key: 'boxing', glyph: '🥊', gradient: 'from-rose-500 to-red-600' },
  { kw: ['karate', 'taekwondo', 'judo', 'jiu', 'bjj', 'grappl', 'wrestl'], key: 'grappling', glyph: '🥋', gradient: 'from-emerald-500 to-green-600' },
];
const DEFAULT_ICON = { key: 'default', glyph: '🥊', gradient: 'from-primary-500 to-primary-700' };

function disciplineIcon(nameEn: string) {
  const n = (nameEn || '').toLowerCase();
  for (const m of ICON_MAP) if (m.kw.some((k) => n.includes(k))) return m;
  return DEFAULT_ICON;
}

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

  const programs = (disciplines || []).map((d: any) => ({
    name: d[`name_${locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en'}`] || d.name_en,
    nameEn: d.name_en as string,
    icon: disciplineIcon(d.name_en),
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
            {t('subtitle', { count: programs.length })}
          </p>
        </div>

        {/* AX-2: flex-wrap + justify-center with fixed-width cards → any count
            stacks centered (4 cards no longer orphan a lonely 4th in a 3-col grid). */}
        <div className="flex flex-wrap justify-center gap-6">
          {programs.map((program) => (
            <div
              key={program.nameEn}
              data-testid="discipline-card"
              data-icon={program.icon.key}
              className="group relative flex w-full flex-col items-center rounded-2xl bg-white p-8 text-center shadow-elevation-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-3 sm:w-72"
            >
              <div
                className={cn(
                  'mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg',
                  program.icon.gradient
                )}
                aria-hidden
              >
                <span className="leading-none">{program.icon.glyph}</span>
              </div>
              <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                {program.name}
              </h3>
              <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-300 group-hover:w-20" />
            </div>
          ))}
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