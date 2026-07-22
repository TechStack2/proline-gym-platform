import Link from 'next/link'
import { fmtDate } from '@/lib/fmt'
import { Ltr } from '@/components/ui/bdi'
import { getTranslations } from 'next-intl/server';
import { beltRankLabel, beltSwatchClass } from '@/lib/belts/label'
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { pctWidthClass } from '@/lib/utils/bar-width';
import { Award, TrendingUp, CalendarCheck, Target } from 'lucide-react';
import { computeEligibility } from '@/lib/eligibility';
import { DeskGrid } from '@/components/portal/portal-kit';

type Props = { params: { locale: string } };

type Named = { name_ar: string | null; name_en: string | null; name_fr: string | null } | null;

function pick(n: Named, locale: string): string {
  if (!n) return '';
  if (locale === 'ar') return n.name_ar || n.name_en || '';
  if (locale === 'fr') return n.name_fr || n.name_en || '';
  return n.name_en || '';
}
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export default async function PortalProgressPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('progress');
  const tb = await getTranslations('beltRanks');
  const rankLabel = (r: string | null) => beltRankLabel(r, tb, '—');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS-scoped to the member's own student row (students_self).
  const { data: student } = await supabase
    .from('students')
    .select('id, current_belt_rank, belt_promotion_date')
    .eq('profile_id', user.id)
    .single();
  if (!student) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-400 text-center py-16">{t('no_student')}</p>
      </div>
    );
  }

  // Promotion history (belt_promotions_student RLS).
  const { data: promotions } = await supabase
    .from('belt_promotions')
    .select('id, from_rank, to_rank, promotion_date, discipline_id, disciplines:discipline_id ( name_ar, name_en, name_fr )')
    .eq('student_id', student.id)
    .order('promotion_date', { ascending: false });

  // Total classes attended since the last promotion (the "streak" number).
  const sinceDate = student.belt_promotion_date ?? '1970-01-01';
  const { count: attendedSince } = await supabase
    .from('attendance_records')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student.id)
    .gte('attendance_date', sinceDate)
    .in('status', ['present', 'late']);

  // Current rank per discipline = the latest promotion in each discipline; compute
  // the eligibility number for each.
  const latestByDiscipline = new Map<string, NonNullable<typeof promotions>[number]>();
  for (const p of promotions ?? []) {
    if (!latestByDiscipline.has(p.discipline_id)) latestByDiscipline.set(p.discipline_id, p);
  }
  const disciplines = await Promise.all(
    [...latestByDiscipline.values()].map(async (p) => {
      const el = await computeEligibility(supabase, {
        studentId: student.id,
        disciplineId: p.discipline_id,
        currentRank: p.to_rank,
        beltPromotionDate: p.promotion_date,
      });
      return { promotion: p, eligibility: el };
    }),
  );

  return (
    /* W3a R3: the undefined `rtl` class swept (DA-61). */
    <div className="p-4 space-y-5" data-testid="portal-progress">
      <div className="pt-2">
        {/* DS 2.0 §2.1 (W2b R3): the ONE title primitive — testid `page-title`
            (was the shell-local `portal-page-title`). Desktop-only, as before;
            mobile still leads with the subtitle (chrome owns the title). */}
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <p className="text-sm text-gray-500 md:hidden">{t('subtitle')}</p>
      </div>

      {/* W2a §4.2 Rule 1: main = stats + eligibility (the progress flow);
          aside = the promotion-history timeline (the glanceable record). */}
      <DeskGrid gap="space-y-5" main={<>
      {/* Summary stats. W3a/DA-12: the pastel-pinned tint cards (murky and
          unreadable in dark) become token cards — the surface flips, the accent
          stays an icon hue. DA-43: the member's belt gets its OWN colour — the
          swatch bar — not just a purple word. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <Award className="h-5 w-5 mb-2 text-cat-5" aria-hidden />
          <p className="text-xs text-gray-500">{t('current_belt')}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5" data-testid="progress-rank">{rankLabel(student.current_belt_rank)}</p>
          {student.current_belt_rank && (
            <div
              data-testid="belt-swatch"
              data-rank={student.current_belt_rank}
              className={cn('mt-2 h-2.5 w-16 rounded-full', beltSwatchClass(student.current_belt_rank))}
              aria-hidden
            />
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <CalendarCheck className="h-5 w-5 mb-2 text-info-500" aria-hidden />
          <p className="text-xs text-gray-500">{t('classes_since_promotion')}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5" data-testid="progress-streak">{attendedSince ?? 0}</p>
        </div>
      </div>

      {/* Eligibility toward next belt (read-only number; never "you're eligible") */}
      {disciplines.length > 0 ? (
        <div className="space-y-3">
          {disciplines.map(({ promotion: p, eligibility: el }) => (
            <div
              key={p.discipline_id}
              data-testid="progress-eligibility"
              className="rounded-2xl bg-white p-4 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{pick(one(p.disciplines) as Named, locale)}</span>
                {/* DA-43: the rank wears its own belt colour. */}
                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  <span className={cn('h-2 w-2 rounded-full', beltSwatchClass(p.to_rank))} aria-hidden />
                  {rankLabel(p.to_rank)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Target className="h-4 w-4 text-primary-700" />
                {el.hasNext ? (
                  <span>
                    {t('toward_next', {
                      attended: el.attended,
                      required: el.requiredClasses ?? el.attended,
                      next: rankLabel(el.nextRank),
                    })}
                  </span>
                ) : (
                  <span>{t('top_rank')}</span>
                )}
              </div>
              {el.hasNext && (
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  {/* CSP-SWEEP: width via a build-time class (pctWidthClass), not an
                      inline style the prod CSP would strip → collapse the bar. */}
                  <div
                    data-testid="progress-bar"
                    className={cn('h-full bg-primary-700', pctWidthClass(el.requiredClasses ? Math.round((el.attended / el.requiredClasses) * 100) : 100))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : student.current_belt_rank ? (
        /* W3a/DA-11a: summaries must agree with their page (§2.4). A member whose
           students row carries a rank but who has no promotion HISTORY used to see
           "Current belt: Orange" above "No rank recorded yet" — the page calling
           itself a liar. With a recorded rank, the empty branch states the honest
           fact instead: the rank stands, the history is what's empty. */
        <div data-testid="portal-progress-rank-only" className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className={cn('mx-auto mb-3 h-2.5 w-16 rounded-full', beltSwatchClass(student.current_belt_rank))} aria-hidden />
          <p className="text-sm font-medium text-gray-700">{rankLabel(student.current_belt_rank)}</p>
          <p className="mt-1 text-xs text-gray-400">{t('no_history')}</p>
        </div>
      ) : (
        <div data-testid="portal-progress-empty" className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <Target className="mx-auto h-10 w-10 text-primary-300 mb-2" aria-hidden />
          <p className="text-sm font-medium text-gray-700">{t('no_rank_yet')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('empty_hint')}</p>
          <Link href={`/${locale}/portal/classes`} data-testid="portal-progress-empty-cta"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-800">
            {t('empty_cta')}
          </Link>
        </div>
      )}
      </>} aside={
      /* Promotion history timeline */
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-600" />
          {t('promotion_history')}
        </h3>
        {promotions && promotions.length > 0 ? (
          <div className="space-y-2" data-testid="progress-history">
            {promotions.map((p) => (
              <div
                key={p.id}
                data-testid="progress-history-item"
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  {/* DA-55: the from→to arrow follows reading direction. */}
                  <p className="text-sm font-medium text-gray-700">
                    {rankLabel(p.from_rank)} {isRTL ? '←' : '→'} {rankLabel(p.to_rank)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {pick(one(p.disciplines) as Named, locale)} · <Ltr>{fmtDate(p.promotion_date, locale)}</Ltr>
                  </p>
                </div>
                <Award className="h-4 w-4 text-yellow-500" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">{t('no_history')}</p>
        )}
      </div>
      } />
    </div>
  );
}
