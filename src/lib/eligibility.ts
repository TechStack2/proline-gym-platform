/**
 * Promotion-eligibility hint (Cycle 5 / 24-R, T3) — READ-ONLY, never auto-promotes.
 *
 * Computes, for a student's current rank in a discipline: classes attended since
 * the last promotion (present/late) and months in rank, vs the NEXT belt's
 * thresholds (belt_hierarchies.min_classes_attended / min_months_in_rank, by
 * sort_order). Isomorphic — runs from a server page (staff/coach + the member's
 * own /portal/progress) or a client component with whatever client it's given;
 * RLS scopes the reads (staff-all, coach-own-classes, member-own).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

export type Eligibility = {
  attended: number;
  monthsInRank: number;
  requiredClasses: number | null;
  requiredMonths: number | null;
  classesMet: boolean;
  monthsMet: boolean;
  eligible: boolean;
  /** Whether a next belt exists in the discipline (false ⇒ at the top rank). */
  hasNext: boolean;
  nextRank: string | null;
  nextName: { ar: string; en: string; fr: string } | null;
};

function monthsBetween(from: string | null, to: Date): number {
  if (!from) return 0;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  const days = (to.getTime() - start.getTime()) / 86_400_000;
  return Math.max(0, Math.floor(days / 30.4375));
}

export async function computeEligibility(
  supabase: Client,
  args: {
    studentId: string;
    disciplineId: string;
    currentRank: string | null;
    beltPromotionDate: string | null;
  },
): Promise<Eligibility> {
  const { studentId, disciplineId, currentRank, beltPromotionDate } = args;

  // Classes attended since the last promotion (present or late count).
  const sinceDate = beltPromotionDate ?? '1970-01-01';
  const { count: attendedCount } = await supabase
    .from('attendance_records')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('attendance_date', sinceDate)
    .in('status', ['present', 'late']);
  const attended = attendedCount ?? 0;

  const monthsInRank = monthsBetween(beltPromotionDate, new Date());

  // Current sort_order (so we can find the immediate next belt).
  let currentSort = -1;
  if (currentRank) {
    const { data: cur } = await supabase
      .from('belt_hierarchies')
      .select('sort_order')
      .eq('discipline_id', disciplineId)
      .eq('rank', currentRank as Database['public']['Enums']['belt_rank_enum'])
      .maybeSingle();
    if (cur?.sort_order != null) currentSort = cur.sort_order;
  }

  const { data: next } = await supabase
    .from('belt_hierarchies')
    .select('rank, name_ar, name_en, name_fr, sort_order, min_classes_attended, min_months_in_rank')
    .eq('discipline_id', disciplineId)
    .gt('sort_order', currentSort)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  const requiredClasses = next?.min_classes_attended ?? null;
  const requiredMonths = next?.min_months_in_rank ?? null;
  const classesMet = requiredClasses == null || attended >= requiredClasses;
  const monthsMet = requiredMonths == null || monthsInRank >= requiredMonths;

  return {
    attended,
    monthsInRank,
    requiredClasses,
    requiredMonths,
    classesMet,
    monthsMet,
    eligible: !!next && classesMet && monthsMet,
    hasNext: !!next,
    nextRank: next?.rank ?? null,
    nextName: next ? { ar: next.name_ar, en: next.name_en, fr: next.name_fr } : null,
  };
}
