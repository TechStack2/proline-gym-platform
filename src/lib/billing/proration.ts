/**
 * BILL-CYCLES — session-based first-cycle proration (pure, deterministic).
 *
 * OWNER MODEL. A class registration bills as a monthly recurring cycle. The
 * monthly price buys the scheduled sessions in that cycle, so:
 *
 *     session_value = monthly_fee ÷ (scheduled sessions in the cycle)
 *
 * When a member joins partway into an established cycle (staff aligned the
 * billing anchor to an earlier date), the FIRST invoice may be prorated to the
 * sessions that remain:  remaining_sessions × session_value.  Every LATER cycle
 * is billed at the full monthly fee via the renewal path — proration is a
 * first-cycle-only concern.
 *
 * This module is the single source of the math. It powers the live registration
 * PREVIEW (client-side, no round-trip). The DB (`_activate_class_registration`,
 * `_class_sessions_in_window`, `_reg_cycle_bounds`) implements the SAME spec and
 * is authoritative for the charge, so preview and invoice agree by construction;
 * the e2e asserts the real invoice amounts in both currencies.
 *
 * DATE DISCIPLINE. All arithmetic is on UTC calendar dates (no wall-clock, no
 * timezone drift) to match Postgres `DATE` math exactly:
 *   · weekday 0=Sunday..6=Saturday  →  JS getUTCDay() === Postgres EXTRACT(DOW)
 *     === class_schedules.day_of_week.
 *   · `addMonths` clamps day-of-month (Jan 31 + 1 month → Feb 28/29), matching
 *     Postgres `date + interval '1 month'`.
 *   · a cycle window is [start, end) — end exclusive.
 *
 * Pure: no Date.now(), no I/O. `today` is injected so the function is testable
 * and identical across server / client / SQL reference.
 */

/** Distinct weekdays a class meets, 0=Sunday … 6=Saturday. */
export type WeekdaySet = number[];

export interface ProrationInput {
  /** Monthly NET fee in USD (discount already applied by the caller, as the SQL does). */
  monthlyFeeUsd: number;
  /** The class's weekly schedule days (0=Sun..6=Sat). Empty → cannot prorate. */
  scheduleDays: WeekdaySet;
  /** The member's start date (ISO yyyy-mm-dd). today / future / past all allowed. */
  startDate: string;
  /** The billing anchor (ISO) — the cycle grid origin. Defaults to startDate upstream. */
  billingAnchor: string;
  /** Reference "now" (ISO) — injected for determinism. */
  today: string;
  /** FX rate USD→LBP; null/undefined → 0 LBP (mirrors the SQL rate-absent branch). */
  rate?: number | null;
  /** The staff "prorate first cycle" toggle. */
  prorate: boolean;
}

export interface ProrationResult {
  /** First billed cycle window (ISO), end exclusive. */
  cycleStart: string;
  cycleEnd: string;
  /** Scheduled sessions in the whole cycle (the session_value denominator). */
  sessionsInCycle: number;
  /** Scheduled sessions the member is billed for (remaining from their effective start). */
  sessionsRemaining: number;
  /** monthly_fee ÷ sessionsInCycle, rounded to cents (0 when the cycle has no sessions). */
  sessionValueUsd: number;
  /** The first invoice: prorated (remaining × session_value) or the full monthly fee. */
  firstInvoiceUsd: number;
  /** round(firstInvoiceUsd × rate) — nearest whole LBP, matching the SQL idiom. 0 when no rate. */
  firstInvoiceLbp: number;
  /** The un-prorated monthly NET (for a "was $X" strike-through in the preview). */
  fullMonthUsd: number;
  /** True only when a real reduction happened (prorate on, remaining < in-cycle, sessions>0). */
  prorated: boolean;
  /** False when startDate is in the future — no invoice issues now; billing begins at the anchor. */
  billsNow: boolean;
}

