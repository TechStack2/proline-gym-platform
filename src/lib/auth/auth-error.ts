/**
 * AUTH-ERRORS — one classifier for every credential door.
 *
 * FIELD LESSON (owner, 2026-07-20): a wrong password showed "An error occurred
 * during login" — indistinguishable from a system failure. It sent a production
 * diagnosis down the wrong path for hours, because the one message covered both
 * "you typed the wrong password" and "the platform is broken".
 *
 * The anti-enumeration rule (J6) still binds and is NOT weakened here: a wrong
 * password and a non-existent account must stay indistinguishable. They are —
 * GoTrue answers `invalid_credentials` for BOTH, so both land in the SAME
 * `credentials` bucket by construction, not by a caller remembering to collapse
 * them. What the rule never required is hiding "your credentials were rejected"
 * from "our server failed"; those are different facts about DIFFERENT parties,
 * and "Invalid email or password" is the industry-standard phrasing precisely
 * because it leaks nothing about which of the two failed.
 *
 * Deliberately NOT a bucket here: the TRANSPORT failure (offline / timed out).
 * It is classified by isTransportError (src/lib/auth/transport.ts) at the call
 * site, because whose network broke depends on where the call was made — in the
 * browser it is the user's connection ("check your internet"), inside a server
 * action it is our own reachability of GoTrue, which is a `server` failure.
 */

/** How a sign-in attempt failed. */
export type SignInFailure = 'credentials' | 'rate_limited' | 'server'

/** How a password UPDATE failed (reset link + the forced onboarding change). */
export type PasswordUpdateFailure = 'password_policy' | 'session' | 'rate_limited' | 'server'

/**
 * The machine-readable codes that go into server logs and Sentry. Grep-able and
 * stable: an operator can search `auth.signin.server` and see only genuine
 * platform failures, with wrong passwords excluded by construction.
 *
 * They carry NO account signal — the code is identical for a wrong password and
 * for an address that has never existed — and never the submitted password.
 */
export const AUTH_LOG_CODE = {
  signin: {
    credentials: 'auth.signin.credentials',
    rate_limited: 'auth.signin.rate_limited',
    server: 'auth.signin.server',
  },
  password_update: {
    password_policy: 'auth.password_update.password_policy',
    session: 'auth.password_update.session',
    rate_limited: 'auth.password_update.rate_limited',
    server: 'auth.password_update.server',
  },
} as const

type ErrorShape = { code?: unknown; status?: unknown; message?: unknown; name?: unknown }

/** Read the fields supabase-js puts on an AuthError, tolerating any thrown value. */
function parts(err: unknown): { code: string; status: number; message: string; name: string } {
  const e = (err ?? {}) as ErrorShape
  return {
    code: typeof e.code === 'string' ? e.code : '',
    status: typeof e.status === 'number' ? e.status : 0,
    message: typeof e.message === 'string' ? e.message : '',
    name: typeof e.name === 'string' ? e.name : '',
  }
}

/** GoTrue's rate-limit family: `over_request_rate_limit`, `over_email_send_rate_limit`, … */
function isRateLimited(code: string, status: number, message: string): boolean {
  return status === 429 || code.startsWith('over_') || /rate limit/i.test(message)
}

/**
 * Classify a failed `signInWithPassword`.
 *
 * `credentials` covers wrong-password AND no-such-account — see the module note:
 * GoTrue returns one indistinguishable answer for both, and this function
 * preserves that rather than re-deriving it.
 *
 * Everything unrecognised is `server`, on purpose: the field failure was a
 * system error WEARING a credentials message, so an unknown error must never
 * tell a user their password is wrong.
 */
export function classifySignInFailure(err: unknown): SignInFailure {
  const { code, status, message } = parts(err)
  if (isRateLimited(code, status, message)) return 'rate_limited'
  // `code` on modern GoTrue; the message match keeps older deployments correct.
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'credentials'
  // NOTE `email_not_confirmed` intentionally falls through to `server`: this
  // platform only ever mints confirmed accounts (invite.ts / the admin API), so
  // seeing it means something upstream is wrong — not that the user mistyped.
  return 'server'
}

/**
 * Classify a failed `updateUser({ password })` — the reset-link surface and the
 * forced onboarding change.
 *
 * `password_policy` is the user-actionable bucket (too weak, or identical to the
 * current password). It exists for the same reason as `credentials`: both of
 * those used to render "the link may have expired" / a generic error, which sent
 * users to request reset links forever for a password they could simply change.
 */
export function classifyPasswordUpdateFailure(err: unknown): PasswordUpdateFailure {
  const { code, status, message, name } = parts(err)
  if (isRateLimited(code, status, message)) return 'rate_limited'
  if (
    code === 'same_password' ||
    code === 'weak_password' ||
    name === 'AuthWeakPasswordError' ||
    /should be different from the old password/i.test(message)
  ) {
    return 'password_policy'
  }
  if (
    status === 401 ||
    status === 403 ||
    code === 'session_not_found' ||
    code === 'bad_jwt' ||
    code === 'invalid_jwt' ||
    name === 'AuthSessionMissingError' ||
    /auth session missing/i.test(message)
  ) {
    return 'session'
  }
  return 'server'
}
