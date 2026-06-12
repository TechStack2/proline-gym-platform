/**
 * Read-time lifecycle states (ML-1 architecture rule: no displayed state can
 * be stale — the tick only materializes side-effects). Shared by Member-360,
 * Today cards, portal banners and the check-in warning.
 */
export type MembershipState = 'active' | 'expiring' | 'overdue' | 'lapsed' | 'frozen' | 'none'

export function membershipState(
  m: { status: string; end_date: string; pause_end_date?: string | null } | null | undefined,
  policy: { renewal_lead_days?: number | null; dunning_grace_days?: number | null } = {},
  now = new Date(),
): MembershipState {
  if (!m) return 'none'
  if (m.status === 'paused') return 'frozen'
  if (m.status === 'lapsed') return 'lapsed'
  if (m.status !== 'active') return 'none'
  const today = now.toISOString().slice(0, 10)
  const lead = policy.renewal_lead_days ?? 7
  const grace = policy.dunning_grace_days ?? 7
  if (m.end_date < today) {
    // unpaid past grace flips to lapsed at the next tick — read-time honesty
    const graceEnd = new Date(new Date(m.end_date + 'T12:00:00Z').getTime() + grace * 864e5)
      .toISOString().slice(0, 10)
    return graceEnd < today ? 'lapsed' : 'overdue'
  }
  const leadStart = new Date(now.getTime() + lead * 864e5).toISOString().slice(0, 10)
  return m.end_date <= leadStart ? 'expiring' : 'active'
}

export type RegistrationState = 'active' | 'expiring' | 'overdue' | 'suspended' | 'other'

export function registrationState(
  r: { status: string; paid_until?: string | null; start_date?: string | null; requested_at?: string },
  policy: { renewal_lead_days?: number | null; dunning_grace_days?: number | null } = {},
  now = new Date(),
): RegistrationState {
  if (r.status === 'suspended') return 'suspended'
  if (r.status !== 'active') return 'other'
  const anchorBase = r.paid_until
    ?? (r.start_date ? addDays(r.start_date, 30) : r.requested_at ? addDays(r.requested_at.slice(0, 10), 30) : null)
  if (!anchorBase) return 'active'
  const today = now.toISOString().slice(0, 10)
  const lead = policy.renewal_lead_days ?? 7
  if (anchorBase < today) return 'overdue'
  return anchorBase <= addDays(today, lead) ? 'expiring' : 'active'
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
