/**
 * PUSH-1 — VAPID configuration (server) + degradation guard.
 *
 * Mirrors the codebase's no-op-when-absent pattern (Sentry DSN / CRON_SECRET):
 * with no keys configured the whole push feature is inert and byte-identical —
 * the sender skips, the subscribe UI hides. The PUBLIC key is exposed to the
 * browser via NEXT_PUBLIC_ (it is public by design); the PRIVATE key is
 * server-only (Railway). The auditor generates them once:
 *
 *   npx web-push generate-vapid-keys
 *     → NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>   (Vercel/Railway build env)
 *     → VAPID_PRIVATE_KEY=<privateKey>             (Railway server env ONLY)
 *     → VAPID_SUBJECT=mailto:ops@praxella.com      (contact per the web-push spec)
 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@praxella.com'

/** Server has a full VAPID keypair → real web-push can be sent. */
export function hasVapidKeys(): boolean {
  return !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY
}

/** e2e/dev: a stub transport that records targets instead of delivering, so the
 *  sender's TARGETING can be proven without real keys or a real push service. */
export function isPushTestSink(): boolean {
  return process.env.PUSH_TEST_SINK === '1'
}
