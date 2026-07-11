/**
 * AUTH-DEPTH (REQ4) — the ONE set-password policy, shared by every surface that lets
 * a human choose a password (first-login onboarding + /auth/reset). Before this, each
 * surface carried its own inline `pw.length >= 10` check; the threshold now lives here
 * once so the two can never drift. App-side enforcement of the J6 minimum — the cloud
 * GoTrue "minimum password length" is an owner-dashboard setting listed in the report.
 */

/** The J6 rule: a set password must be at least this many characters. */
export const PASSWORD_MIN_LENGTH = 10

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
