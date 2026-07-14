'use server';

/**
 * Class enrollment server action (Cycle 5 / 24-R, T1 → BILL-GUARDS R4).
 *
 * ENROLL-UNIFY: putting a student in a class now goes through the ONE billing door —
 * the B2 request→approve registration chain — instead of a direct class_enrollments
 * upsert that bypassed billing. approve → _activate_class_registration issues the
 * upfront invoice when the class has a fee (0 = free → no invoice) AND still projects
 * the class_enrollments roster row every attendance/roster surface reads, so that
 * consumer is unchanged. Idempotent + retry-safe: if the member already has an
 * open/active registration for this class we treat it as done (the seed pre-enrolls
 * some members via class_enrollments with no registration row — the first enroll
 * creates one; the E1 dup-open guard would otherwise reject a retry).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { actionError } from '@/lib/errors/action-error';

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
  if (!profile?.gym_id) return { ok: false, error: 'no_gym' };

  // Idempotent: only open the door if there's no live registration already.
  const { data: existing } = await supabase
    .from('class_registrations')
    .select('id')
    .eq('class_id', input.classId)
    .eq('student_id', input.studentId)
    .in('status', ['requested', 'active', 'waitlisted', 'suspended'])
    .maybeSingle();

  if (!existing) {
    const { data: reg, error: reqErr } = await supabase.rpc('request_class_registration', {
      p_class_id: input.classId,
      p_student_id: input.studentId,
    });
    if (reqErr) return { ok: false, error: actionError(reqErr) };
    const { error: appErr } = await supabase.rpc('approve_class_registration', {
      p_reg_id: (reg as any).id,
      p_discount_pct: 0,
      p_discount_amount_usd: 0,
    });
    if (appErr) return { ok: false, error: actionError(appErr) };
  }

  revalidatePath('/[locale]/(dashboard)/classes/[id]', 'page');
  return { ok: true };
}
