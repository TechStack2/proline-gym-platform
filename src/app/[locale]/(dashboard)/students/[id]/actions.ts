'use server'

/**
 * Member-360 staff-direct registration (FD-1). NO new business logic: composes
 * the two verified B2 RPCs — request_class_registration (guards: gym match,
 * belt/age, duplicate-open-registration) then approve_class_registration
 * (capacity → active+invoice OR waitlist; optional discount). The result lands
 * on the member file (registrations + billing panels).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true; status: string } | { ok: false; error: string }

export async function registerMemberToClass(input: {
  studentId: string
  classId: string
  discountPct?: number
}): Promise<Result> {
  const supabase = await createClient()
  const { data: reg, error: reqErr } = await supabase.rpc('request_class_registration', {
    p_class_id: input.classId,
    p_student_id: input.studentId,
  })
  if (reqErr) return { ok: false, error: reqErr.message }

  const { error: appErr } = await supabase.rpc('approve_class_registration', {
    p_reg_id: (reg as any).id,
    p_discount_pct: input.discountPct ?? 0,
    p_discount_amount_usd: 0,
  })
  if (appErr) return { ok: false, error: appErr.message }

  const { data: after } = await supabase
    .from('class_registrations').select('status').eq('id', (reg as any).id).single()
  revalidatePath(`/students/${input.studentId}`)
  return { ok: true, status: after?.status ?? 'active' }
}

/**
 * PT-1 desk sale — thin wrapper over the atomic sell_pt_package RPC (guards,
 * snapshot, invoice with optional discount, B3 payer, notifications all live
 * in SQL). Also the 22R approval path when requestId is provided.
 */
export async function sellPtPackage(input: {
  studentId: string
  packageId: string
  coachId: string
  discountPct?: number
  discountAmountUsd?: number
  requestId?: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('sell_pt_package', {
    p_student_id: input.studentId,
    p_package_id: input.packageId,
    p_coach_id: input.coachId,
    p_discount_pct: input.discountPct ?? 0,
    p_discount_amount_usd: input.discountAmountUsd ?? 0,
    p_request_id: input.requestId ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/students/${input.studentId}`)
  revalidatePath('/inbox')
  return { ok: true, status: 'active' }
}

/** PT-1 expiry goodwill — staff extend (audited in the RPC), un-freezes. */
export async function extendPtPackage(input: {
  studentId: string
  assignmentId: string
  days?: number
}): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('extend_pt_package', {
    p_assignment_id: input.assignmentId,
    p_days: input.days ?? 30,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/students/${input.studentId}`)
  return { ok: true, status: 'active' }
}
