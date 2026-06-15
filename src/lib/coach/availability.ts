/**
 * Coach availability gap math (TEAM-1 — Day Diary floor lens).
 *
 * "Open gaps" = the coach's PUBLISHED bookable time (recurring `coach_availability`
 * windows for a weekday, adjusted by per-date `coach_availability_overrides`) MINUS
 * what's already busy that day (recurring class slots + non-cancelled PT sessions).
 * The remaining free intervals are the PT-upsell signal the diary surfaces.
 *
 * Pure interval arithmetic in minutes-since-midnight — zero schema, zero IO. The
 * caller resolves PT session clock times into the gym timezone via {@link hmInTz}.
 */

export type AvailabilityWindow = { day_of_week: number; start_time: string; end_time: string }
export type AvailabilityOverride = { date: string; kind: 'block' | 'extra'; start_time: string | null; end_time: string | null }
export type Interval = { start: string; end: string }

const toMin = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const toHM = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Merge overlapping/adjacent intervals into a normalized, sorted set. */
function union(intervals: [number, number][]): [number, number][] {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** Subtract `cuts` from `base`, returning the remaining positive-length pieces. */
function subtract(base: [number, number][], cuts: [number, number][]): [number, number][] {
  let result = union(base)
  for (const [cs, ce] of union(cuts)) {
    const next: [number, number][] = []
    for (const [s, e] of result) {
      if (ce <= s || cs >= e) { next.push([s, e]); continue }
      if (cs > s) next.push([s, cs])
      if (ce < e) next.push([ce, e])
    }
    result = next
  }
  return result.filter(([s, e]) => e > s)
}

/**
 * Free, bookable gaps for `date` (weekday `dow`): the published windows + extras,
 * minus whole/partial blocks, minus the busy class+PT intervals. `overrides` is the
 * full list — filtered to `date` here. Returns sorted HH:MM intervals (may be empty).
 */
export function openAvailabilityGaps(opts: {
  date: string
  dow: number
  windows: AvailabilityWindow[]
  overrides: AvailabilityOverride[]
  busy: Interval[]
}): Interval[] {
  const dayOverrides = opts.overrides.filter((o) => o.date === opts.date)
  // A whole-day block (NULL times) wipes availability for the date entirely.
  if (dayOverrides.some((o) => o.kind === 'block' && (!o.start_time || !o.end_time))) return []

  let base: [number, number][] = opts.windows
    .filter((w) => w.day_of_week === opts.dow)
    .map((w) => [toMin(w.start_time), toMin(w.end_time)] as [number, number])
  for (const o of dayOverrides)
    if (o.kind === 'extra' && o.start_time && o.end_time) base.push([toMin(o.start_time), toMin(o.end_time)])
  base = union(base)

  const blocks = dayOverrides
    .filter((o) => o.kind === 'block' && o.start_time && o.end_time)
    .map((o) => [toMin(o.start_time!), toMin(o.end_time!)] as [number, number])
  base = subtract(base, blocks)

  const busy = opts.busy.map((b) => [toMin(b.start), toMin(b.end)] as [number, number])
  return subtract(base, busy).map(([s, e]) => ({ start: toHM(s), end: toHM(e) }))
}

/** Clock HH:MM of a timestamp in a given IANA timezone (gym-local, 24h). */
export function hmInTz(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${h === '24' ? '00' : h}:${m}`
}
