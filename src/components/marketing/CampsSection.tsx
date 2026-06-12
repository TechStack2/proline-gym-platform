import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Tent, Clock, Users } from 'lucide-react';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type CampsSectionProps = {
  locale: string;
  gymSlug?: string;
};

function localized(row: any, base: string, locale: string): string {
  return (locale === 'ar' ? row[`${base}_ar`] : locale === 'fr' ? row[`${base}_fr`] : row[`${base}_en`]) || row[`${base}_en`];
}

/**
 * Landing camps section (E1, journey-camps §2C) — PUBLISHED camps of the
 * active gym (anon read = the 000043 staged-publish policy) with the
 * spots-left tease (definer counter) and a Full badge off camps.status.
 * Renders nothing when no camp is published. NEW component — the LPX-1
 * collision fence allows exactly this file + the page.tsx wire.
 */
export async function CampsSection({ locale, gymSlug }: CampsSectionProps) {
  const isRTL = locale === 'ar';
  const supabase = await createClient();
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  const today = new Date().toISOString().slice(0, 10);
  const { data: camps } = gym
    ? await supabase
        .from('camps')
        .select('id, name_ar, name_en, name_fr, start_date, end_date, min_age, max_age, price_usd, status')
        .eq('gym_id', gym.id)
        .eq('show_on_landing', true)
        .gte('end_date', today)
        .order('start_date')
    : { data: null };

  if (!camps || camps.length === 0) return null;

  const spots = new Map<string, number>();
  for (const c of camps as any[]) {
    const { data } = await supabase.rpc('get_camp_spots_left', { p_camp_id: c.id });
    spots.set(c.id, (data as number | null) ?? 0);
  }

  const fmtD = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-LB' : 'en-US', { day: 'numeric', month: 'short' });

  return (
    <section id="camps" className="py-20 lg:py-28 bg-gray-50" data-testid="landing-camps">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
            {isRTL ? 'مخيمات الصيف' : locale === 'fr' ? 'Camps d\u2019été' : 'Summer Camps'}
          </h2>
          <p className="mt-3 text-gray-500 max-w-xl mx-auto">
            {isRTL ? 'أيام كاملة من التدريب واللعب — أماكن محدودة' : locale === 'fr' ? 'Des journées d\u2019entraînement et de jeu — places limitées' : 'Full days of training and play — limited spots'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(camps as any[]).map((c) => {
            const full = c.status === 'full' || (spots.get(c.id) ?? 0) <= 0;
            return (
              <div key={c.id} data-testid="landing-camp-card" data-name-en={c.name_en} data-full={full}
                className="relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-2">
                {full && (
                  <span data-testid="landing-camp-full"
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-900">
                    {isRTL ? 'مكتمل' : locale === 'fr' ? 'Complet' : 'Full'}
                  </span>
                )}
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#cd1419]/10">
                  <Tent className="h-5 w-5 text-[#cd1419]" />
                </div>
                <h3 className={cn('text-lg font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                  {localized(c, 'name', locale)}
                </h3>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500" dir="ltr">
                  <Clock className="h-3.5 w-3.5" /> {fmtD(c.start_date)} – {fmtD(c.end_date)}
                </p>
                {c.min_age != null && (
                  <p className="mt-1 text-sm text-gray-500">
                    {isRTL ? `الأعمار ${c.min_age}–${c.max_age}` : locale === 'fr' ? `Âges ${c.min_age}–${c.max_age}` : `Ages ${c.min_age}–${c.max_age}`}
                  </p>
                )}
                <p className="mt-3">
                  <span className="text-3xl font-bold text-secondary-900">${Number(c.price_usd).toFixed(0)}</span>
                </p>
                {!full && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <Users className="h-3 w-3" />
                    {isRTL ? `${spots.get(c.id)} أماكن متبقية` : locale === 'fr' ? `${spots.get(c.id)} places restantes` : `${spots.get(c.id)} spots left`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <a href="#trial" data-testid="landing-camps-cta"
            className="inline-flex items-center gap-2 rounded-xl bg-[#cd1419] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#a81014]">
            <Tent className="h-4 w-4" />
            {isRTL ? 'سجّل اهتمامك بالمخيم' : locale === 'fr' ? 'Inscrivez votre intérêt' : 'Register your interest'}
          </a>
        </div>
      </div>
    </section>
  );
}
