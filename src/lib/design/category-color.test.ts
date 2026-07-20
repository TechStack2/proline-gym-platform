import { describe, it, expect } from 'vitest';
import { categoryIndex, categoryAttr, CATEGORY_HUE_COUNT } from './category-color';

/**
 * DS2-TOKENS §1.3 — the DISC-COLOR hash is a CONTRACT, not an implementation detail.
 *
 * A discipline's hue is computed during SSR and recomputed on hydrate, and it must be
 * the same value both times, on every machine, forever — otherwise a class chip flips
 * color on hydration, or a gym's whole timetable re-hues when CI moves to a different
 * Node. So the golden vectors below are hardcoded EXPECTED values, not values the test
 * recomputes from the function it is testing: if anyone changes the hash, these fail,
 * which is exactly what should happen (the change is visible to every gym).
 */

// Precomputed FNV-1a → slot. Do NOT regenerate these from the implementation; a
// vector that is derived from the code under test asserts nothing.
const GOLDEN: Array<[string, number]> = [
  ['bjj', 6],
  ['karate', 4],
  ['judo', 2],
  ['muay-thai', 7],
  ['boxing', 7],
  ['kickboxing', 1],
  ['wrestling', 1],
  ['mma', 3],
  ['11111111-1111-1111-1111-111111111111', 2],
  ['22222222-2222-2222-2222-222222222222', 2],
  ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 1],
  ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 8],
];

describe('DISC-COLOR — the category hue', () => {
  it('maps each id to its pinned slot (the SSR/hydrate stability contract)', () => {
    for (const [id, slot] of GOLDEN) {
      expect(categoryIndex(id), `${id} must stay on hue ${slot}`).toBe(slot);
    }
  });

  it('is pure — the same id yields the same hue however often it is asked', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const runs = Array.from({ length: 50 }, () => categoryIndex(id));
    expect(new Set(runs).size, 'a render loop must never re-hue a chip').toBe(1);
  });

  it('never leaves the palette', () => {
    for (const [id] of GOLDEN) {
      const i = categoryIndex(id);
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(CATEGORY_HUE_COUNT);
    }
  });

  it('falls to the quiet hue for a missing id rather than borrowing another category', () => {
    expect(categoryIndex(null)).toBe(8);
    expect(categoryIndex(undefined)).toBe(8);
    expect(categoryIndex('')).toBe(8);
  });

  it('does not depend on ORDER — which is the DA-31 defect it replaces', () => {
    // The old palette indexed by `sort_order`, so reordering the discipline list
    // reshuffled every color in the timetable. Hue follows identity now.
    const ids = ['karate', 'bjj', 'judo'];
    const before = ids.map(categoryIndex);
    const after = [...ids].reverse().map(categoryIndex).reverse();
    expect(after).toEqual(before);
  });

  it('spreads a realistic gym across the palette instead of clustering', () => {
    const counts = new Map<number, number>();
    for (let n = 0; n < 4000; n++) {
      const i = categoryIndex(`discipline-${n}-${n * 7919}`);
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    expect(counts.size, 'all eight hues are reachable').toBe(CATEGORY_HUE_COUNT);
    for (const [hue, n] of counts) {
      // Perfectly even would be 500. Allow generous slack — this guards against a
      // degenerate hash (e.g. one that keys off length), not against normal variance.
      expect(n, `hue ${hue} got ${n} of 4000`).toBeGreaterThan(300);
      expect(n, `hue ${hue} got ${n} of 4000`).toBeLessThan(700);
    }
  });

  it('renders the attribute the cat-tint utility selects on', () => {
    expect(categoryAttr('bjj')).toBe('6');
    expect(categoryAttr(null)).toBe('8');
  });
});
