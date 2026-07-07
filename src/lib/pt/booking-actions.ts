'use server'

/**
 * PT booking server actions (PT-2) — shared by the member portal, the
 * Member-360 staff picker and the diary picker. Thin wrappers: the slot
 * engine (lib/pt/slots) for reads, the SECURITY DEFINER RPCs for writes —
 * authorization lives in RLS + the RPC guards, not here.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBookableSlots, type SlotDay } from './slots'
import { actionError } from '@/lib/errors/action-error';
export type { SlotDay } from './slots'

type Result = { ok: true } | { ok: false; error: string }

export async function getPtSlots(
  assignmentId: string,
  locale = 'en',
): Promise<{ slots: SlotDay[]; coachName?: string; coachId?: string; noAvailability?: boolean }> {
  const supabase = await createClient()
  // J3 PT-GUARDS: coachId + noAvailability let the STAFF booking modal show WHY an
  // empty slot list happened + deep-link to the coach's availability panel.
  const { slots, coachName, coachId, noAvailability } = await getBookableSlots(supabase, assignmentId, locale)
  return { slots, coachName, coachId, noAvailability }
}

export async function bookPtSlot(input: {
  assignmentId: string
  scheduledAt: string
  override?: boolean
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('book_pt_session', {
    p_assignment_id: input.assignmentId,
    p_scheduled_at: input.scheduledAt,
    p_duration: null,
    p_override: input.override ?? false,
    p_propose: false,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/pt')
  revalidatePath('/schedule')
  return { ok: true }
}

export async function proposePtTime(input: { assignmentId: string; scheduledAt: string }): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('book_pt_session', {
    p_assignment_id: input.assignmentId,
    p_scheduled_at: input.scheduledAt,
    p_duration: null,
    p_override: false,
    p_propose: true,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/pt')
  revalidatePath('/inbox')
  return { ok: true }
}

export async function respondPtProposal(input: {
  sessionId: string
  action: 'accept' | 'counter' | 'decline'
  counterAt?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('respond_pt_proposal', {
    p_session_id: input.sessionId,
    p_action: input.action,
    p_counter_at: input.counterAt ?? null,
  })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/pt')
  revalidatePath('/inbox')
  return { ok: true }
}

export async function cancelPtBooking(sessionId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_pt_booking', { p_session_id: sessionId })
  if (error) return { ok: false, error: actionError(error) }
  revalidatePath('/portal/pt')
  return { ok: true }
}
