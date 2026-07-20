'use server'

/**
 * INVITE-PHONE-UX (Option B) — phone-as-username sign-in.
 *
 * Admin-invited members are credentialed with a HIDDEN synthetic email
 * (`m-<profileId>@members.proline.lb`; src/lib/provisioning/invite.ts) because the
 * Supabase phone auth provider is disabled on this project. This server action lets
 * the member sign in with their PHONE: it resolves phone → that synthetic email
 * SERVER-SIDE (service role, never exposed to the client) and completes an
 * email+password sign-in via the SSR client (which sets the session cookies).
 *
 * Security: a wrong phone and a wrong password return the SAME generic failure — the
 * action never reveals whether a phone maps to an account (no enumeration oracle) and
 * always performs a GoTrue sign-in, so unknown-phone and wrong-password share the same
 * timing AND the same GoTrue sign-in rate limit. The service-role client is server-only.
 */
import { headers } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimitStore, checkRateLimit, resetRateLimit, cleanupRateLimitStore, envLimit } from '@/lib/auth/rate-limit'
import { classifySignInFailure, AUTH_LOG_CODE, type SignInFailure } from '@/lib/auth/auth-error'
import { normalizePhone, phoneMatchVariants } from '@/lib/utils/phone'

/** What the login screen needs to say something TRUE about a failed attempt. */
export type SignInResult = { ok: boolean; reason?: SignInFailure }

/**
 * AUTH-ERRORS R2 — the diagnosable half. One line per failed attempt, carrying a
 * machine-readable code and NOTHING else that could identify anyone: never the
 * password, never the submitted email/phone, and never whether the account
 * exists (a wrong password and an unknown address produce the identical
 * `auth.signin.credentials` line — proven in auth-error.test.ts).
 *
 * Sentry is reserved for `server`. A wrong password is not an error, it is a
 * user event: capturing them would bury the one real failure under thousands of
 * typos and burn the FREE-tier quota (5k events/month — see the OBSERVE
 * posture). The console line still records every bucket, so a support question
 * ("did their attempt even reach us?") is answerable from the logs.
 */
function recordSignInFailure(reason: SignInFailure, raw?: unknown): void {
  const code = AUTH_LOG_CODE.signin[reason]
  if (reason !== 'server') {
    console.warn(`[auth] sign-in failed: ${code}`)
    return
  }
  // `server` only: the underlying GoTrue message helps diagnosis and cannot leak
  // account existence (existence-bearing failures are `credentials`, never here).
  const detail = (raw as { message?: unknown } | null)?.message
  console.error(`[auth] sign-in failed: ${code}`, typeof detail === 'string' ? detail : '')
  Sentry.captureMessage(code, {
    level: 'error',
    tags: { area: 'auth-signin', auth_code: code },
    extra: { status: (raw as { status?: unknown } | null)?.status ?? null }, // NO identifier, NO password
  })
}

// LOGIN-LIMITER — per-(IP+identifier) brute-force limit. This is where the
// submitted identifier is KNOWN (the middleware only sees pathnames), so the
// tight per-account posture lives here: AUTH_RATE_LIMIT_PER_ID attempts (default
// 5) per AUTH_RATE_LIMIT_WINDOW_MS (default 60s) per IP+phone. Keyed on the
// SUBMITTED identifier whether or not an account exists → firing leaks nothing
// about account existence. A successful login resets its identifier's window
// (legit users aren't punished for one typo). The pure-IP flood backstop
// (30/min default) stays in the middleware. In-memory, per-process — the same
// MVP constraint as the middleware store.
const idLimitStore = createRateLimitStore()

function clientIp(): string {
  const h = headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() || '127.0.0.1'
}

