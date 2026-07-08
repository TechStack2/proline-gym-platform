'use server'

/**
 * Staff class-registration actions (Cycle 5 / V1 / B2). Thin wrappers over the
 * atomic SECURITY DEFINER RPCs (000034): approve(+discount) → active+invoice OR
 * waitlisted; reject; cancel (→ auto-promote); register a walk-in member.
 */
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { dispatchWhatsApp } from '@/lib/whatsapp/dispatch'
import { gymDisplayName } from '@/lib/whatsapp/identity'
import { actionError } from '@/lib/errors/action-error';

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
  if (error) return { ok: false, error: actionError(error) }
  revalidate(input.classId)

  // G1 (additive, best-effort): the in-app notification fired in the RPC; when
  // the gym's WhatsApp is active, also auto-dispatch a confirmation. A send
  // failure NEVER affects the approval (dispatchWhatsApp never throws).
  try {
    const { data: reg } = await supabase
      .from('class_registrations')
      .select('gym_id, gyms:gym_id(name_ar, name_en, name_fr), classes:class_id(name_ar, name_en, name_fr), students!inner(profiles:profile_id(first_name_ar, first_name_en, first_name_fr, phone, locale))')
      .eq('id', input.regId).maybeSingle()
    const st: any = reg && (Array.isArray((reg as any).students) ? (reg as any).students[0] : (reg as any).students)
    const prof: any = st?.profiles ? (Array.isArray(st.profiles) ? st.profiles[0] : st.profiles) : null
    if (reg?.gym_id && prof?.phone) {
      const loc = (prof.locale ?? 'ar') as 'ar' | 'en' | 'fr'
      const cls: any = (reg as any).classes ? (Array.isArray((reg as any).classes) ? (reg as any).classes[0] : (reg as any).classes) : null
      const gymRow: any = (reg as any).gyms ? (Array.isArray((reg as any).gyms) ? (reg as any).gyms[0] : (reg as any).gyms) : null
      const name = (loc === 'ar' ? prof.first_name_ar : loc === 'fr' ? prof.first_name_fr : prof.first_name_en) || prof.first_name_en || ''
      const className = cls ? ((loc === 'ar' ? cls.name_ar : loc === 'fr' ? cls.name_fr : cls.name_en) || cls.name_en) : ''
      // WL-TEMPLATES: confirmation carries THIS gym's localized name.
      const tw = await getTranslations({ locale: loc, namespace: 'whatsapp' })
      await dispatchWhatsApp(reg.gym_id, prof.phone, 'registration_approved', tw('tmpl.regApproved', { name, class: className, gym: gymDisplayName(gymRow, loc) }))
    }
  } catch { /* additive — never affects the approval */ }
  return { ok: true }
}

export async function rejectRegistration(regId: string, classId: string, reason?: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_class_registration', { p_reg_id: regId, p_reason: reason ?? null })
  if (error) return { ok: false, error: actionError(error) }
  revalidate(classId)
  return { ok: true }
}

export async function cancelRegistration(regId: string, classId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_class_registration', { p_reg_id: regId })
  if (error) return { ok: false, error: actionError(error) }
  revalidate(classId)
  return { ok: true }
}

export async function registerWalkIn(classId: string, studentId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_class_registration', { p_class_id: classId, p_student_id: studentId })
  if (error) return { ok: false, error: actionError(error) }
  revalidate(classId)
  return { ok: true }
}
