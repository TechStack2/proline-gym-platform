import { describe, it, expect } from 'vitest';
import {
  addMonths,
  sessionsInWindow,
  firstSessionOnOrAfter,
  cycleWindow,
  computeProration,
  defaultBillingAnchor,
  calendarCycleAnchor,
  normalizeCycleDay,
  prorateDefaultFor,
  parseISODate,
  toISODate,
  type GymCyclePolicy,
} from './proration';

const D = parseISODate;
const MWF = [1, 3, 5]; // Mon / Wed / Fri
const DAILY = [0, 1, 2, 3, 4, 5, 6];
const MON = [1];

describe('addMonths — calendar clamp (Postgres date + interval parity)', () => {
  it('clamps Jan 31 → Feb 28/29', () => {
    expect(toISODate(addMonths(D('2024-01-31'), 1))).toBe('2024-02-29'); // leap
    expect(toISODate(addMonths(D('2023-01-31'), 1))).toBe('2023-02-28'); // non-leap
  });
  it('preserves normal days and steps multiple months', () => {
    expect(toISODate(addMonths(D('2024-01-15'), 1))).toBe('2024-02-15');
    expect(toISODate(addMonths(D('2024-01-31'), 2))).toBe('2024-03-31');
    expect(toISODate(addMonths(D('2024-12-15'), 1))).toBe('2025-01-15'); // year roll
  });
});

describe('sessionsInWindow — [from, to) weekday counting', () => {
  it('counts MWF across a full January 2024 cycle = 14', () => {
    // Jan 1 2024 is a Monday.
    expect(sessionsInWindow(MWF, D('2024-01-01'), D('2024-02-01'))).toBe(14);
  });
  it('end is exclusive', () => {
    // [Mon, Mon) with a Monday-only class counts the first Monday, not the second.
    expect(sessionsInWindow(MON, D('2024-01-01'), D('2024-01-08'))).toBe(1);
  });
  it('empty schedule or inverted window → 0', () => {
    expect(sessionsInWindow([], D('2024-01-01'), D('2024-02-01'))).toBe(0);
    expect(sessionsInWindow(MWF, D('2024-02-01'), D('2024-01-01'))).toBe(0);
  });
});

describe('firstSessionOnOrAfter', () => {
  it('returns the same day when it is a class day', () => {
    expect(toISODate(firstSessionOnOrAfter(MWF, D('2024-01-01'))!)).toBe('2024-01-01'); // Mon
  });
  it('advances to the next class day', () => {
    // 2024-01-14 is a Sunday → first MWF session is Mon Jan 15.
    expect(toISODate(firstSessionOnOrAfter(MWF, D('2024-01-14'))!)).toBe('2024-01-15');
  });
  it('null when the class has no schedule', () => {
    expect(firstSessionOnOrAfter([], D('2024-01-01'))).toBeNull();
  });
});

describe('cycleWindow — month-stepped grid containing a date', () => {
  it('onDate ≤ anchor → the anchor cycle', () => {
    const w = cycleWindow(D('2024-01-15'), D('2024-01-10'));
    expect([toISODate(w.start), toISODate(w.end)]).toEqual(['2024-01-15', '2024-02-15']);
  });
  it('onDate inside a later cycle steps forward', () => {
    const w = cycleWindow(D('2024-01-05'), D('2024-02-10'));
    expect([toISODate(w.start), toISODate(w.end)]).toEqual(['2024-02-05', '2024-03-05']);
  });
  it('respects month-end clamping in the grid', () => {
    const w = cycleWindow(D('2024-01-31'), D('2024-02-15'));
    expect([toISODate(w.start), toISODate(w.end)]).toEqual(['2024-01-31', '2024-02-29']);
  });
});

