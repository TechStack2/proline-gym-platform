'use server';

/**
 * PT approval server actions (Cycle 5 / Prompt 22, gaps M-A2/M-A3/M-A4).
 *
 * Runs in a staff session, so the server Supabase client carries the staff
 * user's auth — RLS lets it update gym-scoped pt_assignments, insert invoices,
 * and (via the notification helper, which requires is_staff()) notify the
 * student and coach. The student-initiated request path is the `request_pt`
 * RPC, not here.
 */
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { shouldBillPtPackage } from '@/lib/pt/invoice';

type ActionResult = { ok: true; invoiceId: string | null } | { ok: false; error: string };

export async function approvePtRequest(
  assignmentId: string,
  opts?: { coachId?: string | null },
): Promise<ActionResult> {
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

  const { data: assignment, error: aErr } = await supabase
    .from('pt_assignments')
    .select('id, student_id, coach_id, package_id, sessions_total')
    .eq('id', assignmentId)
    .single();
  if (aErr || !assignment) return { ok: false, error: 'assignment_not_found' };

  const { data: pkg } = await supabase
    .from('pt_packages')
    .select('id, gym_id, name_en, name_ar, name_fr, price_usd, price_lbp')
    .eq('id', assignment.package_id)
    .single();
  if (!pkg || pkg.gym_id !== gymId) return { ok: false, error: 'forbidden' };

  const finalCoachId = opts?.coachId ?? assignment.coach_id ?? null;

  // 1) Auto-issue a dual-currency invoice through the canonical issuance
  //    service (D1 retrofit; skip if free). issue_invoice runs the TVA/number
  //    triggers and fires invoice_issued to the student (best-effort).
  let invoiceId: string | null = null;
  if (shouldBillPtPackage(pkg.price_usd)) {
    const { data: rate } = await supabase
      .from('exchange_rates')
      .select('rate, rate_date')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const amountLbp =
      pkg.price_lbp != null
        ? pkg.price_lbp
        : rate?.rate ? Math.round(pkg.price_usd * rate.rate) : 0;

    const { data: invoice, error: invErr } = await supabase.rpc('issue_invoice', {
      p_gym_id: gymId,
      p_student_id: assignment.student_id,
      p_invoice_type: 'pt_package',
      p_amount_usd: pkg.price_usd,
      p_amount_lbp: amountLbp,
      p_exchange_rate: rate?.rate ?? null,
      p_rate_date: rate?.rate_date ?? null,
      p_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_notes_en: pkg.name_en ? `PT package: ${pkg.name_en}` : null,
      p_notes_ar: pkg.name_ar ? `باقة تدريب خاص: ${pkg.name_ar}` : null,
      p_notes_fr: pkg.name_fr ? `Forfait coaching privé : ${pkg.name_fr}` : null,
    });
    if (invErr) return { ok: false, error: `invoice: ${invErr.message}` };
    invoiceId = (invoice as { id: string } | null)?.id ?? null;
  }

  // 2) Flip the assignment to active and stamp approval + link the invoice.
  const { error: updErr } = await supabase
    .from('pt_assignments')
    .update({
      status: 'active',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      coach_id: finalCoachId,
      invoice_id: invoiceId,
    })
    .eq('id', assignmentId);
  if (updErr) return { ok: false, error: updErr.message };

  // 3) Notify the student (approved) and the coach (assigned) via the shared
  //    producer helper, using THIS staff session's authenticated client. The
  //    notifications INSERT policy (000015) is the guardrail; the helper does a
  //    RETURNING-free insert so the recipient-only SELECT policy is not tripped.
  const { data: student } = await supabase
    .from('students')
    .select('profile_id')
    .eq('id', assignment.student_id)
    .single();

  if (student?.profile_id) {
    await createNotification({
      recipientProfileId: student.profile_id,
      gymId,
      type: 'pt_approved',
      titleKey: 'messages.pt_approved.title',
      bodyKey: 'messages.pt_approved.body',
      entityType: 'pt_assignment',
      entityId: assignmentId,
      actionUrl: '/portal/pt',
    }, supabase);
  }

  if (finalCoachId) {
    const { data: coach } = await supabase
      .from('coaches')
      .select('profile_id')
      .eq('id', finalCoachId)
      .single();
    if (coach?.profile_id) {
      await createNotification({
        recipientProfileId: coach.profile_id,
        gymId,
        type: 'pt_assigned',
        titleKey: 'messages.pt_assigned.title',
        bodyKey: 'messages.pt_assigned.body',
        params: { count: assignment.sessions_total },
        entityType: 'pt_assignment',
        entityId: assignmentId,
        actionUrl: '/coach/pt',
      }, supabase);
    }
  }

  return { ok: true, invoiceId };
}

export async function rejectPtRequest(
  assignmentId: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await supabase
    .from('pt_assignments')
    .update({
      status: 'rejected',
      rejected_reason: reason || null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, invoiceId: null };
}

// ── C1 / T5 — restore a PT credit (staff-only, guarded ≥0, audited) ──────────
export async function restorePtCredit(input: {
  assignmentId: string;
  sessionId?: string | null;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { error } = await supabase.rpc('restore_pt_credit', {
    p_assignment_id: input.assignmentId,
    p_session_id: input.sessionId ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) {
    console.error('[restorePtCredit] RPC failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
