/**
 * TRIAL-SLOTS — pure occurrence/slot math for booking a trial against something REAL
 * (field finding 1). A CLASS trial pins a real upcoming class occurrence; a PT trial
 * pins a real free slot in the coach's availability (class hours + existing PT struck).
 *
 * Pure (UTC day-math like billing/proration.ts; interval math via coach/availability's
 * openAvailabilityGaps) — the server component/action gathers the rows and calls these.
 */
import { openAvailabilityGaps, type AvailabilityWindow, type AvailabilityOverride, type Interval } from '@/lib/coach/availability'

export type TrialScheduleRow = {
  classId: string
  className: string
  coachId: string | null
  coachName: string
  maxCapacity: number | null
  activeRegCount: number
  dayOfWeek: number // 0=Sun … 6=Sat (Postgres EXTRACT(DOW) === Date.getUTCDay)
  startTime: string // HH:MM[:SS]
  endTime: string
  validFrom: string | null
  validUntil: string | null
}

export type ClassOccurrence = {
  classId: string
  className: string
  coachId: string | null
  coachName: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string
  spotsLeft: number | null // null = no capacity set
  full: boolean
}

const hm = (t: string) => t.slice(0, 5)

/**
 * Expand active weekly class_schedules into dated occurrences in [fromISO, +days),
 * honoring valid_from/valid_until. `spotsLeft` is capacity − current active
 * registrations (class-level; the owner allows a trial to overbook a full class).
 */
export function upcomingClassOccurrences(rows: TrialScheduleRow[], fromISO: string, days = 14): ClassOccurrence[] {
  const out: ClassOccurrence[] = []
  const from = new Date(`${fromISO}T00:00:00Z`)
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime())
    d.setUTCDate(d.getUTCDate() + i)
    const dateISO = d.toISOString().slice(0, 10)
    const dow = d.getUTCDay()
    for (const s of rows) {
      if (s.dayOfWeek !== dow) continue
      if (s.validFrom && dateISO < s.validFrom) continue
      if (s.validUntil && dateISO > s.validUntil) continue
      const spotsLeft = s.maxCapacity == null ? null : s.maxCapacity - s.activeRegCount
      out.push({
        classId: s.classId, className: s.className, coachId: s.coachId, coachName: s.coachName,
        date: dateISO, startTime: hm(s.startTime), endTime: hm(s.endTime),
        spotsLeft, full: spotsLeft != null && spotsLeft <= 0,
      })
    }
  }
  return out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
}

/** Slice free HH:MM gaps into slot-sized start times (last partial slot dropped). */
export function gapsToSlots(gaps: Interval[], slotMinutes: number): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const out: string[] = []
  for (const g of gaps) {
    let s = toMin(g.start)
    const e = toMin(g.end)
    while (s + slotMinutes <= e) {
      out.push(toHM(s))
      s += slotMinutes
    }
  }
  return out
}

export type PtTrialSlot = { date: string; time: string } // YYYY-MM-DD, HH:MM

/**
 * A coach's bookable trial slots over [fromISO, +days). Reuses the PT idiom
 * (openAvailabilityGaps: published windows + extras − blocks − busy) then grids the
 * gaps. `busyByDate[date]` = that day's class hours + existing PT as HH:MM intervals.
 */
export function coachTrialSlots(opts: {
  fromISO: string
  days: number
  slotMinutes: number
  windows: AvailabilityWindow[]
  overrides: AvailabilityOverride[]
  busyByDate: Record<string, Interval[]>
}): PtTrialSlot[] {
  const out: PtTrialSlot[] = []
  const from = new Date(`${opts.fromISO}T00:00:00Z`)
  for (let i = 0; i < opts.days; i++) {
    const d = new Date(from.getTime())
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    const gaps = openAvailabilityGaps({
      date, dow: d.getUTCDay(), windows: opts.windows, overrides: opts.overrides,
      busy: opts.busyByDate[date] ?? [],
    })
    for (const time of gapsToSlots(gaps, opts.slotMinutes)) out.push({ date, time })
  }
  return out
}
