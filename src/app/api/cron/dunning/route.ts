import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutoDunning, type AutoDunResult } from '@/lib/dunning/auto-dun'

export const dynamic = 'force-dynamic'

/**
 * SCHEDULER-WIRE — the SCHEDULED dunning sweep (overdue/upcoming renewal reminders).
 * Cron-triggered (GitHub Actions; see .github/workflows/dunning-cron.yml + the docs).
 *
 * INERT BY DEFAULT — the safe default state:
 *   · CRON_SECRET UNSET in env  → 204 no-op. The route can NEVER fire accidentally.
 *   · CRON_SECRET SET, bad/no Authorization → 401.
 *   · CRON_SECRET SET, `Authorization: Bearer <CRON_SECRET>` → run the sweep.
 *
 * Behavior: iterate ACTIVE gyms and, per gym, run the existing dunning-auto
 * dispatch (runAutoDunning). That path is:
 *   · WL-aware — each reminder is signed with THAT gym's localized name
 *     (dunningReminderBody / WL-IDENTITY), never a hardcoded "PRO LINE".
 *   · Opt-in — due_dunning_reminders returns zero rows for a gym whose
 *     auto_dunning_enabled is false (DEFAULT OFF), so an un-opted gym is skipped
 *     server-side regardless of the sweep.
 *   · Idempotent — the outbound dedup_key ('dun_<invoice>_<nudge>') makes a given
 *     reminder send at most once; a re-run finds nothing new (no double-send).
 *
 * An optional `{ gymId }` body scopes the sweep to ONE active gym (ops / e2e
 * isolation); with no body it sweeps every active gym (the prod scheduler shape).
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  // Default-inert: with no secret configured the scheduler can never fire.
  if (!cronSecret) return new NextResponse(null, { status: 204 })
  if ((req.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  // Optional single-gym scope (ops/e2e); absent → the full active-gym sweep.
  let gymIdFilter: string | undefined
  try { gymIdFilter = (await req.json())?.gymId } catch { /* no body → full sweep */ }

  const admin = createAdminClient()
  let query = admin.from('gyms').select('id').eq('is_active', true)
  if (gymIdFilter) query = query.eq('id', gymIdFilter)
  const { data: gyms } = await query

  const totals: AutoDunResult = { considered: 0, sent: 0, deduped: 0, failed: 0 }
  const results: Array<{ gymId: string } & AutoDunResult> = []
  for (const g of gyms ?? []) {
    const r = await runAutoDunning(g.id as string)
    totals.considered += r.considered
    totals.sent += r.sent
    totals.deduped += r.deduped
    totals.failed += r.failed
    results.push({ gymId: g.id as string, ...r })
  }
  return NextResponse.json({ ok: true, gyms: results.length, ...totals, results })
}
