import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';
import { getLandingGym, DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';

type ScheduleSectionProps = {
  locale: string;
  gymSlug?: string;
};

// Full weekly order (Mon→Sun). day_of_week: 0=Sun … 6=Sat.
// The rendered columns are derived from the days this gym actually schedules
// (computed `DAYS` below) — never a hardcoded subset, or classes on the other
// days get silently dropped from the public schedule.
const WEEK = [
  { dow: 1, key: 'mon' },
  { dow: 2, key: 'tue' },
  { dow: 3, key: 'wed' },
  { dow: 4, key: 'thu' },
  { dow: 5, key: 'fri' },
  { dow: 6, key: 'sat' },
  { dow: 0, key: 'sun' },
] as const;

type Cell = { name: string; color: string | null };
type Row = { start: string; end: string; cells: Record<number, Cell[]> };

function hhmm(t: string | null): string {
  return (t || '').slice(0, 5);
}

function localizedName(c: any, locale: string): string {
  if (locale === 'ar') return c.name_ar || c.name_en;
  if (locale === 'fr') return c.name_fr || c.name_en;
  return c.name_en;
}

export async function ScheduleSection({ locale, gymSlug }: ScheduleSectionProps) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('landing.schedule');
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);

  const rows: Row[] = [];
  const activeDow = new Set<number>();

  if (gym) {
    const supabase = await createClient();
    // CATALOG-SCOPE: per-gym definer RPC (000080) — no blanket anon table read.
    // Active classes JOIN their active recurring slots, flattened (one row per slot).
    const { data: slots } = await supabase.rpc('get_landing_schedule', { p_gym_id: gym.id });

    const slotMap = new Map<string, Row>();
    for (const s of (slots as any[]) || []) {
      if (s.day_of_week == null) continue;
      activeDow.add(s.day_of_week);
      const key = `${s.start_time}-${s.end_time}`;
      let row = slotMap.get(key);
      if (!row) {
        row = { start: s.start_time, end: s.end_time, cells: {} };
        slotMap.set(key, row);
      }
      (row.cells[s.day_of_week] ??= []).push({ name: localizedName(s, locale), color: s.color ?? null });
    }
    rows.push(...[...slotMap.values()].sort((a, b) => a.start.localeCompare(b.start)));
  }

  // Columns = the days this gym actually schedules, in week order (Mon→Sun).
  const DAYS = WEEK.filter((d) => activeDow.has(d.dow));

  return (
    <section id="schedule" className="bg-secondary-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/15 ring-1 ring-primary-500/30">
            <CalendarDays className="h-6 w-6 text-primary-400" />
          </div>
          <h2 className={cn('text-3xl sm:text-4xl font-bold text-white', isRTL && 'font-arabic')}>
            {t('title')}
          </h2>
          <p className="mt-3 text-gray-400 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        {rows.length === 0 ? (
          <p className="text-center text-gray-500">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
            <table className="w-full min-w-[640px] border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="w-32 rounded-lg bg-secondary-900 px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t('time')}
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d.dow}
                      className={cn(
                        'rounded-lg bg-primary-600 px-4 py-3 text-center text-sm font-bold text-primary-foreground',
                        isRTL && 'font-arabic'
                      )}
                    >
                      {t(`days.${d.key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.start}-${row.end}`}>
                    <td className="rounded-lg bg-secondary-900 px-4 py-3 align-top text-sm font-medium text-gray-300 whitespace-nowrap" dir="ltr">
                      {hhmm(row.start)}–{hhmm(row.end)}
                    </td>
                    {DAYS.map((d) => {
                      const cells = row.cells[d.dow] ?? [];
                      return (
                        <td key={d.dow} className="align-top">
                          {cells.length === 0 ? (
                            <div className="h-full min-h-[3rem] rounded-lg bg-secondary-900/40" />
                          ) : (
                            <div className="space-y-2">
                              {cells.map((cell, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-white ring-1 ring-white/10"
                                  style={{
                                    backgroundColor: cell.color || 'var(--brand)',
                                  }}
                                >
                                  {cell.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
