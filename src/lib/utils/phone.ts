/**
 * MJ-2 SIGN-IN-SANE — the ONE shared phone helper (client-safe, pure).
 *
 * A Lebanese phone arrives in many shapes — local `03 123 456`, international
 * `+961 3 123456`, `009613123456`, or a bare `70123456` — that all mean the same
 * subscriber. Every WRITE point normalizes to a single canonical E.164 string so
 * that later resolution (phone → credentialed profile at sign-in) is an exact
 * compare instead of a fragile fuzzy match. Existing rows are NOT migrated; we
 * normalize on compare (see phoneMatchVariants) so legacy shapes still resolve.
 *
 * Canonical form: `+<countrycode><nationalSignificantNumber>` e.g. `+96170123456`.
 * (Lane A MJ-1 shares this module — do not fork a second normalizer.)
 */

/**
 * E.164 DIGITS ONLY (no `+`) — the wa.me target. Lebanese-first (country 961):
 * strips the trunk `0`, unwraps `00`/`+`, and prefixes a bare local number.
 * Longer bare values are assumed already-international and left as-is.
 */
export function phoneDigits(phone: string | null | undefined, countryCode = '961'): string {
  const d = (phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith(countryCode)) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return countryCode + d.slice(1);
  // A bare local number (≤8 digits for LB) gets the country code; longer values
  // are assumed already international.
  return d.length <= 8 ? countryCode + d : d;
}

/**
 * Canonical STORED/COMPARED form: `+` + {@link phoneDigits}. Empty in → empty out
 * (so callers can store `null` for a blank field). Idempotent: normalizing an
 * already-canonical value returns it unchanged.
 */
export function normalizePhone(phone: string | null | undefined, countryCode = '961'): string {
  const d = phoneDigits(phone, countryCode);
  return d ? `+${d}` : '';
}

/**
 * The equivalent RAW shapes a legacy (un-normalized) row might already hold for
 * the same subscriber — so sign-in resolution can match old data with `IN (…)`
 * WITHOUT a data migration. All are space/dash-free (forms stored `.trim()`-only
 * values, typically contiguous digits with an optional `+`/`00`/`0` prefix).
 */
export function phoneMatchVariants(phone: string | null | undefined, countryCode = '961'): string[] {
  const digits = phoneDigits(phone, countryCode);
  if (!digits) return [];
  const national = digits.startsWith(countryCode) ? digits.slice(countryCode.length) : digits;
  return Array.from(
    new Set([
      `+${digits}`,     // +96170123456  (canonical, new data)
      digits,           // 96170123456
      `00${digits}`,    // 0096170123456
      `0${national}`,   // 070123456
      national,         // 70123456
    ].filter(Boolean)),
  );
}

/**
 * Best-effort pretty display: `+961 70 123 456`. Falls back to the canonical
 * string when the national part doesn't group cleanly. Never throws.
 */
export function formatPhoneDisplay(phone: string | null | undefined, countryCode = '961'): string {
  const digits = phoneDigits(phone, countryCode);
  if (!digits) return '';
  const cc = digits.startsWith(countryCode) ? countryCode : '';
  const national = cc ? digits.slice(cc.length) : digits;
  // Group the national part in 3s from the right, keeping the leading 1–2 digit prefix.
  const head = national.length % 3 === 0 ? national.slice(0, 2) : national.slice(0, national.length % 3);
  const rest = national.slice(head.length).replace(/(\d{3})(?=\d)/g, '$1 ');
  const grouped = [head, rest].filter(Boolean).join(' ').trim();
  return cc ? `+${cc} ${grouped}` : `+${national}`;
}
