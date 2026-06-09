'use server';

/**
 * Class enrollment server action (Cycle 5 / 24-R, T1).
 *
 * Idempotent enroll (upsert is_active=true on the UNIQUE(class_id, student_id))
 * + an enrollment_confirmed notification to the student and any linked guardians,
 * using the sanctioned F2 pattern (RETURNING-free, authed staff client). The
 * legacy EnrollStudentModal inserted a non-existent `status` column and searched
 * non-existent student name columns — this action is the corrected write path.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { studentNotificationRecipients } from '@/lib/notifications/recipients';

export async function enrollStudent(input: {
  classId: string;
  studentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const { error } = await supabase
    .from('class_enrollments')
    .upsert(
      { class_id: input.classId, student_id: input.studentId, is_active: true },
      { onConflict: 'class_id, student_id' },
    );
  if (error) return { ok: false, error: error.message };

  // enrollment_confirmed → student (+ guardians). Best-effort side-effect.
  try {
    const { data: cls } = await supabase
      .from('classes')
      .select('name_en')
      .eq('id', input.classId)
      .single();
    const className = cls?.name_en ?? '';
    const recipients = await studentNotificationRecipients(supabase, input.studentId);
    for (const recipientProfileId of recipients) {
      await createNotification(
        {
          recipientProfileId,
          gymId,
          type: 'enrollment_confirmed',
          titleKey: 'messages.enrollment_confirmed.title',
          bodyKey: 'messages.enrollment_confirmed.body',
          params: { className },
          entityType: 'class',
          entityId: input.classId,
          actionUrl: '/portal/schedule',
        },
        supabase,
      );
    }
  } catch (e) {
    console.error('[enrollStudent] enrollment_confirmed notify failed (non-fatal):', e);
  }

  revalidatePath('/[locale]/(dashboard)/classes/[id]', 'page');
  return { ok: true };
}
