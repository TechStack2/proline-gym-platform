import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { categoryForType, categoryEnabled } from './category'
import { buildPushPayload } from './payload'
import { sendOne, transportAvailable, type PushSubscriptionRow } from './send'
import { isPushTestSink, hasVapidKeys } from './vapid'

/**
 * PUSH-1 — the SINGLE mirror: drain not-yet-pushed `notifications` rows to their
 * recipients' web-push subscriptions. Because it reads the notifications TABLE
 * (the one source of truth), it covers BOTH producer paths — the app
 * `createNotification` helper AND the SQL-definer RPC inserts (billing, class,
 * lifecycle tick, member-requests) — without a parallel event system.
 *
 * Delivery is EXACTLY ONCE via the `push_sent_at` stamp (idempotent: whichever
 * mirror — the synchronous createNotification hook or the cron drain — fires
 * first wins; the other finds nothing pending). Failure-tolerant: a dead endpoint
 * or a push-service error never throws; 404/410 prunes the subscription.
 *
 * NOTE on "class starting soon": no frequent scheduler exists (the lifecycle tick
 * is manual and the only cron is daily), so the SCHEDULE category currently
 * carries the tick-emitted time reminders (renewal/expiry/lapse). A minute-grain
 * "class starting soon" push needs a frequent scheduler — deferred, not built.
 */

export type PushDispatchSummary = {
  transport: 'webpush' | 'sink' | 'none'
  considered: number
  dispatched: { userId: string; endpoint: string; category: string }[]
  pruned: string[]
  stamped: number
}

type PendingRow = { id: string; user_id: string; type: string | null; action_url: string | null }

export async function dispatchPendingPush(opts?: {
  recipientId?: string
  /** scope the drain to these recipients (immediacy hooks pass the actual targets,
   *  so a producer in gym A never stamps an unrelated recipient's pending row). */
  recipientIds?: string[]
  limit?: number
  windowMinutes?: number
  client?: SupabaseClient
  /** test hook: force the no-transport path (proves the no-keys no-op). */
  forceNone?: boolean
}): Promise<PushDispatchSummary> {
  const transport: PushDispatchSummary['transport'] = opts?.forceNone
    ? 'none'
    : isPushTestSink()
      ? 'sink'
      : hasVapidKeys()
        ? 'webpush'
        : 'none'
  const empty: PushDispatchSummary = { transport, considered: 0, dispatched: [], pruned: [], stamped: 0 }

  // No keys, no sink → inert (do NOT stamp, so pending rows deliver once keys land).
  if (opts?.forceNone || !transportAvailable()) return empty

  const admin = opts?.client ?? createAdminClient()
  const limit = opts?.limit ?? 200
  const windowMinutes = opts?.windowMinutes ?? 60
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()

  let q = admin
    .from('notifications')
    .select('id, user_id, type, action_url')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (opts?.recipientId) q = q.eq('user_id', opts.recipientId)
  if (opts?.recipientIds && opts.recipientIds.length > 0) q = q.in('user_id', opts.recipientIds)
  const { data: pending } = await q
  const rows = (pending ?? []) as PendingRow[]
  if (rows.length === 0) return empty

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const [{ data: profiles }, { data: subs }] = await Promise.all([
    admin.from('profiles').select('id, locale, push_operational, push_schedule, push_informational').in('id', userIds),
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ])
  const profById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const subsByUser = new Map<string, PushSubscriptionRow[]>()
  for (const s of (subs ?? []) as any[]) {
    const arr = subsByUser.get(s.user_id) ?? []
    arr.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })
    subsByUser.set(s.user_id, arr)
  }

  const dispatched: PushDispatchSummary['dispatched'] = []
  const pruneEndpoints = new Set<string>()

  for (const n of rows) {
    const category = categoryForType(n.type)
    const prof = profById.get(n.user_id)
    const userSubs = subsByUser.get(n.user_id) ?? []
    if (userSubs.length === 0 || !categoryEnabled(category, prof)) continue
    const payload = buildPushPayload(n, prof?.locale)
    for (const sub of userSubs) {
      const outcome = await sendOne(sub, payload)
      if (outcome.ok) dispatched.push({ userId: n.user_id, endpoint: sub.endpoint, category })
      if (outcome.prune) pruneEndpoints.add(sub.endpoint)
    }
  }

  // Prune gone endpoints (410/404) — best effort.
  if (pruneEndpoints.size > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', [...pruneEndpoints])
  }
  // Stamp EVERY considered row (sent, skipped-by-pref, or no-subs) so it is never
  // re-attempted — push is real-time, not a retry queue.
  const ids = rows.map((r) => r.id)
  await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).in('id', ids)

  return { transport, considered: rows.length, dispatched, pruned: [...pruneEndpoints], stamped: ids.length }
}