describe('computeProration', () => {
  const base = { rate: 89000, today: '2024-01-15' };

  it('full first cycle when anchor = start (no reduction even with prorate on)', () => {
    const r = computeProration({
      ...base,
      monthlyFeeUsd: 40,
      scheduleDays: DAILY,
      startDate: '2024-01-15',
      billingAnchor: '2024-01-15',
      prorate: true,
    });
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(40);
    expect(r.billsNow).toBe(true);
    expect(r.cycleStart).toBe('2024-01-15');
  });

  it('prorates a mid-cycle join on a 3×/week class (aligned anchor)', () => {
    // MWF, $60/mo, anchor Jan 1, join Jan 15. In-cycle sessions = 14; remaining from
    // Jan 15 = 8; session_value = 60/14 = 4.2857 → first = (60/14)*8 = 34.29.
    const r = computeProration({
      rate: 89000,
      today: '2024-01-15',
      monthlyFeeUsd: 60,
      scheduleDays: MWF,
      startDate: '2024-01-15',
      billingAnchor: '2024-01-01',
      prorate: true,
    });
    expect(r.sessionsInCycle).toBe(14);
    expect(r.sessionsRemaining).toBe(8);
    expect(r.sessionValueUsd).toBe(4.29);
    expect(r.firstInvoiceUsd).toBe(34.29);
    expect(r.firstInvoiceLbp).toBe(Math.round(34.29 * 89000));
    expect(r.prorated).toBe(true);
    expect(r.fullMonthUsd).toBe(60);
  });

  it('prorate OFF → always the full month even mid-cycle', () => {
    const r = computeProration({
      rate: 89000,
      today: '2024-01-15',
      monthlyFeeUsd: 60,
      scheduleDays: MWF,
      startDate: '2024-01-15',
      billingAnchor: '2024-01-01',
      prorate: false,
    });
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(60);
  });

  it('zero remaining sessions → rolls to the next full cycle', () => {
    // Monday-only class, anchor Jan 1. Join Tue Jan 30 (after the last Monday, Jan 29).
    // Current cycle has 0 remaining → bill the next cycle (Feb) in full.
    const r = computeProration({
      rate: null,
      today: '2024-01-30',
      monthlyFeeUsd: 40,
      scheduleDays: MON,
      startDate: '2024-01-30',
      billingAnchor: '2024-01-01',
      prorate: true,
    });
    expect(r.cycleStart).toBe('2024-02-01');
    expect(r.cycleEnd).toBe('2024-03-01');
    expect(r.sessionsInCycle).toBe(4); // Mondays in Feb 2024
    expect(r.sessionsRemaining).toBe(4);
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(40);
    expect(r.firstInvoiceLbp).toBe(0); // no rate
  });

  it('future start → does not bill now; previews the anchor cycle at full fee', () => {
    const r = computeProration({
      rate: 89000,
      today: '2024-01-15',
      monthlyFeeUsd: 50,
      scheduleDays: MWF,
      startDate: '2024-02-01',
      billingAnchor: '2024-02-02', // first MWF session on/after Feb 1 (Fri)
      prorate: true,
    });
    expect(r.billsNow).toBe(false);
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(50);
    expect(r.cycleStart).toBe('2024-02-02');
  });

  it('backdated start bills the CURRENT cycle, never retroactively', () => {
    // Started Jan 5 but today is Feb 10 → bill the Feb 5–Mar 5 cycle, not January.
    const r = computeProration({
      rate: 89000,
      today: '2024-02-10',
      monthlyFeeUsd: 30,
      scheduleDays: DAILY,
      startDate: '2024-01-05',
      billingAnchor: '2024-01-05',
      prorate: false,
    });
    expect(r.billsNow).toBe(true);
    expect(r.cycleStart).toBe('2024-02-05');
    expect(r.cycleEnd).toBe('2024-03-05');
    expect(r.firstInvoiceUsd).toBe(30);
  });

  it('no schedule → cannot prorate, charges the full month', () => {
    const r = computeProration({
      rate: 89000,
      today: '2024-01-15',
      monthlyFeeUsd: 45,
      scheduleDays: [],
      startDate: '2024-01-15',
      billingAnchor: '2024-01-01',
      prorate: true,
    });
    expect(r.sessionsInCycle).toBe(0);
    expect(r.sessionValueUsd).toBe(0);
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(45);
  });

  it('LBP follows the SQL round(usd × rate) idiom; null rate → 0', () => {
    const withRate = computeProration({
      rate: 89000, today: '2024-01-15', monthlyFeeUsd: 40, scheduleDays: DAILY,
      startDate: '2024-01-15', billingAnchor: '2024-01-15', prorate: false,
    });
    expect(withRate.firstInvoiceLbp).toBe(Math.round(40 * 89000));
    const noRate = computeProration({
      rate: null, today: '2024-01-15', monthlyFeeUsd: 40, scheduleDays: DAILY,
      startDate: '2024-01-15', billingAnchor: '2024-01-15', prorate: false,
    });
    expect(noRate.firstInvoiceLbp).toBe(0);
  });
});

describe('defaultBillingAnchor', () => {
  it('first scheduled session on/after start', () => {
    expect(defaultBillingAnchor(MWF, '2024-01-14')).toBe('2024-01-15'); // Sun → Mon
    expect(defaultBillingAnchor(MWF, '2024-01-15')).toBe('2024-01-15'); // Mon → same
  });
  it('falls back to the start date when the class has no schedule', () => {
    expect(defaultBillingAnchor([], '2024-01-14')).toBe('2024-01-14');
  });
});

