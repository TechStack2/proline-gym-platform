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
