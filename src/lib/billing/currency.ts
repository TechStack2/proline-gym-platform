// BILL-LOCALIZE — DISPLAY-ONLY currency helpers. Storage stays dual-currency
// (amount_usd + amount_lbp, unchanged); these decide only the ORDER + EMPHASIS of what
// the gym's `currency_preference` puts first. No conversion, no rounding beyond the
// existing 2dp USD / grouped LBP formatting — stored values are shown verbatim.

export type CurrencyPref = 'USD' | 'LBP' | 'BOTH';

/** Coerce any stored/legacy value to a known preference (default USD). */
export function normalizeCurrencyPref(p: string | null | undefined): CurrencyPref {
  const u = (p ?? 'USD').toUpperCase();
  return u === 'LBP' ? 'LBP' : u === 'BOTH' ? 'BOTH' : 'USD';
}

export const fmtUsd = (n: number | null | undefined): string => `$${Number(n ?? 0).toFixed(2)}`;
export const fmtLbp = (n: number | null | undefined): string => `${Number(n ?? 0).toLocaleString()} LBP`;

/**
 * Order a stored (usd, lbp) pair by the gym's display preference:
 *  · USD  → primary USD, secondary LBP (when a LBP amount is present)
 *  · LBP  → primary LBP, secondary USD  (falls back to USD-primary when there's no LBP)
 *  · BOTH → primary USD, secondary LBP
 * `secondary` is null when there's no meaningful second line to show. The USD figure is
 * always available as a fallback so a testid'd Total never renders empty.
 */
export function orderedMoney(
  usd: number | null | undefined,
  lbp: number | null | undefined,
  pref: CurrencyPref,
): { primary: string; secondary: string | null } {
  const hasLbp = lbp != null && Number(lbp) > 0;
  if (pref === 'LBP' && hasLbp) return { primary: fmtLbp(lbp), secondary: fmtUsd(usd) };
  // USD and BOTH both lead with USD; LBP-pref without a LBP amount also falls back here.
  return { primary: fmtUsd(usd), secondary: hasLbp ? fmtLbp(lbp) : null };
}

/**
 * MONEY-LBP — the honest dual-currency display for AGGREGATIONS (drawer tallies,
 * collections by method, revenue, outstanding). Both figures are shown AS RECORDED,
 * never cross-converted; the layout follows the gym's preference:
 *   · BOTH → both lines always (dual-line): USD primary, LBP secondary — so a mixed
 *            cash drawer honestly shows what it holds in each note, even at 0.
 *   · LBP  → LBP primary (large), USD secondary (muted) — always both.
 *   · USD  → USD primary; LBP secondary only when a LBP amount was actually recorded
 *            (a pure-USD gym is not cluttered with "0 LBP").
 * Distinct from orderedMoney (invoice/receipt), where BOTH collapses to USD-primary
 * and hides a zero LBP. Refunds (negative amount_usd + amount_lbp) and discounts
 * (net recorded amounts) flow through the callers' Σ untouched — nothing here signs
 * or converts.
 */
export function dualMoney(
  usd: number | null | undefined,
  lbp: number | null | undefined,
  pref: CurrencyPref,
): { primary: string; secondary: string | null } {
  const l = Number(lbp ?? 0);
  const usdStr = fmtUsd(usd);
  const lbpStr = fmtLbp(l);
  if (pref === 'LBP') return { primary: lbpStr, secondary: usdStr };
  if (pref === 'BOTH') return { primary: usdStr, secondary: lbpStr };
  return { primary: usdStr, secondary: l !== 0 ? lbpStr : null }; // USD
}
