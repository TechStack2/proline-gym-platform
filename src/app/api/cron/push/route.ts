import { NextResponse } from 'next/server'
import { dispatchPendingPush } from '@/lib/push/dispatch'

export const dynamic = 'force-dynamic'

/**
 * PUSH-1 — the scheduled push DRAIN (the universal mirror). Sends web-push for any
 * `notifications` row not yet pushed — covering BOTH the app createNotification
 * path AND the SQL-definer RPC inserts (billing/class/lifecycle-tick) without a
 * parallel event system. Reuses the dunning-cron idiom exactly:
 *
 * INERT BY DEFAULT:
 *   · CRON_SECRET UNSET → 204 no-op (can never fire accidentally).
 *   · CRON_SECRET SET, bad/no Authorization → 401.
 *   · CRON_SECRET SET + `Authorization: Bearer <CRON_SECRET>` → run the drain.
 *
 * Optional body: `{ recipientId }` scopes the drain to one recipient (immediacy /
 * e2e isolation); `{ simulateNoKeys: true }` forces the no-transport path (e2e
 * proof of the no-keys no-op). With real VAPID keys unset AND no test sink, the
 * drain is a no-op regardless — the byte-identical degradation rule.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return new NextResponse(null, { status: 204 })
  if ((req.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { recipientId?: string; simulateNoKeys?: boolean } = {}
  try { body = (await req.json()) ?? {} } catch { /* no body → full drain */ }

  const summary = await dispatchPendingPush({
    recipientId: body.recipientId,
    forceNone: body.simulateNoKeys === true,
  })
  return NextResponse.json({ ok: true, ...summary })
}
