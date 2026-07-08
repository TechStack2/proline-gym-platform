'use server'

/**
 * Lifecycle server actions (ML-1) — thin wrappers over the guarded RPCs
 * (bounds, gym scoping and the next-cycle/no-proration rules all live in SQL).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/errors/action-error';

type Result = { ok: true; data?: unknown } | { ok: false; error: string }

async function call(fn: string, args: Record<string, unknown>, paths: string[]): Promise<Result> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, error: actionError(error) }
  for (const p of paths) revalidatePath(p)
  return { ok: true, data }
}

export const freezeMembership = (membershipId: string, days: number, studentId: string) =>
  call('freeze_membership', { p_membership_id: membershipId, p_days: days }, [`/students/${studentId}`, '/today'])

export const unfreezeMembership = (membershipId: string, studentId: string) =>
  call('unfreeze_membership', { p_membership_id: membershipId }, [`/students/${studentId}`, '/today'])

export const changeMembershipPlan = (membershipId: string, planId: string, studentId: string) =>
  call('change_membership_plan', { p_membership_id: membershipId, p_plan_id: planId }, [`/students/${studentId}`])

export const renewMembershipNow = (membershipId: string, studentId: string) =>
  call('renew_now', { p_membership_id: membershipId }, [`/students/${studentId}`, '/today', '/money'])

export const reinstateMembership = (membershipId: string, studentId: string) =>
  call('reinstate_membership', { p_membership_id: membershipId }, [`/students/${studentId}`, '/today'])

export const processRenewalsNow = () =>
  call('process_renewals_now', {}, ['/money', '/today', '/inbox'])