// ── date helpers (UTC, Postgres-DATE-faithful) ──────────────────────────────

/** Parse an ISO yyyy-mm-dd (or ISO datetime) to a UTC-midnight Date. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date to ISO yyyy-mm-dd (UTC). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar-month add with day-of-month clamping — matches `date + interval 'N month'`. */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(y, m + n, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return firstOfTarget;
}

/** Count scheduled sessions in [fromIncl, toExcl): days whose weekday is in `days`. */
export function sessionsInWindow(days: WeekdaySet, fromIncl: Date, toExcl: Date): number {
  if (!days.length || fromIncl >= toExcl) return 0;
  const set = new Set(days);
  let count = 0;
  const cur = new Date(fromIncl.getTime());
  while (cur < toExcl) {
    if (set.has(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** The first scheduled session on/after `from` (scanning one week); null if the class has no schedule. */
export function firstSessionOnOrAfter(days: WeekdaySet, from: Date): Date | null {
  if (!days.length) return null;
  const set = new Set(days);
  const cur = new Date(from.getTime());
  for (let i = 0; i < 7; i++) {
    if (set.has(cur.getUTCDay())) return cur;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return null;
}

/**
 * The month-stepped cycle window [start, end) that contains `onDate`, given the
 * anchor grid. When onDate ≤ anchor the first cycle [anchor, anchor+1mo) is used.
 */
export function cycleWindow(anchor: Date, onDate: Date): { start: Date; end: Date } {
  if (onDate <= anchor) return { start: anchor, end: addMonths(anchor, 1) };
  let k = 0;
  while (addMonths(anchor, k + 1) <= onDate) k++;
  return { start: addMonths(anchor, k), end: addMonths(anchor, k + 1) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the first-cycle proration for a class registration.
 *
 * Effective billing start = max(startDate, today): a backdated start bills the
 * CURRENT cycle from today (never retroactively), a future start defers (billsNow
 * = false) and previews the anchor's first full cycle. Proration reduces the
 * charge only when the effective start lands after the cycle's own start (i.e.
 * staff anchored the cycle earlier than the member joined). Zero remaining
 * sessions → roll to the next cycle (billed full there).
 */
export function computeProration(input: ProrationInput): ProrationResult {
  const { monthlyFeeUsd, scheduleDays, rate, prorate } = input;
  const start = parseISODate(input.startDate);
  const anchor = parseISODate(input.billingAnchor);
  const today = parseISODate(input.today);

  const billsNow = start.getTime() <= today.getTime();
  // Bill from the later of start/today, but never before the cycle begins.
  const effectiveOn = start.getTime() >= today.getTime() ? start : today;

  let { start: cStart, end: cEnd } = cycleWindow(anchor, effectiveOn);
  let billFrom = effectiveOn < cStart ? cStart : effectiveOn;

  let sessionsInCycle = sessionsInWindow(scheduleDays, cStart, cEnd);
  let sessionsRemaining = sessionsInWindow(scheduleDays, billFrom, cEnd);

  // Zero-remaining edge: the member joined after this cycle's last session →
  // billing begins clean at the NEXT cycle (full), not a $0 invoice.
  if (prorate && sessionsInCycle > 0 && sessionsRemaining === 0) {
    cStart = cEnd;
    cEnd = addMonths(anchor, monthsBetween(anchor, cStart) + 1);
    billFrom = cStart;
    sessionsInCycle = sessionsInWindow(scheduleDays, cStart, cEnd);
    sessionsRemaining = sessionsInCycle;
  }

  const sessionValueUsd = sessionsInCycle > 0 ? round2(monthlyFeeUsd / sessionsInCycle) : 0;
  const doProrate = prorate && sessionsInCycle > 0 && sessionsRemaining < sessionsInCycle;
  const firstInvoiceUsd = doProrate
    ? round2((monthlyFeeUsd / sessionsInCycle) * sessionsRemaining)
    : round2(monthlyFeeUsd);
  const firstInvoiceLbp = rate ? Math.round(firstInvoiceUsd * rate) : 0;

  return {
    cycleStart: toISODate(cStart),
    cycleEnd: toISODate(cEnd),
    sessionsInCycle,
    sessionsRemaining,
    sessionValueUsd,
    firstInvoiceUsd,
    firstInvoiceLbp,
    fullMonthUsd: round2(monthlyFeeUsd),
    prorated: doProrate,
    billsNow,
  };
}

/** Whole calendar months between two anchor-grid dates (a helper for the zero-remaining roll). */
function monthsBetween(anchor: Date, target: Date): number {
  let k = 0;
  while (addMonths(anchor, k + 1) <= target) k++;
  return k;
}

// ── BILL-POLICY: the per-gym cycle policy ───────────────────────────────────

/**
 * `calendar`    — every registration bills on the month grid, on the gym's
 *                 `cycleDay`. A mid-month join prorates a STUB from the start to
 *                 the next boundary; every later cycle runs boundary → boundary.
 * `anniversary` — each registration bills from its own start. No normalization.
 *                 This is the pre-BILL-POLICY behavior and the default.
 */
export type BillingCyclePolicy = 'calendar' | 'anniversary';

export interface GymCyclePolicy {
  policy: BillingCyclePolicy;
  /** The month-grid boundary day, 1..28. Ignored under `anniversary`. */
  cycleDay: number;
}

/** What every existing gym has: today's behavior, unchanged. */
export const DEFAULT_CYCLE_POLICY: GymCyclePolicy = { policy: 'anniversary', cycleDay: 1 };

/** Clamp a stored cycle day into the supported 1..28 grid (SQL mirrors this). */
export function normalizeCycleDay(day: number | null | undefined): number {
  const n = Math.trunc(Number(day ?? 1));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), 28);
}

/**
 * The cycle-day boundary ON OR BEFORE `on` — the SQL twin of
 * `_calendar_cycle_anchor`. Anchoring at the boundary BEFORE the start is what
 * makes the first cycle a partial stub.
 */
export function calendarCycleAnchor(on: Date, cycleDay: number): Date {
  const day = normalizeCycleDay(cycleDay);
  let v = new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), day));
  if (v > on) v = addMonths(v, -1);
  return v;
}

/**
 * Derive the default billing anchor for a fresh registration, per the gym's policy.
 *
 *   · `anniversary` — the first scheduled session on/after the start date, else
 *     the start date itself. Byte-identical to the pre-BILL-POLICY behavior, which
 *     is why the default argument reproduces it exactly for every existing caller.
 *   · `calendar` — the gym's cycle-day boundary on/before the start date.
 *
 * SQL twin: `_default_billing_anchor(gym, class, start)`.
 */
export function defaultBillingAnchor(
  scheduleDays: WeekdaySet,
  startDate: string,
  cyclePolicy: GymCyclePolicy = DEFAULT_CYCLE_POLICY,
): string {
  const start = parseISODate(startDate);
  if (cyclePolicy.policy === 'calendar') {
    return toISODate(calendarCycleAnchor(start, cyclePolicy.cycleDay));
  }
  const first = firstSessionOnOrAfter(scheduleDays, start);
  return toISODate(first ?? start);
}

/**
 * R3 — proration's ROLE follows the policy.
 *
 *   · `calendar`    — proration IS the normalizing stub charge, so it is offered
 *     ON by default: without it the member pays a full month for a part month.
 *   · `anniversary` — a fresh registration's cycle starts on the member's own
 *     start date, so there is nothing to prorate (remaining === in-cycle and the
 *     charge is unchanged). Defaulting it ON would imply a discount that never
 *     materializes, so it stays OFF and stays a deliberate staff choice.
 */
export function prorateDefaultFor(policy: BillingCyclePolicy): boolean {
  return policy === 'calendar';
}
