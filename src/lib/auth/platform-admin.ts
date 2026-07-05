/**
 * VENDOR-CONSOLE — the platform-admin (vendor) home takes precedence over any
 * gym-role home. This is the server-side check used at every post-auth
 * home-resolution point (middleware landing/login/dashboard redirects + the
 * onboarding redirects). Never client-trusted — it calls the SECURITY DEFINER
 * `is_platform_admin()` gate (000082), which returns false for anon/non-admin.
 *
 * Structural client type (just `.rpc`) so both the middleware's edge
 * createServerClient and the SSR createClient satisfy it without coupling.
 */
// Supabase's `.rpc()` returns a PostgrestFilterBuilder (a thenable, not a Promise),
// so type the awaited value via PromiseLike — both the edge createServerClient and
// the SSR createClient satisfy it.
type RpcClient = { rpc: (fn: string) => PromiseLike<{ data: unknown }> }

export async function isPlatformAdmin(supabase: RpcClient): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_platform_admin')
    return data === true
  } catch {
    return false
  }
}

/** The vendor console home (no locale prefix — the caller adds it). */
export const VENDOR_HOME = '/vendor'
