import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAutoDunning } from '@/lib/dunning/auto-dun'

/**
 * DUNNING-AUTO — invocable trigger for the auto WhatsApp dunning run.
 *
 * Idempotent (dedup lives in the reader + the outbound dedup_key), so it is safe
 * to call repeatedly. Two auth paths:
 *   A. A future SCHEDULER with the shared secret (Bearer CRON_SECRET) + a gymId
 *      body. INERT until the auditor sets CRON_SECRET — no scheduler is wired here.
 *   B. STAFF session, OWN gym only — the manual "run now" + the e2e guard.
 *
 * The per-gym opt-in (auto_dunning_enabled, DEFAULT OFF) is enforced INSIDE
 * due_dunning_reminders, so an opted-out gym sends nothing regardless of caller.
 */
export async function POST(req: Request) {
  // ── Path A: scheduler with the shared secret (inert until CRON_SECRET is set) ──
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    let gymId: string | undefined
    try { gymId = (await req.json())?.gymId } catch { /* no body */ }
    if (!gymId) return NextResponse.json({ ok: false, error: 'gymId required' }, { status: 400 })
    const r = await runAutoDunning(gymId)
    return NextResponse.json({ ok: true, gymId, ...r })
  }

  // ── Path B: staff session, own gym ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  const { data: role } = await supabase
    .from('user_roles')
    .select('gym_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'head_coach', 'receptionist'])
    .limit(1)
    .maybeSingle()
  if (!role?.gym_id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const result = await runAutoDunning(role.gym_id as string)
  return NextResponse.json({ ok: true, gymId: role.gym_id, ...result })
}
