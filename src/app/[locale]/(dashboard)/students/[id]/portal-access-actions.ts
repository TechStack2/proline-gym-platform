'use server'

/**
 * MJ-1 FAMILY-DOOR — the staff eligibility override for portal login.
 *
 * `portal_login_override` on students is the ONLY thing that changes here: NULL
 * defers to the age-derived default (DOB>=18 eligible, <18 not); TRUE/FALSE is an
 * explicit staff decision (e.g. a mature 16-year-old who holds their own login, or
 * an adult the family wants routed through the guardian). Writes ride the existing
 * staff RLS on students (gym-scoped FOR ALL). The eligibility is READ back on the
 * member file and gates the Invite affordance.
 */
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error'

export async function setPortalLoginOverride(
  studentId: string,
  value: boolean | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('students').update({ portal_login_override: value }).eq('id', studentId)
  if (error) return { ok: false, error: actionError(error) }
  return { ok: true }
}
