import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * ON-1 service-role client — SERVER ONLY.
 *
 * The `import 'server-only'` above makes the build FAIL if this module is ever
 * pulled into a client component, so the SUPABASE_SERVICE_ROLE_KEY can never
 * ship to the browser. Used solely by the invite/onboarding server actions to
 * call the GoTrue admin API (create the auth user with the member's existing
 * profile id — Option B, spike §6) AFTER the caller's staff+gym gate has passed.
 *
 * No session persistence: this client carries no user; every privileged call is
 * explicit and short-lived.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or URL) is not configured on the server')
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
