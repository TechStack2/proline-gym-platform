import { test, expect } from '@playwright/test'

/**
 * LIFECYCLE-CRON — the scheduled daily lifecycle sweep (POST /api/cron/lifecycle).
 *
 *   · no / wrong CRON_SECRET header → 401 (the route is secret-gated; when
 *     CRON_SECRET is UNSET in the app env the same route is instead an inert 204 —
 *     the prod default, so it can never fire accidentally).
 *   · with the test secret + a seeded membership ENDING TODAY → the sweep ISSUES
 *     its renewal invoice and reports the result PER GYM.
 *   · a second authorized run issues NOTHING new (idempotent — the tick's WHERE-due
 *     + dedup guards; a fresh open renewal invoice already exists for the period).
 *
 * Scoped to its OWN seeded gym ({ gymId }) so it never sweeps the shared gyms — the
 * full active-gym sweep (no body) is the prod shape. Fixture is built with the
 * service role (bypasses RLS); no migration — LIFECYCLE-CRON is APP+SPEC only.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.CRON_SECRET
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `lifecycle-${BASE}`

const H = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' })
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

let gymId = ''
let membershipId = ''

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H() })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svcPost(path: string, body: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...H(), Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function rpc(fn: string, args: any) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args) })
  if (!res.ok) throw new Error(`rpc ${fn} → ${res.status} ${await res.text()}`)
  return res.json()
}

/** How many membership-renewal invoices exist for the seeded membership. */
async function membershipRenewalCount(): Promise<number> {
  const rows = await svcGet(`renewal_invoices?product_type=eq.membership&product_id=eq.${membershipId}&select=invoice_id`)
  return (rows as any[]).length
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('LIFECYCLE-CRON needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  if (!SECRET) throw new Error('LIFECYCLE-CRON needs CRON_SECRET set in the webServer env (see e2e.yml / e2e-local.sh)')

  // Fresh hermetic gym (base seed → an ACTIVE gym the sweep will include).
  gymId = (await rpc('seed_e2e_gym', { p_slug: SLUG })) as string

  // A membership plan, a member, and a membership ENDING TODAY (inside the renewal
  // lead window, status active, no invoice yet) → the tick issues exactly one.
  const [plan] = await svcPost('membership_plans', {
    gym_id: gymId, name_ar: 'شهري', name_en: 'Monthly', name_fr: 'Mensuel',
    duration_days: 30, price_usd: 50, is_active: true, includes_pt: false,
  })
  const [profile] = await svcPost('profiles', {
    gym_id: gymId, first_name_ar: 'دورة', first_name_en: 'Cycle', first_name_fr: 'Cycle',
    last_name_ar: 'عضو', last_name_en: 'Member', last_name_fr: 'Membre',
    phone: '+96170666001', gender: 'male', locale: 'en',
  })
  const [student] = await svcPost('students', { profile_id: profile.id, gym_id: gymId, is_active: true })
  const [membership] = await svcPost('student_memberships', {
    student_id: student.id, plan_id: plan.id, start_date: daysAgo(30), end_date: today(),
    status: 'active', auto_renew: true,
  })
  membershipId = membership.id
})

test.afterAll(async () => {
  if (gymId) await rpc('teardown_e2e_gym', { p_slug: SLUG }).catch(() => {})
})

test('LIFECYCLE-CRON · POST without the secret is rejected (401) — the route is secret-gated', async ({ request }) => {
  const res = await request.post('/api/cron/lifecycle', { data: { gymId } })
  expect(res.status(), 'no Authorization header → 401').toBe(401)
  expect(await membershipRenewalCount(), 'an unauthorized call issues nothing').toBe(0)
})

test('LIFECYCLE-CRON · POST with a WRONG secret is rejected (401)', async ({ request }) => {
  const res = await request.post('/api/cron/lifecycle', {
    headers: { Authorization: 'Bearer not-the-secret' }, data: { gymId },
  })
  expect(res.status()).toBe(401)
  expect(await membershipRenewalCount(), 'a wrong-secret call issues nothing').toBe(0)
})

test('LIFECYCLE-CRON · authorized sweep issues the due renewal + reports per-gym + is idempotent', async ({ request }) => {
  test.setTimeout(60_000)
  // First authorized run: the membership ending today produces exactly one renewal.
  const res = await request.post('/api/cron/lifecycle', {
    headers: { Authorization: `Bearer ${SECRET}` }, data: { gymId },
  })
  expect(res.status(), 'authorized → 200').toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.gyms, 'the sweep was scoped to the one seeded gym').toBe(1)
  expect(Array.isArray(body.failures) && body.failures.length, 'no gym failed').toBe(0)
  expect(body.issued, 'the due membership renewal was issued').toBeGreaterThanOrEqual(1)
  // Per-gym reporting: the seeded gym appears in results with its own counts.
  const mine = (body.results as any[]).find((r) => r.gymId === gymId)
  expect(mine, 'the seeded gym is reported individually').toBeTruthy()
  expect(mine.issued, 'the per-gym result carries the issued count').toBeGreaterThanOrEqual(1)
  expect(await membershipRenewalCount(), 'exactly one renewal invoice recorded').toBe(1)

  // Second run (same day): the fresh open invoice + WHERE-due guards → nothing new.
  const res2 = await request.post('/api/cron/lifecycle', {
    headers: { Authorization: `Bearer ${SECRET}` }, data: { gymId },
  })
  expect(res2.status()).toBe(200)
  const body2 = await res2.json()
  expect(body2.issued, 'the second run issues nothing new (idempotent)').toBe(0)
  expect(await membershipRenewalCount(), 'still exactly one renewal invoice (no duplicate)').toBe(1)
})
