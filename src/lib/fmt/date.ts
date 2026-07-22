/**
 * DS2-FMT §2.7 — the ONE date/time formatting layer (DA-7 / DA-34).
 *
 * Before this module the app had no shared layer: "Jul 17" vs raw ISO
 * "2026-07-19 · 18:00" vs "7/19/2026" on adjacent tabs, one bare
 * `toLocaleDateString()` with no locale at all, and one site passing raw `'ar'`
 * instead of the Latin-digit `ar-LB-u-nu-latn` every neighbouring date uses.
 *
 * Rules this module enforces:
 *  · ONE style per context — lists = `short`, detail = `medium`. Never a raw ISO
 *    string, never a `toLocaleString` dump.
 *  · 24-hour product-wide (`hourCycle: 'h23'`), matching the schedule module and
 *    Lebanese convention — not the locale default (which is 12h in en/ar and 24h
 *    in fr, so the same screen disagreed with itself).
 *  · Arabic renders Latin digits (`ar-LB-u-nu-latn`, the existing AX-1 rule) —
 *    a raw `'ar'` locale leaks Arabic-Indic digits next to Latin ones.
 *  · `Asia/Beirut` — the gym's timezone, matching next-intl's `timeZone` config.
 *    Server and browser previously disagreed because none of the ~94 raw
 *    `toLocale*` calls passed one.
 *  · Ranges isolate their parts (see ./bidi) so "from → to" can never invert.
 */
import { dateLocale } from '@/lib/utils/locale-format';
import { ltrIsolate } from './bidi';

/** The gym's timezone. Matches `timeZone` in src/i18n/request.ts. */
export const GYM_TIME_ZONE = 'Asia/Beirut';

export type DateStyle = 'short' | 'medium' | 'dayMonth' | 'monthYear' | 'weekday';

const DATE_OPTS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  // `short` is the numeric form the app already renders everywhere
  // (`toLocaleDateString(dateLocale)` with no options) — stated explicitly so it
  // can never drift with an engine default.
  short: { year: 'numeric', month: 'numeric', day: 'numeric' },
  medium: { year: 'numeric', month: 'short', day: 'numeric' },
  // §2 permits a slice to EXTEND a primitive rather than fork it: `dayMonth` is
  // the year-less form the in-year billing-cycle lines need ("Renews Aug 6").
  dayMonth: { month: 'short', day: 'numeric' },
  monthYear: { month: 'short', year: '2-digit' },
  weekday: { weekday: 'short', month: 'short', day: 'numeric' },
};

export type DateInput = Date | string | number | null | undefined;

/** Coerce the shapes the codebase actually stores. Invalid/blank → null. */
function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  // A bare `YYYY-MM-DD` (a DATE column) is anchored at NOON UTC, not midnight, so
  // no timezone can push it onto the neighbouring calendar day. This is the
  // convention the call sites already hand-rolled (`d + 'T12:00:00Z'`).
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A calendar date. `empty` (default "—") when there is no value. */
export function fmtDate(
  value: DateInput,
  locale: string,
  style: DateStyle = 'short',
  empty = '—',
): string {
  const d = toDate(value);
  if (!d) return empty;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    ...DATE_OPTS[style],
    timeZone: GYM_TIME_ZONE,
  }).format(d);
}

/**
 * A clock time, 24-hour. Accepts a Date/ISO timestamp or a bare `HH:MM[:SS]`
 * wall-clock string (how `class_schedules` stores start/end times).
 */
export function fmtTime(value: DateInput, locale: string, empty = '—'): string {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
    const [h, m] = value.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  const d = toDate(value);
  if (!d) return empty;
  return new Intl.DateTimeFormat(dateLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: GYM_TIME_ZONE,
  }).format(d);
}

/**
 * "20:00–21:30" as ONE unit. Each side is LTR-isolated so the pair can never
 * invert in Arabic (DA-7: the portal schedule read "21:30 - 20:00", i.e. classes
 * that end before they start). The caller wraps the result in `<Ltr>`.
 */
export function fmtTimeRange(from: DateInput, to: DateInput, locale: string): string {
  return `${ltrIsolate(fmtTime(from, locale))}–${ltrIsolate(fmtTime(to, locale))}`;
}

/**
 * A weekday NAME from a `day_of_week` index (0=Sunday — how `class_schedules`
 * stores it). W3a extension (§2 "extend, never fork"): the schedule surfaces
 * hand-rolled three parallel day-name arrays (en/ar/fr) per file; this derives
 * the name through Intl like every other date value. `style` matches the
 * Intl option ('short' = "Mon"/"إثنين", 'long' = "Monday").
 */
export function fmtWeekday(
  dayOfWeek: number,
  locale: string,
  style: 'short' | 'long' = 'short',
): string {
  // 2024-01-07 was a Sunday; day 0..6 lands Sun..Sat. Noon UTC so no timezone
  // can shift the calendar day (same convention as toDate above).
  const d = new Date(Date.UTC(2024, 0, 7 + ((dayOfWeek % 7) + 7) % 7, 12));
  return new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: style,
    timeZone: GYM_TIME_ZONE,
  }).format(d);
}

/**
 * "6/7/2026 → 6/8/2026" as ONE unit, parts isolated (DA-7: the member-360
 * membership range rendered "72026/8/6 → /2026/7"). The arrow keeps its
 * left-to-right "from → to" reading because the caller isolates the whole run.
 */
export function fmtDateRange(
  from: DateInput,
  to: DateInput,
  locale: string,
  style: DateStyle = 'short',
  empty = '—',
): string {
  return `${ltrIsolate(fmtDate(from, locale, style, empty))} → ${ltrIsolate(
    fmtDate(to, locale, style, empty),
  )}`;
}
