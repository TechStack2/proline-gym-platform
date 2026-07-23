import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';

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

  // CATALOG-SCOPE: per-gym definer RPC (000080) — no blanket anon table read.
  // Active disciplines of the active gym, sorted; SSOT, no fallback list.
  const { data: disciplines } = gym
    ? await supabase.rpc('get_landing_disciplines', { p_gym_id: gym.id })
    : { data: null };

  type DiscRow = { name_ar: string; name_en: string; name_fr: string; icon_url?: string | null };
  const rows = (disciplines || []) as DiscRow[];
  // LANDING DA-13 (§115 decree): public surfaces collapse, never placeholder — a gym
  // with no active disciplines renders NO section, so marketing copy can never
  // interpolate "0 disciplines" and the page never shows a hollow block.
  if (rows.length === 0) return null;
  const programs = rows.map((d) => ({
    name: (locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en,
    nameEn: d.name_en,
    icon: disciplineIcon(d.name_en),
    // DISC-ICON: an uploaded icon (relative gym-landing path) overrides the emoji tile.
    iconUrl: storagePublicUrl('gym-landing', d.icon_url),
  }));

  return (
    <section id="disciplines" className="py-20 lg:py-28 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2
            className={cn(
              // DISPLAY-FONT: .font-display owns the AR font too (via [dir="rtl"]); no
              // font-arabic here — twMerge would drop the earlier font-family class.
              'font-display text-3xl sm:text-4xl font-bold text-secondary-900'
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
              {program.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={program.iconUrl}
                  alt=""
                  aria-hidden
                  className="mb-5 h-16 w-16 rounded-2xl object-cover shadow-lg"
                />
              ) : (
                <div
                  className={cn(
                    'mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg',
                    program.icon.gradient
                  )}
                  aria-hidden
                >
                  <span className="leading-none">{program.icon.glyph}</span>
                </div>
              )}
              <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                {program.name}
              </h3>
              <div className="mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-300 group-hover:w-20" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}