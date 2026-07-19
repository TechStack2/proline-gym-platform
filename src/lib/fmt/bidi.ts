/**
 * DS2-FMT §2.7 — Unicode bidi isolation.
 *
 * Mixed-direction values (dates, times, phones, money, codes, Latin names) must
 * never reorder against the Arabic text around them (DA-7: "72026/8/6 → /2026/7",
 * "21:30 - 20:00", "96170000012+", "$160.95" vs "80.00$").
 *
 * TWO sanctioned mechanisms, and the choice is not stylistic:
 *
 *  1. **Element isolation** — `<Ltr>` / `<Bdi>` (src/components/ui/bdi.tsx), i.e.
 *     `unicode-bidi: isolate` + an explicit `dir`. This is the DEFAULT for a value
 *     rendered as its own node. It is *exactly* equivalent to LRI…PDI at the
 *     rendering layer, but it leaves `textContent` untouched — so the e2e suite
 *     (which reads and exact-matches testid text) keeps passing byte-for-byte.
 *
 *  2. **Character isolation** — the helpers below. Used ONLY where a formatted
 *     value is concatenated into a larger STRING with no element boundary to hang
 *     CSS on: an ICU message argument, an `aria-label`, a `title`, or a composite
 *     the caller builds as one string. Composite formatters that join two values
 *     (`fmtTimeRange`, `fmtDateRange`) isolate their PARTS so the pair can never
 *     invert — the caller then isolates the whole with `<Ltr>`.
 *
 * FSI (first-strong) auto-detects; LRI forces LTR. Latin-digit dates, times,
 * money and phones have no strong character at all, so they need LRI — FSI would
 * fall back to the paragraph direction and mangle them in Arabic.
 */

/** U+2066 LEFT-TO-RIGHT ISOLATE — forces LTR for the isolated run. */
export const LRI = '⁦';
/** U+2067 RIGHT-TO-LEFT ISOLATE. */
export const RLI = '⁧';
/** U+2068 FIRST STRONG ISOLATE — direction from the first strong character. */
export const FSI = '⁨';
/** U+2069 POP DIRECTIONAL ISOLATE — closes any of the three above. */
export const PDI = '⁩';

/** Isolate a run, taking its direction from its first strong character. */
export function isolate(value: string | null | undefined): string {
  return value ? FSI + value + PDI : '';
}

/**
 * Isolate a run and force it LTR. The right tool for numbers, dates, times,
 * money and phones — they contain no strong character, so `isolate()` would
 * leave them at the mercy of the surrounding paragraph direction.
 */
export function ltrIsolate(value: string | null | undefined): string {
  return value ? LRI + value + PDI : '';
}

/**
 * Drop every isolate control character. For tests and for any consumer that
 * needs the bare value (comparisons, CSV/exports, `tel:` hrefs).
 */
export function stripIsolates(value: string | null | undefined): string {
  return (value ?? '').replace(/[⁦-⁩]/g, '');
}
