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
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimitStore, checkRateLimit, resetRateLimit, cleanupRateLimitStore, envLimit } from '@/lib/auth/rate-limit'

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
): Promise<{ ok: boolean; rateLimited?: boolean }> {
  const phone = (phoneRaw || '').replace(/[\s-]/g, '').trim()
  if (!phone || !password) return { ok: false }

  // Per-identifier limit BEFORE any GoTrue work (cheap rejection under attack).
  const limit = envLimit('AUTH_RATE_LIMIT_PER_ID', 5)
  const windowMs = envLimit('AUTH_RATE_LIMIT_WINDOW_MS', 60 * 1000)
  const idKey = `id:${clientIp()}:${phone}`
  cleanupRateLimitStore(idLimitStore)
  const gate = checkRateLimit(idLimitStore, idKey, limit, windowMs)
  if (!gate.allowed) return { ok: false, rateLimited: true }

  // Resolve phone → profile id (service role; bypasses RLS; server-only, never returned).
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles').select('id').eq('phone', phone).limit(1).maybeSingle()

  // ALWAYS attempt a sign-in — the resolved synthetic email when the phone matches,
  // else a syntactically-valid but non-existent one — so an unknown phone and a wrong
  // password are indistinguishable (same generic result, timing, and GoTrue rate limit).
  const email = prof?.id
    ? `m-${prof.id}@members.proline.lb`
    : `m-none-${phone.replace(/[^0-9]/g, '')}@members.proline.lb`

  const supabase = await createClient() // SSR client → writes the session cookies on success
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error) resetRateLimit(idLimitStore, idKey) // success ends the failed-attempt window
  return { ok: !error }
}
