import { describe, it, expect } from 'vitest';
import {
  FSI,
  LRI,
  PDI,
  isolate,
  ltrIsolate,
  stripIsolates,
  fmtDate,
  fmtDateRange,
  fmtTime,
  fmtTimeRange,
  fmtMoney,
  fmtMoneyPair,
  fmtPhone,
  enumLabel,
  humanizeEnum,
} from './index';

// A root-scoped translator stub: returns the message when the key is known,
// and (like next-intl) the key PATH when it is not.
const MESSAGES: Record<string, string> = {
  'beltRanks.white': 'White',
  'beltRanks.white_yellow': 'White Yellow',
  'beltRanks.black_1': 'Black 1st Dan',
  'statuses.paid': 'Paid',
  'statuses.partial': 'Partially paid',
};
const t = (key: string) => MESSAGES[key] ?? key;

describe('fmt/bidi', () => {
  it('wraps with FSI…PDI (first-strong) and LRI…PDI (forced LTR)', () => {
    expect(isolate('Karim')).toBe(`${FSI}Karim${PDI}`);
    expect(ltrIsolate('+961 70 123 456')).toBe(`${LRI}+961 70 123 456${PDI}`);
  });

  it('returns empty for blank input rather than a pair of bare controls', () => {
    expect(isolate('')).toBe('');
    expect(ltrIsolate(null)).toBe('');
    expect(ltrIsolate(undefined)).toBe('');
  });

  it('stripIsolates is the inverse', () => {
    expect(stripIsolates(ltrIsolate('20:00'))).toBe('20:00');
    expect(stripIsolates(fmtTimeRange('20:00', '21:30', 'ar'))).toBe('20:00–21:30');
  });
});

describe('fmt/date', () => {
  it('renders a DATE column on its own calendar day in every locale', () => {
    // Noon-anchored, so Asia/Beirut can never push it to the 5th or the 7th.
    expect(fmtDate('2026-07-06', 'en')).toBe('7/6/2026');
    expect(fmtDate('2026-07-06', 'fr')).toBe('06/07/2026');
  });

  it('ar renders LATIN digits (AX-1), never Arabic-Indic', () => {
    const ar = fmtDate('2026-07-06', 'ar');
    expect(ar).not.toMatch(/[٠-٩]/);
    // ICU emits its own RLM (U+200F) marks between the parts for ar-LB; strip
    // them and what is left must be Latin digits and separators.
    expect(ar.replace(/‏/g, '')).toMatch(/^[\d/]+$/);
  });

  it('medium/weekday are distinct named styles, not ad-hoc options', () => {
    expect(fmtDate('2026-07-06', 'en', 'medium')).toBe('Jul 6, 2026');
    expect(fmtDate('2026-07-06', 'en', 'weekday')).toBe('Mon, Jul 6');
  });

  it('empty/invalid input renders the placeholder, not "Invalid Date"', () => {
    expect(fmtDate(null, 'en')).toBe('—');
    expect(fmtDate('', 'en')).toBe('—');
    expect(fmtDate('not-a-date', 'en')).toBe('—');
    expect(fmtDate(null, 'en', 'short', '')).toBe('');
  });

  it('is 24-hour product-wide — including en and ar, whose locale default is 12h', () => {
    for (const locale of ['en', 'ar', 'fr']) {
      expect(fmtTime('2026-07-06T17:30:00Z', locale)).toBe('20:30'); // Asia/Beirut
      expect(fmtTime('2026-07-06T17:30:00Z', locale)).not.toMatch(/AM|PM|ص|م/);
    }
  });

  it('accepts a bare HH:MM wall-clock (how class_schedules stores times)', () => {
    expect(fmtTime('9:05', 'en')).toBe('09:05');
    expect(fmtTime('20:00:00', 'ar')).toBe('20:00');
  });

  it('isolates each side of a range so it cannot invert in Arabic (DA-7)', () => {
    expect(fmtTimeRange('20:00', '21:30', 'ar')).toBe(
      `${LRI}20:00${PDI}–${LRI}21:30${PDI}`,
    );
    expect(fmtDateRange('2026-07-06', '2026-08-06', 'en')).toBe(
      `${LRI}7/6/2026${PDI} → ${LRI}8/6/2026${PDI}`,
    );
  });
});

describe('fmt/money', () => {
  it('keeps the currency symbol side fixed regardless of locale (DA-7)', () => {
    const usd = fmtMoney(50, 4450000, 'USD');
    expect(usd.primary).toBe('$50.00'); // $ leads
    expect(usd.secondary).toBe('4,450,000 LBP'); // LBP trails
    const lbp = fmtMoney(50, 4450000, 'LBP');
    expect(lbp.primary).toBe('4,450,000 LBP');
    expect(lbp.secondary).toBe('$50.00');
  });

  it('delegates order to the unchanged ordered/dual contracts', () => {
    // BOTH: dual always shows both lines; ordered collapses to USD-primary.
    expect(fmtMoney(50, 0, 'BOTH', 'dual').secondary).toBe('0 LBP');
    expect(fmtMoney(50, 0, 'BOTH', 'ordered').secondary).toBeNull();
  });

  it('fmtMoneyPair isolates each amount around the separator', () => {
    expect(fmtMoneyPair(50, 4450000, 'BOTH')).toBe(
      `${LRI}$50.00${PDI} · ${LRI}4,450,000 LBP${PDI}`,
    );
    // No second amount → no dangling separator.
    expect(fmtMoneyPair(50, 0, 'USD')).toBe(`${LRI}$50.00${PDI}`);
  });
});

describe('fmt/phone', () => {
  it('groups E.164 for display with the + leading', () => {
    expect(fmtPhone('+96170123456')).toBe('+961 70 123 456');
    expect(fmtPhone('03123456')).toBe('+961 3 123 456');
  });

  it('blank in → placeholder out', () => {
    expect(fmtPhone(null)).toBe('—');
    expect(fmtPhone('', '')).toBe('');
  });
});

describe('fmt/enumLabel', () => {
  it('localizes belts through the one belt vocabulary (DA-9)', () => {
    expect(enumLabel('belts', 'white', t)).toBe('White');
    expect(enumLabel('belts', 'black_1', t)).toBe('Black 1st Dan');
  });

  it('localizes statuses, including the DA-11b "Partially paid" entry', () => {
    expect(enumLabel('status', 'paid', t)).toBe('Paid');
    expect(enumLabel('status', 'partial', t)).toBe('Partially paid');
  });

  it('never leaks a raw enum or a key path when a message is missing', () => {
    expect(enumLabel('status', 'some_future_state', t)).toBe('Some Future State');
    expect(enumLabel('belts', 'black_9', t)).toBe('Black 9');
    expect(humanizeEnum('black_1')).toBe('Black 1');
  });

  it('null/absent renders the placeholder', () => {
    expect(enumLabel('belts', null, t)).toBe('—');
    expect(enumLabel('status', undefined, t, '')).toBe('');
  });
});
