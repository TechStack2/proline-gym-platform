import { describe, it, expect } from 'vitest';
import {
  TAB_BAR_CAPACITY,
  TabCapacityError,
  assertTabCapacity,
} from './tab-capacity';

const tabs = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `t${i}` }));

describe('TabBar capacity assert (§2.2)', () => {
  it('the ceiling is 5 INCLUDING More', () => {
    expect(TAB_BAR_CAPACITY).toBe(5);
  });

  it('accepts a config at or under capacity', () => {
    expect(() => assertTabCapacity(tabs(5), 'staff')).not.toThrow();
    expect(() => assertTabCapacity(tabs(4), 'staff')).not.toThrow();
    expect(() => assertTabCapacity([], 'staff')).not.toThrow();
  });

  it('throws on the sixth tab, naming the shell and the offending keys', () => {
    expect(() => assertTabCapacity(tabs(6), 'portal')).toThrow(TabCapacityError);
    try {
      assertTabCapacity(tabs(6), 'portal');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('"portal"');
      expect(message).toContain('6 tabs');
      expect(message).toContain('t5');
      expect(message).toContain('More sheet');
    }
  });

  it("catches today's portal (7) and coach (6) flat configs — DA-3", () => {
    expect(() =>
      assertTabCapacity(
        ['home', 'classes', 'schedule', 'progress', 'billing', 'pt', 'profile'].map((key) => ({ key })),
        'portal',
      ),
    ).toThrow(TabCapacityError);
    expect(() =>
      assertTabCapacity(
        ['schedule', 'attendance', 'students', 'pt', 'trials', 'profile'].map((key) => ({ key })),
        'coach',
      ),
    ).toThrow(TabCapacityError);
  });
});
