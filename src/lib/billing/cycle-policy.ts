/**
 * BILL-POLICY — read a gym's billing-cycle policy.
 *
 * The ONE server-side read path, so every surface that derives a billing anchor
 * (registration approval, previews) agrees with what `_default_billing_anchor`
 * will do in SQL. Falls back to the pre-BILL-POLICY behavior on any read failure:
 * a gym whose policy cannot be read must keep billing exactly as it does today,
 * never silently switch onto the month grid.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_CYCLE_POLICY,
  normalizeCycleDay,
  type BillingCyclePolicy,
  type GymCyclePolicy,
} from './proration';

export type { BillingCyclePolicy, GymCyclePolicy };

/** Coerce a stored row to a policy, defaulting to today's behavior. */
export function toCyclePolicy(row: {
  billing_cycle_policy?: string | null;
  billing_cycle_day?: number | null;
} | null | undefined): GymCyclePolicy {
  const policy: BillingCyclePolicy =
    row?.billing_cycle_policy === 'calendar' ? 'calendar' : 'anniversary';
  return { policy, cycleDay: normalizeCycleDay(row?.billing_cycle_day) };
}

/** Read a gym's cycle policy. Never throws — falls back to `anniversary`. */
export async function getGymCyclePolicy(
  supabase: SupabaseClient<any, any, any>,
  gymId: string | null | undefined,
): Promise<GymCyclePolicy> {
  if (!gymId) return DEFAULT_CYCLE_POLICY;
  try {
    const { data } = await supabase
      .from('gyms')
      .select('billing_cycle_policy, billing_cycle_day')
      .eq('id', gymId)
      .maybeSingle();
    return toCyclePolicy(data as any);
  } catch {
    return DEFAULT_CYCLE_POLICY;
  }
}