// ── BILL-POLICY ─────────────────────────────────────────────────────────────
const ANNIVERSARY: GymCyclePolicy = { policy: 'anniversary', cycleDay: 1 };
const CAL_1ST: GymCyclePolicy = { policy: 'calendar', cycleDay: 1 };
const CAL_15TH: GymCyclePolicy = { policy: 'calendar', cycleDay: 15 };

describe('BILL-POLICY · calendarCycleAnchor — the boundary on/before a date', () => {
  it('snaps a mid-month date back to the cycle day', () => {
    expect(toISODate(calendarCycleAnchor(D('2024-01-17'), 1))).toBe('2024-01-01');
    expect(toISODate(calendarCycleAnchor(D('2024-01-17'), 15))).toBe('2024-01-15');
  });
  it('a date BEFORE the cycle day falls into the previous month', () => {
    expect(toISODate(calendarCycleAnchor(D('2024-01-09'), 15))).toBe('2023-12-15');
    expect(toISODate(calendarCycleAnchor(D('2024-01-01'), 15))).toBe('2023-12-15');
  });
  it('a date ON the boundary is already the anchor', () => {
    expect(toISODate(calendarCycleAnchor(D('2024-01-15'), 15))).toBe('2024-01-15');
    expect(toISODate(calendarCycleAnchor(D('2024-03-01'), 1))).toBe('2024-03-01');
  });
  it('clamps an out-of-range cycle day into the 1..28 grid (SQL mirrors this)', () => {
    expect(normalizeCycleDay(0)).toBe(1);
    expect(normalizeCycleDay(31)).toBe(28);
    expect(normalizeCycleDay(null)).toBe(1);
    expect(toISODate(calendarCycleAnchor(D('2024-01-30'), 31))).toBe('2024-01-28');
  });
  it('a cycle-day grid never walks backwards across a short month', () => {
    // The reason cycleDay is capped at 28: every month has one, so stepping the
    // grid a month at a time always lands on the same day-of-month.
    let cur = D('2024-01-28');
    for (const expected of ['2024-02-28', '2024-03-28', '2024-04-28']) {
      cur = addMonths(cur, 1);
      expect(toISODate(cur)).toBe(expected);
    }
  });
});

describe('BILL-POLICY · defaultBillingAnchor follows the gym policy', () => {
  it('anniversary reproduces the pre-BILL-POLICY anchor exactly', () => {
    // Jan 17 2024 is a Wednesday → MWF start is that same day.
    expect(defaultBillingAnchor(MWF, '2024-01-17', ANNIVERSARY)).toBe('2024-01-17');
    // Jan 16 is a Tuesday → next MWF session is Wed the 17th.
    expect(defaultBillingAnchor(MWF, '2024-01-16', ANNIVERSARY)).toBe('2024-01-17');
    expect(defaultBillingAnchor([], '2024-01-16', ANNIVERSARY)).toBe('2024-01-16');
  });
  it('the DEFAULT argument is anniversary — every pre-existing caller is unchanged', () => {
    expect(defaultBillingAnchor(MWF, '2024-01-16')).toBe(
      defaultBillingAnchor(MWF, '2024-01-16', ANNIVERSARY),
    );
  });
  it('calendar snaps to the gym boundary, ignoring the class schedule', () => {
    expect(defaultBillingAnchor(MWF, '2024-01-17', CAL_1ST)).toBe('2024-01-01');
    expect(defaultBillingAnchor(MWF, '2024-01-17', CAL_15TH)).toBe('2024-01-15');
    expect(defaultBillingAnchor([], '2024-01-17', CAL_1ST)).toBe('2024-01-01');
  });
});

