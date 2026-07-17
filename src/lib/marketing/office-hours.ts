// ── Office-hours model (LANDING-CUSTOM) ──
// gyms.office_hours is a JSONB map of the 7 weekday keys → a day's hours. A day is
// either open (open+close "HH:MM" 24h strings) or closed. NULL column = don't
// render (the footer keeps its i18n fallback). Kept deliberately small + explicit
// so get_public_gym's anon exposure stays auditable.

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export type DayHours = { closed: boolean; open: string; close: string }
export type OfficeHours = Record<DayKey, DayHours>

// A sensible starting point for the editor (typical Lebanese gym week): weekday
// evenings, a shorter Saturday, Sunday closed. Owners edit from here.
export function defaultOfficeHours(): OfficeHours {
  const weekday: DayHours = { closed: false, open: '16:00', close: '21:00' }
  return {
    mon: { ...weekday },
    tue: { ...weekday },
    wed: { ...weekday },
    thu: { ...weekday },
    fri: { ...weekday },
    sat: { closed: false, open: '10:00', close: '14:00' },
    sun: { closed: true, open: '10:00', close: '14:00' },
  }
}

// Coerce whatever is stored (JSONB Json, possibly partial/legacy) into a complete,
// well-typed OfficeHours — missing days fall back to the default for that day.
export function normalizeOfficeHours(raw: unknown): OfficeHours {
  const base = defaultOfficeHours()
  if (!raw || typeof raw !== 'object') return base
  const src = raw as Record<string, unknown>
  for (const day of DAY_KEYS) {
    const d = src[day]
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    base[day] = {
      closed: typeof o.closed === 'boolean' ? o.closed : base[day].closed,
      open: typeof o.open === 'string' ? o.open : base[day].open,
      close: typeof o.close === 'string' ? o.close : base[day].close,
    }
  }
  return base
}

// True when there is any renderable hours data (used to gate the landing section:
// NULL / absent column → false → the footer keeps its hardcoded i18n fallback).
export function hasOfficeHours(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && DAY_KEYS.some((d) => d in (raw as Record<string, unknown>))
}
