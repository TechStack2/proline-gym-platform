/**
 * DS2-FMT §2.7 — phone display.
 *
 * `formatPhoneDisplay` (src/lib/utils/phone.ts) has existed since MJ-2 and was
 * called from exactly zero places — every phone in the UI rendered the raw stored
 * E.164 digits. DA-7 measured the consequence: "96170000012+" on the coach and
 * staff profiles, the plus sign flipped to the wrong end by the Arabic paragraph
 * direction.
 *
 * `fmtPhone` is the ONE display path: grouped (`+961 70 123 456`) and always
 * rendered inside `<Ltr>` so the leading `+` stays leading in both directions.
 * `tel:` hrefs keep using the canonical unformatted value.
 */
import { formatPhoneDisplay } from '@/lib/utils/phone';

/** Grouped display form. Empty in → `empty` (default "—") out. Never throws. */
export function fmtPhone(
  phone: string | null | undefined,
  empty = '—',
  countryCode = '961',
): string {
  return formatPhoneDisplay(phone, countryCode) || empty;
}
