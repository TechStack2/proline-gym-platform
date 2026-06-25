/**
 * CSP-safe progress-bar width (CSP-SWEEP).
 *
 * The prod CSP is `style-src 'self' 'strict-dynamic' 'nonce-…'` with NO
 * 'unsafe-inline' — and nonces/strict-dynamic do not cover inline `style=""`
 * attributes — so a runtime `style={{ width: `${pct}%` }}` is STRIPPED in prod
 * and the bar collapses to 0 width (server-rendered bars never recover; see
 * [[prod-csp-strips-inline-style-attrs]]). A runtime % has no static Tailwind
 * class, so we snap to 5% buckets and pick from this build-time-known set —
 * the literals are scanned by Tailwind's JIT (content includes src/**), so the
 * classes exist in the stylesheet (CSP-safe) instead of an inline attribute.
 */
const PCT_W = [
  'w-[0%]', 'w-[5%]', 'w-[10%]', 'w-[15%]', 'w-[20%]', 'w-[25%]', 'w-[30%]',
  'w-[35%]', 'w-[40%]', 'w-[45%]', 'w-[50%]', 'w-[55%]', 'w-[60%]', 'w-[65%]',
  'w-[70%]', 'w-[75%]', 'w-[80%]', 'w-[85%]', 'w-[90%]', 'w-[95%]', 'w-[100%]',
] as const

/** Tailwind width class nearest to `pct` (0–100), snapped to 5% buckets. */
export function pctWidthClass(pct: number): string {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))
  return PCT_W[Math.round(clamped / 5)]
}
