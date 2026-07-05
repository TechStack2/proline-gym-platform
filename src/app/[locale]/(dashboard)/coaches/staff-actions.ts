'use server'

/**
 * STAFF-MGMT — deactivate/reactivate a staff member's access. Thin wrapper over the
 * SECURITY DEFINER set_staff_active() RPC (000084), which RE-ASSERTS every guardrail
 * server-side (owner/head_coach only; own gym; not yourself; not the last owner) —
 * never client-trusted. A deactivated staffer then fails is_staff()/is_gym_admin()
 * (get_user_role gated on is_active) → every staff-gated RLS policy denies them.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function setStaffActive(
  targetUserId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_staff_active', { p_user_id: targetUserId, p_active: active })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/coaches')
  return { ok: true }
}
