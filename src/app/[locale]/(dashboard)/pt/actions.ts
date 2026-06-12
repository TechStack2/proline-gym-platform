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

type ActionResult = { ok: true; invoiceId: string | null } | { ok: false; error: string };

export async function approvePtRequest(
  assignmentId: string,
  opts?: { coachId?: string | null },
): Promise<ActionResult> {
  const supabase = await createClient();

  // PT-1: approval ROUTES THROUGH sell_pt_package — the single sale writer
  // (guards, type snapshot, validity window from approval date, invoice with
  // payer auto-resolve, member+coach notifications all in the RPC). This
  // action only resolves the request row and the coach.
  const { data: assignment, error: aErr } = await supabase
    .from('pt_assignments')
    .select('id, student_id, coach_id, package_id, status')
    .eq('id', assignmentId)
    .single();
  if (aErr || !assignment) return { ok: false, error: 'assignment_not_found' };

  // Coach may be NULL on a 22R approval (no preferred coach on the request) —
  // the RPC permits it on the request path; binding happens at scheduling.
  const finalCoachId = opts?.coachId ?? assignment.coach_id ?? null;

  const { data: sold, error } = await supabase.rpc('sell_pt_package', {
    p_student_id: assignment.student_id,
    p_package_id: assignment.package_id,
    p_coach_id: finalCoachId,
    p_discount_pct: 0,
    p_discount_amount_usd: 0,
    p_request_id: assignmentId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, invoiceId: (sold as { invoice_id: string | null } | null)?.invoice_id ?? null };
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
