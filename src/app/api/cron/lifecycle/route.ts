import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * LIFECYCLE-CRON — the SCHEDULED daily lifecycle sweep.
 *
 * run_lifecycle_tick issues due renewal invoices, sends renewal reminders, lapses
 * unpaid memberships, suspends unpaid class seats (promoting the waitlist), and
 * auto-unfreezes memberships whose pause has ended. Until now its ONLY trigger was
 * the staff "Process renewals now" button — if nobody clicked, renewals never
 * issued and lapsed members never lapsed. This route is the missing scheduler,
 * cron-triggered on the SAME pattern as /api/cron/push + /api/cron/dunning.
 *
 * INERT BY DEFAULT — the safe default state:
 *   · CRON_SECRET UNSET in env → 204 no-op. The route can NEVER fire accidentally.
 *   · CRON_SECRET SET, bad/no Authorization → 401.
 *   · CRON_SECRET SET + `Authorization: Bearer <CRON_SECRET>` → run the sweep.
 *
 * Iterates ACTIVE gyms and runs run_lifecycle_tick(gym_id) per gym via the service
 * client (000096 grants it EXECUTE to service_role; the tick is SECURITY DEFINER
 * and gym-scoped by the argument). The tick is idempotent — dedup keys on the
 * outbound notifications + WHERE-due guards mean a re-run within the same day
 * issues nothing new, so an accidental double-fire is harmless.
 *
 * RESILIENCE: one gym's tick failing must NOT abort the rest. Each gym runs in its
 * own try/catch; a failure is named in `failures[]` and the sweep carries on.
 *
 * An optional `{ gymId }` body scopes the sweep to ONE active gym (ops / e2e
 * isolation); with no body it sweeps every active gym (the prod scheduler shape).
 */

type TickResult = { unfrozen: number; issued: number; reminded: number; lapsed: number; suspended: number }
const ZERO: TickResult = { unfrozen: 0, issued: 0, reminded: 0, lapsed: 0, suspended: 0 }

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

  const totals: TickResult = { ...ZERO }
  const results: Array<{ gymId: string } & TickResult> = []
  const failures: Array<{ gymId: string; error: string }> = []
  for (const g of gyms ?? []) {
    const id = g.id as string
    // Per-gym isolation: one gym's failure must never abort the sweep for the rest.
    const { data, error } = await admin.rpc('run_lifecycle_tick', { p_gym_id: id })
    if (error) { failures.push({ gymId: id, error: error.message }); continue }
    const r: TickResult = { ...ZERO, ...((data as Partial<TickResult>) ?? {}) }
    totals.unfrozen += r.unfrozen; totals.issued += r.issued; totals.reminded += r.reminded
    totals.lapsed += r.lapsed; totals.suspended += r.suspended
    results.push({ gymId: id, ...r })
  }
  return NextResponse.json({ ok: true, gyms: (gyms ?? []).length, failures, ...totals, results })
}