export async function signInWithPhone(
  phoneRaw: string,
  password: string,
): Promise<SignInResult> {
  // MJ-2: normalize the submitted phone to the ONE canonical shape (03…, +9613…,
  // 009613…, bare all collapse here) so resolution is an exact compare, and so the
  // rate-limit identifier is stable across the shapes a user might type.
  const phone = normalizePhone(phoneRaw)
  // Nothing (or nothing usable) submitted: that is a credential problem, and it
  // is the same answer for every input — no account was ever consulted.
  if (!phone || !password) return { ok: false, reason: 'credentials' }

  // Per-identifier limit BEFORE any GoTrue work (cheap rejection under attack).
  // Counts ONE attempt per signInWithPhone CALL (not per candidate below) — the
  // limiter and the multi-candidate resolution are orthogonal: limit → resolve →
  // attempt-each.
  const limit = envLimit('AUTH_RATE_LIMIT_PER_ID', 5)
  const windowMs = envLimit('AUTH_RATE_LIMIT_WINDOW_MS', 60 * 1000)
  const idKey = `id:${clientIp()}:${phone}`
  cleanupRateLimitStore(idLimitStore)
  const gate = checkRateLimit(idLimitStore, idKey, limit, windowMs)
  if (!gate.allowed) {
    recordSignInFailure('rate_limited')
    return { ok: false, reason: 'rate_limited' }
  }

  // Resolve phone → profile ids (service role; bypasses RLS; server-only, never
  // returned). A phone is non-unique BY DESIGN (families share; the ratified
  // invariant is at most ONE credentialed profile per phone per gym). Match the
  // normalized phone against its equivalent legacy shapes (no data migration) so
  // both new normalized rows and old `.trim()`-only rows resolve.
  const admin = createAdminClient()
  const { data: profs } = await admin
    .from('profiles').select('id').in('phone', phoneMatchVariants(phone))
    .order('created_at', { ascending: true }).limit(8)

  // DETERMINISTIC RESOLUTION (MJ-2 / the on1:60 flake fix): keep ONLY profiles that
  // actually hold an auth account. A login-less profile shares the family phone but
  // has no GoTrue user (profiles.id ≠ any auth.users.id), so its synthetic email
  // would just 400 and burn a GoTrue attempt. getUserById(id) is the invite flow's
  // own credentialed test (invite.ts) — the profile IS the auth user (same id).
  const credentialed: string[] = []
  for (const p of profs ?? []) {
    const { data, error } = await admin.auth.admin.getUserById(p.id)
    if (!error && data?.user) credentialed.push(`m-${p.id}@members.proline.lb`)
  }

  // Legacy cross-gym data CAN leave >1 credentialed profile on one phone. That
  // violates the ratified per-gym invariant — surface it (Sentry-tagged) for
  // clean-up, but still resolve by trying each: only the right password verifies.
  if (credentialed.length > 1) {
    Sentry.captureMessage('auth.phone.multiple_credentialed', {
      level: 'warning',
      tags: { area: 'auth-phone-resolution' },
      extra: { count: credentialed.length }, // NO phone/PII — count only
    })
  }

  // ALWAYS attempt a sign-in — the resolved synthetic email(s) when the phone maps
  // to a credentialed profile, else a syntactically-valid but non-existent one — so
  // an unknown phone and a wrong password stay indistinguishable (no enumeration
  // oracle; same generic result AND the same GoTrue rate-limit surface — J6 lesson).
  const candidates = credentialed.length > 0
    ? credentialed
    : [`m-none-${phone.replace(/[^0-9]/g, '')}@members.proline.lb`]

  const supabase = await createClient() // SSR client → writes the session cookies on success
  // Across candidates, the WORST outcome wins: if any attempt failed for a
  // non-credential reason the honest answer is `server`, because we cannot say
  // the password was wrong when a lookup broke midway.
  let reason: SignInFailure = 'credentials'
  let lastError: unknown = null
  for (const email of candidates) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      resetRateLimit(idLimitStore, idKey) // success ends the failed-attempt window
      return { ok: true }
    }
    const classified = classifySignInFailure(error)
    if (classified !== 'credentials') { reason = classified; lastError = error }
  }
  recordSignInFailure(reason, lastError)
  return { ok: false, reason }
}

/**
 * ERROR-HARDEN #3 — email sign-in as a SERVER action. The login page previously
 * called supabase.auth.signInWithPassword CLIENT-side, which (a) bypassed the
 * per-(IP+identifier) limiter entirely (the middleware only counts requests, and
 * GoTrue is reached directly) and (b) surfaced raw GoTrue error.message to users.
 * This mirrors signInWithPhone: limit → attempt → generic result; a success
 * resets the identifier's window; the raw error stays in a server-side log.
 */
export async function signInWithEmail(
  emailRaw: string,
  password: string,
): Promise<SignInResult> {
  const email = (emailRaw || '').trim().toLowerCase()
  if (!email || !password) return { ok: false, reason: 'credentials' }

  const limit = envLimit('AUTH_RATE_LIMIT_PER_ID', 5)
  const windowMs = envLimit('AUTH_RATE_LIMIT_WINDOW_MS', 60 * 1000)
  const idKey = `id:${clientIp()}:${email}`
  cleanupRateLimitStore(idLimitStore)
  const gate = checkRateLimit(idLimitStore, idKey, limit, windowMs)
  if (!gate.allowed) {
    recordSignInFailure('rate_limited')
    return { ok: false, reason: 'rate_limited' }
  }

  const supabase = await createClient() // SSR client → writes the session cookies on success
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // AUTH-ERRORS: the raw GoTrue message stays server-side; what crosses back to
    // the browser is a bucket, not a message. `credentials` here means EITHER a
    // wrong password OR no such account — GoTrue does not distinguish them and
    // neither do we.
    const reason = classifySignInFailure(error)
    recordSignInFailure(reason, error)
    return { ok: false, reason }
  }
  resetRateLimit(idLimitStore, idKey)
  return { ok: true }
}
