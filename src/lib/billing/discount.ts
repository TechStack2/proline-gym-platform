/**
 * DISCOUNT — the %↔value math for a payment-time discount (field finding 16). Pure,
 * dependency-free, so the payment form and the unit tests share ONE source of truth.
 *
 * The staff enter a discount in EITHER mode against the amount due; the other value is
 * computed live. USD is authoritative (the DB reduces total_usd; LBP derives at the
 * invoice's rate, matching the existing round(usd*rate) idiom) — this module only owns
 * the USD amount and its percent, never LBP.
 *
 * Rounding: money to 2 dp, percent to 2 dp (a display nicety — the DB re-derives the
 * final numbers from the USD amount, so the percent is never authoritative).
 */
export type DiscountMode = 'pct' | 'value'

export type DiscountResult = {
  /** The discount in USD (2 dp) applied to the amount due. */
  discountUsd: number
  /** The equivalent percent of the due (2 dp), for the live cross-display. */
  pct: number
  /** The remaining amount due AFTER the discount (2 dp), never below 0. */
  dueAfter: number
  /** False when the entry is out of range (pct > 100) or exceeds the due — blocks submit. */
  valid: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Compute the discount from a raw input in the active mode against `dueUsd` (the
 * remaining balance). An empty / blank / non-numeric entry is a no-op (0 discount,
 * valid) so an untouched field never blocks the form.
 */
export function computeDiscount(mode: DiscountMode, raw: string, dueUsd: number): DiscountResult {
  const due = Math.max(0, round2(dueUsd))
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return { discountUsd: 0, pct: 0, dueAfter: due, valid: true }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return { discountUsd: 0, pct: 0, dueAfter: due, valid: false }

  let discountUsd: number
  let pct: number
  if (mode === 'pct') {
    pct = round2(n)
    discountUsd = round2((due * n) / 100)
  } else {
    discountUsd = round2(n)
    pct = due > 0 ? round2((discountUsd / due) * 100) : 0
  }

  // A discount may never exceed the amount due (→ no negative total) nor 100%.
  const tooLarge = discountUsd > due + 0.005
  const pctOutOfRange = mode === 'pct' && n > 100
  const valid = !tooLarge && !pctOutOfRange
  const dueAfter = round2(Math.max(0, due - discountUsd))
  return { discountUsd, pct, dueAfter, valid }
}
