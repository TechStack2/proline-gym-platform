'use server'

/**
 * Staff class-registration actions (Cycle 5 / V1 / B2). Thin wrappers over the
 * atomic SECURITY DEFINER RPCs (000034): approve(+discount) → active+invoice OR
 * waitlisted; reject; cancel (→ auto-promote); register a walk-in member.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

function revalidate(classId: string) {
  revalidatePath(`/classes/${classId}`)
  revalidatePath('/classes')
}

export async function approveRegistration(
  input: { regId: string; classId: string; discountPct?: number; discountAmountUsd?: number },
): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_class_registration', {
    p_reg_id: input.regId,
    p_discount_pct: input.discountPct ?? 0,
    p_discount_amount_usd: input.discountAmountUsd ?? 0,
  })
  if (error) return { ok: false, error: error.message }
  revalidate(input.classId)
  return { ok: true }
}

export async function rejectRegistration(regId: string, classId: string, reason?: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_class_registration', { p_reg_id: regId, p_reason: reason ?? null })
  if (error) return { ok: false, error: error.message }
  revalidate(classId)
  return { ok: true }
}

export async function cancelRegistration(regId: string, classId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_class_registration', { p_reg_id: regId })
  if (error) return { ok: false, error: error.message }
  revalidate(classId)
  return { ok: true }
}

export async function registerWalkIn(classId: string, studentId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_class_registration', { p_class_id: classId, p_student_id: studentId })
  if (error) return { ok: false, error: error.message }
  revalidate(classId)
  return { ok: true }
}
