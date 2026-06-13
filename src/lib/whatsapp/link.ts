/**
 * G1 wa.me bridge — the day-1 path (no Meta approval, no backend). Builds a
 * `https://wa.me/<e164digits>?text=<encoded>` deep-link that opens the STAFF
 * member's own WhatsApp with a prefilled localized message. Client-safe (pure).
 *
 * The same localized message templates are reused by the Cloud-API dispatch
 * (G1-full) once a gym activates — so activation is zero rework.
 */

/** Normalize a stored phone to e.164 digits (no '+'). Defaults to Lebanon (961). */
export function toE164Digits(phone: string | null | undefined, countryCode = '961'): string {
  const d = (phone ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith(countryCode)) return d
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return countryCode + d.slice(1)
  // A bare local number (≤8 digits for LB) gets the country code; longer values
  // are assumed already international.
  return d.length <= 8 ? countryCode + d : d
}

/** wa.me deep-link to `phone` with a prefilled message. '' if no phone. */
export function waLink(phone: string | null | undefined, message: string, countryCode = '961'): string {
  const digits = toE164Digits(phone, countryCode)
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
