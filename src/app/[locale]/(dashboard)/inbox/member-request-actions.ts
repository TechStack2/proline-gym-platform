'use server'

/**
 * Staff approve/decline for member self-serve requests (MJ-3).
 * Thin wrappers over the SECURITY DEFINER RPCs (000095): approve dispatches by
 * kind, REUSING the existing lifecycle RPCs verbatim (profile change → apply;
 * renewal → renew_now; freeze → freeze_membership). No business logic here.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error'

type Result = { ok: true } | { ok: false; error: string }

export async function approveMemberRequest(requestId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_member_request', { p_request_id: requestId })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/inbox')
  revalidatePath('/money')
  return { ok: true }
}

export async function declineMemberRequest(requestId: string, reason?: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_member_request', { p_request_id: requestId, p_reason: reason ?? null })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/inbox')
  return { ok: true }
}
