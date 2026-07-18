/**
 * PUSH-1 — the notification `type` → push CATEGORY map (the 7/10 calibration).
 *
 * Every one of the notifications-table `type` strings maps to exactly ONE of the
 * three user-facing push categories. The map follows the owner's decree:
 *  - operational   : requests + approvals + the money/attendance/PT handoffs staff
 *                    and members act on (join/trial requests, payment recorded,
 *                    registration approved, …). The default for any unmapped/new
 *                    type — fail-safe toward MORE signal, per 7/10.
 *  - schedule      : time-based, tick-driven reminders (renewals, expiry, lapse,
 *                    suspension). "Class starting soon" would live here once a
 *                    frequent scheduler exists (see the sender notes).
 *  - informational : billing documents (invoice issued / overdue-due reminder).
 */
export const PUSH_CATEGORIES = ['operational', 'schedule', 'informational'] as const
export type PushCategory = (typeof PUSH_CATEGORIES)[number]

const SCHEDULE = new Set<string>([
  'renewal_due', 'renewal_reminder', 'membership_expiring', 'membership_lapsed',
  'registration_suspended', 'pt_refill_due',
])
const INFORMATIONAL = new Set<string>([
  'invoice_issued', 'invoice_overdue',
])

/** The push category for a notification `type` (default operational — fail-safe ON). */
export function categoryForType(type: string | null | undefined): PushCategory {
  if (!type) return 'operational'
  if (SCHEDULE.has(type)) return 'schedule'
  if (INFORMATIONAL.has(type)) return 'informational'
  return 'operational'
}

/** The `profiles` column that gates each category (default true — the 7/10 decree). */
export const PREF_COLUMN: Record<PushCategory, 'push_operational' | 'push_schedule' | 'push_informational'> = {
  operational: 'push_operational',
  schedule: 'push_schedule',
  informational: 'push_informational',
}

/** Is the recipient opted-in for this category? Missing pref → true (default ON). */
export function categoryEnabled(
  category: PushCategory,
  prefs: { push_operational?: boolean | null; push_schedule?: boolean | null; push_informational?: boolean | null } | null | undefined,
): boolean {
  const v = prefs?.[PREF_COLUMN[category]]
  return v !== false // NULL / undefined / true → enabled
}
