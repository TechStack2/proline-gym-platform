'use server'

/**
 * Member class-registration actions (Cycle 5 / V1 / B2).
 * Thin wrappers over the SECURITY DEFINER RPCs (000034): the member requests a
 * recurring class (request → `requested` + class_requested→staff) and can free-
 * cancel their own registration (atomic auto-promote of the next waitlisted).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

export async function requestClassRegistration(classId: string, studentId?: string): Promise<Result> {
  const supabase = await createClient()
  // B3: a linked guardian may request FOR a kid (the RPC authorizes via
  // is_guardian_of); members request for themselves (no studentId).
  const { error } = await supabase.rpc('request_class_registration', {
    p_class_id: classId,
    ...(studentId ? { p_student_id: studentId } : {}),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/classes')
  return { ok: true }
}

export async function cancelMyRegistration(regId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_class_registration', { p_reg_id: regId })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/portal/classes')
  return { ok: true }
}
