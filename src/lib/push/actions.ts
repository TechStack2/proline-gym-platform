'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PUSH-1 — persist / remove this device's push subscription.
 *
 * Save uses the ADMIN client to UPSERT on the globally-unique `endpoint`: a shared
 * browser has ONE endpoint, so re-subscribing (or a different user logging in on
 * the same device) must REASSIGN the row to the current auth user — an RLS
 * self-only UPDATE can't cross that boundary. The auth session is verified first,
 * so the reassignment is legitimate. Delete is scoped to the caller's own rows.
 */
export async function savePushSubscription(input: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!input.endpoint || !input.p256dh || !input.auth) return { ok: false, error: 'invalid-subscription' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, user_agent: input.userAgent ?? null },
      { onConflict: 'endpoint' },
    )
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: true }
  // Self-scoped delete (RLS also enforces user_id = auth.uid()).
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
  return { ok: true }
}

/** Read the caller's per-category push preferences (default ON). */
export async function getPushPrefs(): Promise<{ operational: boolean; schedule: boolean; informational: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { operational: true, schedule: true, informational: true }
  const { data } = await supabase
    .from('profiles')
    .select('push_operational, push_schedule, push_informational')
    .eq('id', user.id)
    .maybeSingle()
  return {
    operational: (data as any)?.push_operational !== false,
    schedule: (data as any)?.push_schedule !== false,
    informational: (data as any)?.push_informational !== false,
  }
}

/** Update one per-category push preference on the caller's profile. */
export async function setPushPref(
  category: 'operational' | 'schedule' | 'informational',
  enabled: boolean,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const col = category === 'operational' ? 'push_operational' : category === 'schedule' ? 'push_schedule' : 'push_informational'
  const { error } = await supabase.from('profiles').update({ [col]: enabled }).eq('id', user.id)
  return { ok: !error }
}
