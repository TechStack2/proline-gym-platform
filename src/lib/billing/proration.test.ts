import { describe, it, expect } from 'vitest';
import {
  addMonths,
  sessionsInWindow,
  firstSessionOnOrAfter,
  cycleWindow,
  computeProration,
  defaultBillingAnchor,
  parseISODate,
  toISODate,
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
