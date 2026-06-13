/**
 * FIN-1 horizons — the Today/This Week/This Month lens.
 *
 * A horizon is just an UPPER bound on "due/expiring within": Today = end of
 * today, Week = +7d, Month = +30d (cumulative — Week contains Today). The same
 * ActionCard stack re-scopes against `horizonEnd`; Today stays the default and
 * Week/Month are read-only lenses (per-row actions are unchanged).
 */
export type Horizon = 'today' | 'week' | 'month'

export const HORIZONS: Horizon[] = ['today', 'week', 'month']

export function parseHorizon(v: string | undefined): Horizon {
  return v === 'week' || v === 'month' ? v : 'today'
}

/** Days added to today for the horizon's upper bound. */
export function horizonDays(h: Horizon): number {
  return h === 'today' ? 0 : h === 'week' ? 7 : 30
}

/** YYYY-MM-DD upper bound (inclusive) for the horizon, anchored at `now`. */
export function horizonEndDate(h: Horizon, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12))
  d.setUTCDate(d.getUTCDate() + horizonDays(h))
  return d.toISOString().slice(0, 10)
}
