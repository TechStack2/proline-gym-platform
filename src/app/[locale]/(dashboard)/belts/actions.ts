'use server';

/**
 * Atomic belt promotion + belt_promoted handoff (Cycle 5 / 24-R, T4).
 *
 * Replaces the belt engine's two-write + manual-JS-rollback path with one call
 * to the atomic promote_student RPC (000025): insert belt_promotions + update
 * students.current_belt_rank in ONE transaction. Then emit belt_promoted to the
 * student (+ guardians) via the sanctioned F2 pattern (best-effort).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { studentNotificationRecipients } from '@/lib/notifications/recipients';

export async function promoteStudent(input: {
  studentId: string;
  disciplineId: string;
  toHierarchyId: string;
  coachId: string;
  promotionDate?: string;
  notes?: string;
}): Promise<{ ok: true; toRank: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();
  const gymId = profile?.gym_id;
  if (!gymId) return { ok: false, error: 'no_gym' };

  const { data: promo, error } = await supabase
    .rpc('promote_student', {
      p_student_id: input.studentId,
      p_discipline_id: input.disciplineId,
      p_to_hierarchy_id: input.toHierarchyId,
      p_coach_id: input.coachId,
      p_promotion_date: input.promotionDate || null,
      p_notes: input.notes || null,
    })
    .single();
  if (error || !promo) {
    console.error('[promoteStudent] promote_student RPC failed:', error?.message);
    return { ok: false, error: error?.message ?? 'promote_failed' };
  }
  const toRank = (promo as { to_rank: string }).to_rank;

  // belt_promoted → student (+ guardians). Best-effort side-effect.
  try {
    const { data: belt } = await supabase
      .from('belt_hierarchies')
      .select('name_en')
      .eq('id', input.toHierarchyId)
      .single();
    const beltName = belt?.name_en ?? toRank;
    const recipients = await studentNotificationRecipients(supabase, input.studentId);
    for (const recipientProfileId of recipients) {
      await createNotification(
        {
          recipientProfileId,
          gymId,
          type: 'belt_promoted',
          titleKey: 'messages.belt_promoted.title',
          bodyKey: 'messages.belt_promoted.body',
          params: { beltName },
          entityType: 'student',
          entityId: input.studentId,
          actionUrl: '/portal/progress',
        },
        supabase,
      );
    }
  } catch (e) {
    console.error('[promoteStudent] belt_promoted notify failed (non-fatal):', e);
  }

  revalidatePath('/[locale]/(dashboard)/belts', 'page');
  return { ok: true, toRank };
}
