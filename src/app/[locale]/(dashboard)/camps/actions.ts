'use server'

/**
 * Camp staff actions (E1) — thin wrappers over the single confirm/sale writer
 * register_camp (capacity FOR UPDATE, price snapshot, B3 payer invoice,
 * full-flip, notifications all in SQL). Decline = cancel the pending row
 * (gym-scoped staff RLS; no invoice exists yet on a request).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

export async function registerToCamp(input: {
  studentId: string
  campId: string
  requestId?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('register_camp', {
    p_student_id: input.studentId,
    p_camp_id: input.campId,
    p_request_id: input.requestId ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/camps/${input.campId}`)
  revalidatePath(`/students/${input.studentId}`)
  revalidatePath('/inbox')
  return { ok: true }
}

export async function declineCampRequest(regId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('camp_registrations')
    .update({ status: 'cancelled' })
    .eq('id', regId)
    .eq('status', 'pending')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/inbox')
  return { ok: true }
}