describe('BILL-POLICY · the owner-reported flaw is actually fixed', () => {
  const base = { monthlyFeeUsd: 100, scheduleDays: MWF, rate: null, prorate: true };

  it('anniversary: a 17th join bills a FULL month and stays on the 17th (the flaw, now a deliberate policy)', () => {
    const startDate = '2024-01-17';
    const anchor = defaultBillingAnchor(MWF, startDate, ANNIVERSARY);
    const r = computeProration({ ...base, startDate, billingAnchor: anchor, today: startDate });
    expect(anchor).toBe('2024-01-17');
    expect(r.prorated).toBe(false);          // nothing to prorate — cycle starts at the join
    expect(r.firstInvoiceUsd).toBe(100);     // full month
    expect(r.cycleStart).toBe('2024-01-17');
    expect(r.cycleEnd).toBe('2024-02-17');   // …and every later cycle is the 17th
  });

  it('calendar: the SAME 17th join prorates a stub and lands the next cycle on the boundary', () => {
    const startDate = '2024-01-17';
    const anchor = defaultBillingAnchor(MWF, startDate, CAL_1ST);
    const r = computeProration({ ...base, startDate, billingAnchor: anchor, today: startDate });
    expect(anchor).toBe('2024-01-01');
    expect(r.cycleStart).toBe('2024-01-01');
    expect(r.cycleEnd).toBe('2024-02-01');   // ← the boundary the owner intended
    expect(r.prorated).toBe(true);
    // Jan 2024 MWF = 14 sessions; from Wed Jan 17 inclusive → 7 remain.
    expect(r.sessionsInCycle).toBe(14);
    expect(r.sessionsRemaining).toBe(7);
    expect(r.sessionValueUsd).toBe(7.14);
    expect(r.firstInvoiceUsd).toBe(50);      // 100 ÷ 14 × 7
  });

  it('calendar: joining ON the boundary is a full month, not a $0 stub', () => {
    const startDate = '2024-02-01';
    const anchor = defaultBillingAnchor(MWF, startDate, CAL_1ST);
    const r = computeProration({ ...base, startDate, billingAnchor: anchor, today: startDate });
    expect(anchor).toBe('2024-02-01');
    expect(r.prorated).toBe(false);
    expect(r.firstInvoiceUsd).toBe(100);
    expect(r.cycleEnd).toBe('2024-03-01');
  });

  it('calendar on a NON-1st cycle day: stub runs start → the 15th', () => {
    const startDate = '2024-01-20';
    const anchor = defaultBillingAnchor(MWF, startDate, CAL_15TH);
    const r = computeProration({ ...base, startDate, billingAnchor: anchor, today: startDate });
    expect(anchor).toBe('2024-01-15');
    expect(r.cycleStart).toBe('2024-01-15');
    expect(r.cycleEnd).toBe('2024-02-15');
    expect(r.prorated).toBe(true);
    expect(r.firstInvoiceUsd).toBeLessThan(100);
  });

  it('anniversary with a Jan-31 start clamps its later cycles (Feb 29 in a leap year)', () => {
    const startDate = '2024-01-31';
    const anchor = defaultBillingAnchor([], startDate, ANNIVERSARY);
    expect(anchor).toBe('2024-01-31');
    const r = computeProration({
      ...base, scheduleDays: DAILY, startDate, billingAnchor: anchor, today: startDate,
    });
    expect(r.cycleStart).toBe('2024-01-31');
    expect(r.cycleEnd).toBe('2024-02-29');   // clamped, matching Postgres
  });

  it('a staff anchor override still wins under BOTH policies', () => {
    const startDate = '2024-01-17';
    const OVERRIDE = '2024-01-08';
    for (const pol of [ANNIVERSARY, CAL_1ST]) {
      // The override must differ from what the policy would have derived, or this
      // proves nothing.
      const derived = defaultBillingAnchor(MWF, startDate, pol);
      expect(derived, `${pol.policy} derives a different anchor`).not.toBe(OVERRIDE);
      const r = computeProration({
        ...base, startDate, billingAnchor: OVERRIDE, today: startDate,
      });
      expect(r.cycleStart, `${pol.policy} honors the override`).toBe(OVERRIDE);
    }
  });
});

describe('BILL-POLICY · proration ROLE follows the policy (R3)', () => {
  it('calendar offers proration by default; anniversary does not', () => {
    expect(prorateDefaultFor('calendar')).toBe(true);
    expect(prorateDefaultFor('anniversary')).toBe(false);
  });
  it('under anniversary, prorate ON changes nothing for a fresh start — so defaulting it ON would imply a discount that never lands', () => {
    const startDate = '2024-01-17';
    const anchor = defaultBillingAnchor(MWF, startDate, ANNIVERSARY);
    const on = computeProration({ monthlyFeeUsd: 100, scheduleDays: MWF, startDate, billingAnchor: anchor, today: startDate, rate: null, prorate: true });
    const off = computeProration({ monthlyFeeUsd: 100, scheduleDays: MWF, startDate, billingAnchor: anchor, today: startDate, rate: null, prorate: false });
    expect(on.firstInvoiceUsd).toBe(off.firstInvoiceUsd);
    expect(on.prorated).toBe(false);
  });
});
