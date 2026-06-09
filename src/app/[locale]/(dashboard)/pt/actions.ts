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
import { buildPtInvoiceInsert, shouldBillPtPackage } from '@/lib/pt/invoice';

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

  // 1) Auto-create a dual-currency invoice (skip if free).
  let invoiceId: string | null = null;
  if (shouldBillPtPackage(pkg.price_usd)) {
    const { data: rate } = await supabase
      .from('exchange_rates')
      .select('rate, rate_date')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const invoicePayload = buildPtInvoiceInsert({
      gymId,
      studentId: assignment.student_id,
      priceUsd: pkg.price_usd,
      priceLbp: pkg.price_lbp,
      exchangeRate: rate?.rate ?? null,
      rateDate: rate?.rate_date ?? null,
      packageNameEn: pkg.name_en,
      packageNameAr: pkg.name_ar,
      packageNameFr: pkg.name_fr,
    });

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert(invoicePayload)
      .select('id')
      .single();
    if (invErr) return { ok: false, error: `invoice: ${invErr.message}` };
    invoiceId = invoice.id;
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

  // 3) Notify the student (approved) and the coach (assigned).
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
