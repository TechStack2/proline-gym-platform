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
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function signInWithPhone(
  phoneRaw: string,
  password: string,
): Promise<{ ok: boolean }> {
  const phone = (phoneRaw || '').replace(/[\s-]/g, '').trim()
  if (!phone || !password) return { ok: false }

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
  return { ok: !error }
}
