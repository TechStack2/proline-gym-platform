'use server'

/**
 * ON-1 onboarding completion (spike §6). The new password is set client-side
 * (the user changes their OWN password). This action clears the server-
 * controlled `app_metadata.must_change_password` flag via the admin API, marks
 * the invite accepted, and REFRESHES the session so the new JWT (without the
 * flag) is issued — otherwise the middleware would keep redirecting to
 * /onboarding until the next natural refresh.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { roleHomePath } from './role-home'

export async function completeOnboarding(): Promise<{ ok: true; home: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), must_change_password: false },
  })
  if (error) return { ok: false, error: error.message }

  // Mark the invite accepted (best-effort; the auth flag is the real gate).
  await admin.from('account_invites').update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('profile_id', user.id)

  // Re-issue the JWT so app_metadata.must_change_password=false propagates now.
  await supabase.auth.refreshSession()

  // Route to the role's home.
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  return { ok: true, home: roleHomePath(roleRow?.role) }
}
