'use server'

/**
 * Member/guardian membership-lifecycle REQUESTS (MJ-3, Req2 + Req3).
 * The D2 ruling: renewal + freeze are REQUESTS — the member/guardian asks, the
 * staff inbox surfaces it, staff approve at the desk (payment stays at the desk;
 * there is NO cancel button and NO online payment). Thin wrappers over the
 * SECURITY DEFINER RPCs (000095); on approve the inbox reuses renew_now /
 * freeze_membership verbatim.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error'

type Result = { ok: true } | { ok: false; error: string }

export async function requestRenewal(studentId: string, note?: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_membership_renewal', {
    p_student_id: studentId,
    p_note: note ?? null,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal')
  return { ok: true }
}

export async function requestFreeze(input: { studentId: string; days?: number; reason?: string }): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_membership_freeze', {
    p_student_id: input.studentId,
    p_days: input.days ?? null,
    p_reason: input.reason ?? null,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal')
  return { ok: true }
}
