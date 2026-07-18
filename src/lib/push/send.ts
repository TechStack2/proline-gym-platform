import webpush from 'web-push'
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, hasVapidKeys, isPushTestSink } from './vapid'
import type { PushPayload } from './payload'

/**
 * PUSH-1 — the web-push transport + failure classification.
 *
 * A push send NEVER throws to the caller: a dead endpoint or a push-service
 * hiccup must not break the action that produced the notification. Each send
 * returns a result; a 404/410 means the subscription is gone and must be pruned.
 */
export type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type SendOutcome = { endpoint: string; ok: boolean; statusCode?: number; prune: boolean }

/** A subscription is gone (must be deleted) on 404 Not Found / 410 Gone. */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

let configured = false
function configureWebPush() {
  if (configured) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
}

/**
 * Send one push. Test-sink mode records the target without touching the network
 * (proves targeting in e2e without real keys). Returns a classified outcome; on
 * any error it resolves (never rejects) with prune set for gone endpoints.
 */
export async function sendOne(sub: PushSubscriptionRow, payload: PushPayload): Promise<SendOutcome> {
  if (isPushTestSink()) {
    // e2e/dev: no real delivery — the target is asserted via the dispatch summary.
    return { endpoint: sub.endpoint, ok: true, prune: false }
  }
  try {
    configureWebPush()
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    )
    return { endpoint: sub.endpoint, ok: true, statusCode: res.statusCode, prune: false }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    return { endpoint: sub.endpoint, ok: false, statusCode, prune: isGoneStatus(statusCode) }
  }
}

/** A transport is available when real keys exist OR the test sink is on. */
export function transportAvailable(): boolean {
  return isPushTestSink() || hasVapidKeys()
}
