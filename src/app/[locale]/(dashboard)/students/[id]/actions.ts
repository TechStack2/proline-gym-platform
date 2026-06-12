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
