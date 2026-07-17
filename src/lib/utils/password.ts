/**
 * AUTH-DEPTH (REQ4) / AUTH-EASE (R3) — the ONE set-password policy, shared by every
 * surface that lets a human choose a password (first-login onboarding + /auth/reset).
 * Before this, each surface carried its own inline length check; the threshold now
 * lives here once so surfaces can never drift. App-side enforcement of the minimum —
 * the cloud GoTrue "minimum password length" + leaked-password protection are owner-
 * dashboard settings listed in the report.
 *
 * AUTH-EASE: the floor is 8, not 10 — owner-decreed as the friendly-but-safe minimum
 * (these accounts touch money paths, so 6 is too low; 8 + leaked-password protection
 * is the balance). Every mint (see ../auth/temp-password) produces ≥8.
 */

/** The rule: a set password must be at least this many characters. */
export const PASSWORD_MIN_LENGTH = 8

/** True when `pw` satisfies the policy (currently: at least PASSWORD_MIN_LENGTH chars). */
export function isPasswordValid(pw: string): boolean {
  return pw.length >= PASSWORD_MIN_LENGTH
}

export type PasswordStrength = 'weak' | 'fair' | 'strong'

/**
 * A lightweight, dependency-free strength hint for the set-password UI (not a gate —
 * `isPasswordValid` is the gate). Below the minimum is always `weak`; at/above it,
 * length + character variety nudge toward `fair` / `strong` to encourage a real
 * passphrase without demanding a specific character-class recipe.
 */
export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < PASSWORD_MIN_LENGTH) return 'weak'
  let variety = 0
  if (/[a-z]/.test(pw)) variety++
  if (/[A-Z]/.test(pw)) variety++
  if (/[0-9]/.test(pw)) variety++
  if (/[^A-Za-z0-9]/.test(pw)) variety++
  if (pw.length >= 14 && variety >= 3) return 'strong'
  if (pw.length >= 12 || variety >= 3) return 'fair'
  return 'fair'
}
