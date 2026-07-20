/**
 * DS2-FMT §2.7 — money display.
 *
 * The dual-currency CONTRACTS are unchanged: `orderedMoney` (invoice/receipt) and
 * `dualMoney` (aggregations) in src/lib/billing/currency.ts stay the single source
 * of what is shown and in which order. This module adds the two things §2.7 asks
 * for on top:
 *
 *  · **Fixed symbol sides in BOTH directions** — `$` leads, `LBP` trails, always.
 *    DA-7 measured "$160.95" and "80.00$" on the same Arabic page; the side is a
 *    property of the currency, not of the paragraph direction. Enforced by
 *    isolating each amount LTR rather than by re-writing the strings.
 *  · **Bidi isolation** — see ./bidi. A single amount rendered as its own node is
 *    isolated with `<Ltr>`; a composite the caller joins into one string uses
 *    `fmtMoneyPair`, which isolates each part so "$50.00 · 4,450,000 LBP" cannot
 *    invert around the separator.
 *
 * Nothing here converts, rounds or signs — amounts are shown as recorded.
 */
import {
  dualMoney,
  orderedMoney,
  type CurrencyPref,
} from '@/lib/billing/currency';
import { ltrIsolate } from './bidi';

export type { CurrencyPref };

/** `ordered` = invoice/receipt semantics; `dual` = aggregation semantics. */
export type MoneyMode = 'ordered' | 'dual';

export type MoneyParts = { primary: string; secondary: string | null };

/**
 * The ordered pair, unchanged in content — call this instead of reaching for
 * `orderedMoney`/`dualMoney` directly so money display has one entry point.
 * Render each part inside `<Ltr>`.
 */
export function fmtMoney(
  usd: number | null | undefined,
  lbp: number | null | undefined,
  pref: CurrencyPref,
  mode: MoneyMode = 'dual',
): MoneyParts {
  return mode === 'ordered' ? orderedMoney(usd, lbp, pref) : dualMoney(usd, lbp, pref);
}

/**
 * Both amounts as ONE string, each part LTR-isolated: "$50.00 · 4,450,000 LBP".
 * For string contexts only (an ICU argument, a `title`, an `aria-label`). In JSX
 * prefer two `<Ltr>` nodes — that isolates identically without touching
 * `textContent`.
 */
export function fmtMoneyPair(
  usd: number | null | undefined,
  lbp: number | null | undefined,
  pref: CurrencyPref,
  mode: MoneyMode = 'dual',
  separator = ' · ',
): string {
  const { primary, secondary } = fmtMoney(usd, lbp, pref, mode);
  return secondary
    ? `${ltrIsolate(primary)}${separator}${ltrIsolate(secondary)}`
    : ltrIsolate(primary);
}
