'use server'

/**
 * Coach 360 — the ONE guardrailed write on this surface (TEAM-1).
 *
 * Locked permission fork: owner + head_coach + reception all MANAGE coach
 * scheduling/availability/assignments (those reuse existing verified writers
 * — coach_availability inserts, book_pt_session, the class wizard — gated by
 * the staff `coach_availability_staff` / `coaches_staff` RLS that already
 * covers reception in-gym). DEACTIVATE is the single owner/head_coach-only
 * action, so it is gated here on the CALLER'S role (defense-in-depth on top of
 * RLS, which can't separate reception from owner without a per-column split we
 * deliberately don't make — see the audit note). The write itself is the same
 * archive-not-delete pattern the ADM-1 coach detail used.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PRIVILEGED = ['owner', 'head_coach']

export async function setCoachActive(input: {
  coachId: string
  active: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, gym_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!roleRow || !PRIVILEGED.includes(roleRow.role)) return { ok: false, error: 'forbidden' }

  const { error } = await supabase
    .from('coaches')
    .update(
      input.active
        ? { is_active: true, deleted_at: null }
        : { is_active: false, deleted_at: new Date().toISOString() },
    )
    .eq('id', input.coachId)
    .eq('gym_id', roleRow.gym_id) // tenant scope (RLS also enforces this)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/[locale]/coaches', 'page')
  revalidatePath('/[locale]/coaches/[id]', 'page')
  return { ok: true }
}
