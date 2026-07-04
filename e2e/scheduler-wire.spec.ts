import { test, expect } from '@playwright/test'

/**
 * SCHEDULER-WIRE — the scheduled dunning trigger (POST /api/cron/dunning).
 *
 *   · no CRON_SECRET header → 401 (the route is secret-gated; when CRON_SECRET is
 *     UNSET in the app env the same route is instead an inert 204 — the prod
 *     default, so it can never fire accidentally).
 *   · with the test secret + a seeded OVERDUE invoice → dispatches ONE reminder,
 *     signed with THAT gym's name (WL-aware), and a re-run sends nothing (dedup).
 *
 * Scoped to its OWN seeded gym ({ gymId }) so it never sweeps the shared dunning
 * gyms — the full active-gym sweep is the prod shape (no body). State is reset at
 * the start of each test (the f3/g1 lesson: the send is once-only, so a
 * non-idempotent retry would otherwise doom the suite).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.CRON_SECRET
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `sched-${BASE}`
const GYM_NAME = 'Cron Fist Gym' // distinctive, non-Proline → proves per-gym WL body

let gymId = ''

const H = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' })

async function seedDunning(): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_dunning`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ p_slug: SLUG, p_opt_in: true }),
  })
  if (!res.ok) throw new Error(`seed_e2e_dunning failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string
}

async function renameGym(id: string, name: string) {
  const res = await fetch(`${URL}/rest/v1/gyms?id=eq.${id}`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({ name_ar: name, name_en: name, name_fr: name }),
  })
  if (!res.ok) throw new Error(`rename gym failed: ${res.status} ${await res.text()}`)
}

async function resetDun(id: string) {
  const res = await fetch(`${URL}/rest/v1/outbound_messages?gym_id=eq.${id}&dedup_key=like.dun_*`, {
    method: 'DELETE', headers: H(),
  })
  if (!res.ok) throw new Error(`resetDun failed: ${res.status} ${await res.text()}`)
}

async function dunRows(id: string): Promise<Array<{ body: string; dedup_key: string; status: string }>> {
  const res = await fetch(`${URL}/rest/v1/outbound_messages?gym_id=eq.${id}&dedup_key=like.dun_*&select=body,dedup_key,status`, { headers: H() })
  if (!res.ok) throw new Error(`dunRows failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as any[]
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('SCHEDULER-WIRE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  if (!SECRET) throw new Error('SCHEDULER-WIRE needs CRON_SECRET set in the webServer env (see e2e.yml / e2e-local.sh)')
  gymId = await seedDunning()
  await renameGym(gymId, GYM_NAME)
})

test.beforeEach(async () => {
  // The reminder is sent once-only (dedup_key). Clear it so each test — and every
  // retry — starts from a clean, dispatchable state.
  await resetDun(gymId)
})

test('SCHEDULER-WIRE · POST without the secret is rejected (401) — the route is secret-gated', async ({ request }) => {
  const res = await request.post('/api/cron/dunning', { data: { gymId } })
  // CRON_SECRET is configured in the CI env → unauthorized = 401. (With CRON_SECRET
  // UNSET the route is an inert 204 instead — the prod default; it can never fire.)
  expect(res.status(), 'no Authorization header → 401').toBe(401)
  // And nothing was dispatched.
  expect((await dunRows(gymId)).length, 'an unauthorized call sends nothing').toBe(0)
})

test('SCHEDULER-WIRE · POST with a WRONG secret is rejected (401)', async ({ request }) => {
  const res = await request.post('/api/cron/dunning', {
    headers: { Authorization: 'Bearer not-the-secret' }, data: { gymId },
  })
  expect(res.status()).toBe(401)
  expect((await dunRows(gymId)).length, 'a wrong-secret call sends nothing').toBe(0)
})

test('SCHEDULER-WIRE · authorized sweep dispatches the overdue reminder (WL body) + is idempotent', async ({ request }) => {
  // First authorized run: the seeded overdue invoice produces exactly one reminder.
  const res = await request.post('/api/cron/dunning', {
    headers: { Authorization: `Bearer ${SECRET}` }, data: { gymId },
  })
  expect(res.status(), 'authorized → 200').toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.sent, 'one reminder dispatched for the seeded overdue invoice').toBeGreaterThanOrEqual(1)
  expect(body.gyms, 'the sweep was scoped to the one seeded gym').toBe(1)

  const rows = await dunRows(gymId)
  expect(rows.length, 'exactly one dunning reminder recorded').toBe(1)
  expect(rows[0].dedup_key, 'the reminder carries its dedup key').toMatch(/^dun_/)
  // WL-aware: the reminder body is signed with THIS gym's name, not "PRO LINE".
  expect(rows[0].body, 'the reminder carries the gym own name').toContain(GYM_NAME)
  expect(rows[0].body, 'no hardcoded brand leaked').not.toContain('PRO LINE')

  // Second run (same day): the dedup_key excludes it → no double-send.
  const res2 = await request.post('/api/cron/dunning', {
    headers: { Authorization: `Bearer ${SECRET}` }, data: { gymId },
  })
  expect(res2.status()).toBe(200)
  const body2 = await res2.json()
  expect(body2.sent, 'the second run sends nothing new (dedup)').toBe(0)
  expect((await dunRows(gymId)).length, 'still exactly one reminder (no duplicate)').toBe(1)
})
