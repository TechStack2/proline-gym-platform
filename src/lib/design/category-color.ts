/**
 * DS2-TOKENS §1.3 — DISC-COLOR: the category hue a discipline wears.
 *
 * THE PROBLEM THIS RETIRES (DA-31). The timetable used to assign colors by the
 * discipline's *sort position* out of a palette whose first entry was the brand
 * crimson, painted as a SOLID saturated fill. Two consequences: a perfectly normal
 * Monday class rendered as an alarm, and the color of every class silently reshuffled
 * whenever an admin reordered the discipline list. Both are fixed here — the hue is
 * derived from the discipline's immutable id, and it renders as a tint (`cat-tint`
 * in globals.css), never a fill.
 *
 * THE HASH: FNV-1a, 32-bit, over the id's UTF-16 code units, then `% 8 + 1`.
 *
 * Why FNV-1a. It is a pure integer function of the string — no randomness, no locale,
 * no Intl, no Date, no platform-dependent float. `Math.imul` performs the 32-bit
 * multiply with exactly the same wraparound on every JS engine, so the same id yields
 * the same hue on the server that renders it, in the browser that hydrates it, in CI,
 * and on any developer's machine. That is what "stable across renders and machines"
 * has to mean for a value that is computed during SSR and must not change on hydrate.
 * (It is a dispersion hash, not a cryptographic one — nothing here is a secret.)
 *
 * NO MIGRATION. The assignment is derived, so it needs no column and no backfill.
 * §1.3 reserves a per-discipline override column as a Wave-3 decision; when that
 * lands, this stays the default for any discipline that has not set one.
 */

/** The number of hues in the fixed categorical palette (--c-cat-1 … --c-cat-8). */
export const CATEGORY_HUE_COUNT = 8;

/** A palette slot, 1-based to match the `--c-cat-N` token names. */
export type CategoryIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * The hue a discipline id maps to. Empty/missing ids fall to slot 8 (slate — the
 * deliberately quiet hue), so an unclassified block reads as "no category" rather
 * than borrowing some other discipline's identity.
 */
export function categoryIndex(id: string | null | undefined): CategoryIndex {
  if (!id) return CATEGORY_HUE_COUNT as CategoryIndex;

  // FNV-1a 32-bit. `>>> 0` keeps the accumulator an unsigned 32-bit value; Math.imul
  // is the 32-bit multiply (a plain `*` would go through float64 and lose the low
  // bits once the product exceeds 2^53).
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ((hash % CATEGORY_HUE_COUNT) + 1) as CategoryIndex;
}

/**
 * The `data-cat` attribute value for a discipline. Pair it with the `cat-tint` (or
 * `cat-dot`) class — the attribute selects the hue, the class sets the strength, and
 * the two together are the ONLY sanctioned way to render a category color.
 */
export function categoryAttr(id: string | null | undefined): string {
  return String(categoryIndex(id));
}
