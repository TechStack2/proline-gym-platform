/**
 * G1 wa.me bridge — the day-1 path (no Meta approval, no backend). Builds a
 * `https://wa.me/<e164digits>?text=<encoded>` deep-link that opens the STAFF
 * member's own WhatsApp with a prefilled localized message. Client-safe (pure).
 *
 * The same localized message templates are reused by the Cloud-API dispatch
 * (G1-full) once a gym activates — so activation is zero rework.
 */

// MJ-2: the normalizer now lives in the shared lib/utils/phone module (one source
// of truth for sign-in resolution + every capture point). Re-exported here under
// its original name so the wa.me dispatch path is unchanged.
import { phoneDigits } from '@/lib/utils/phone'

/** Normalize a stored phone to e.164 digits (no '+'). Defaults to Lebanon (961). */
export const toE164Digits = phoneDigits

/** wa.me deep-link to `phone` with a prefilled message. '' if no phone. */
export function waLink(phone: string | null | undefined, message: string, countryCode = '961'): string {
  const digits = toE164Digits(phone, countryCode)
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
