import { dateLocale } from '@/lib/utils/locale-format'
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { pctWidthClass } from '@/lib/utils/bar-width';
import { Award, TrendingUp, CalendarCheck, Target } from 'lucide-react';
import { computeEligibility } from '@/lib/eligibility';

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
const rankLabel = (r: string | null) =>
  r ? r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

export default async function PortalProgressPage({ params: { locale } }: Props) {
  const isRTL = locale === 'ar';
  const t = await getTranslations('progress');
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
      <div className={cn('p-4', isRTL && 'rtl')}>
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
    <div className={cn('p-4 space-y-5', isRTL && 'rtl')} data-testid="portal-progress">
      <div className="pt-2">
        <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-purple-50 text-purple-700 p-4 shadow-sm">
          <Award className="h-5 w-5 mb-2 opacity-70" />
          <p className="text-xs opacity-70">{t('current_belt')}</p>
          <p className="text-lg font-bold mt-0.5" data-testid="progress-rank">{rankLabel(student.current_belt_rank)}</p>
        </div>
        <div className="rounded-2xl bg-blue-50 text-blue-700 p-4 shadow-sm">
          <CalendarCheck className="h-5 w-5 mb-2 opacity-70" />
          <p className="text-xs opacity-70">{t('classes_since_promotion')}</p>
          <p className="text-lg font-bold mt-0.5" data-testid="progress-streak">{attendedSince ?? 0}</p>
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{rankLabel(p.to_rank)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Target className="h-4 w-4 text-[#cd1419]" />
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
                    className={cn('h-full bg-[#cd1419]', pctWidthClass(el.requiredClasses ? Math.round((el.attended / el.requiredClasses) * 100) : 100))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-400 text-center py-2">{t('no_rank_yet')}</p>
        </div>
      )}

      {/* Promotion history timeline */}
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
                  <p className="text-sm font-medium text-gray-700">
                    {rankLabel(p.from_rank)} → {rankLabel(p.to_rank)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {pick(one(p.disciplines) as Named, locale)} · {new Date(p.promotion_date).toLocaleDateString(dateLocale(locale))}
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
    </div>
  );
}
