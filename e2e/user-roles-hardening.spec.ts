import { test, expect } from '@playwright/test'

/**
 * USER-ROLES-RLS-HARDENING (000085) — two RLS gaps closed:
 *   (a) user_roles: a non-admin staff (receptionist) can NO LONGER directly write
 *       user_roles over PostgREST — no role-escalation (self → owner) and no
 *       bypass-deactivate; the sanctioned set_staff_active RPC still works for admins.
 *   (b) class_schedules: an un-scoped SELECT no longer leaks another gym's schedules.
 *
 * API-only (RLS is a PostgREST concern, not a UI action): signs in as real users via
 * the GoTrue password grant and calls REST with the ANON apikey + the user JWT, so
 * every call passes THROUGH RLS (the service key would bypass it). Hermetic: seeds
 * TWO of its own gyms (writes mutate them) and tears them down. Worker-scoped slugs.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const W = process.env.TEST_WORKER_INDEX ?? '0'
const SLUG_A = `urh-a-${BASE}-w${W}`
const SLUG_B = `urh-b-${BASE}-w${W}`
const SVC = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymA = '', gymB = '', coachId = '', recepId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...SVC, ...(init?.headers || {}) } })
}
async function svcJson(path: string): Promise<any[]> {
  return (await svc(path)).json().catch(() => [])
}
async function seedGym(slug: string): Promise<string> {
  const r = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: SVC, body: JSON.stringify({ p_slug: slug, p_brand_color: null, p_name: null }),
  })
  if (!r.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${r.status} ${await r.text()}`)
  return (await r.json()) as string
}
async function tokenFor(email: string): Promise<string> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  if (!r.ok) throw new Error(`login ${email} failed: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token as string
}
// A REST call AS a user: anon apikey + the user's JWT → RLS is enforced.
async function asUser(token: string, path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: ANON!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}
// A write is "denied" when it 4xx's (WITH CHECK) or returns 0 rows (USING filtered all out).
async function isDenied(res: Response): Promise<boolean> {
  if (res.status >= 400) return true
  const b = await res.json().catch(() => null)
  return Array.isArray(b) && b.length === 0
}

test.beforeAll(async () => {
  if (!URL || !KEY || !ANON) throw new Error('USER-ROLES-HARDENING needs SERVICE_ROLE_KEY + ANON_KEY + SUPABASE_URL')
  gymA = await seedGym(SLUG_A)
  gymB = await seedGym(SLUG_B)
  coachId = (await svcJson(`user_roles?gym_id=eq.${gymA}&role=eq.coach&select=user_id`))[0]?.user_id
  recepId = (await svcJson(`user_roles?gym_id=eq.${gymA}&role=eq.receptionist&select=user_id`))[0]?.user_id
  if (!coachId || !recepId) throw new Error('seeded staff (coach/receptionist) not found')
})

test.afterAll(async () => {
  for (const g of [gymA, gymB]) {
    if (!g) continue
    const roles = await svcJson(`user_roles?gym_id=eq.${g}&select=user_id`)
    await svc(`gyms?id=eq.${g}`, { method: 'DELETE' }).catch(() => {})
    for (const r of roles) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: SVC }).catch(() => {})
  }
})

test('USER-ROLES · a receptionist cannot directly write user_roles; admin set_staff_active still works', async () => {
  const recep = await tokenFor(`reception+${SLUG_A}@e2e.local`)
  const owner = await tokenFor(`owner+${SLUG_A}@e2e.local`)

  // (i) escalate the coach → 'owner' (direct PATCH). RLS write policy is admin-only → denied.
  expect(await isDenied(await asUser(recep, `user_roles?user_id=eq.${coachId}&role=eq.coach`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ role: 'owner' }),
  })), 'receptionist cannot escalate a role').toBe(true)

  // (ii) self-insert an 'owner' role. WITH CHECK is admin-only → rejected.
  expect(await isDenied(await asUser(recep, `user_roles`, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: recepId, gym_id: gymA, role: 'owner' }),
  })), 'receptionist cannot self-assign owner').toBe(true)

  // (iii) directly deactivate the coach (bypass set_staff_active's guardrails). Denied.
  expect(await isDenied(await asUser(recep, `user_roles?user_id=eq.${coachId}&role=eq.coach`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ is_active: false }),
  })), 'receptionist cannot directly deactivate').toBe(true)

  // Ground truth (service role): the coach is UNCHANGED, and the receptionist gained nothing.
  expect((await svcJson(`user_roles?user_id=eq.${coachId}&role=eq.coach&select=role,is_active`))[0],
    'the coach row is untouched — still an active coach').toMatchObject({ role: 'coach', is_active: true })
  expect((await svcJson(`user_roles?user_id=eq.${recepId}&role=eq.owner&select=user_id`)).length,
    'the receptionist never gained an owner role').toBe(0)

  // The SANCTIONED path still works: the owner (admin) deactivates the coach via the RPC.
  const rpc = await asUser(owner, `rpc/set_staff_active`, { method: 'POST', body: JSON.stringify({ p_user_id: coachId, p_active: false }) })
  expect(rpc.ok, 'set_staff_active succeeds for an admin').toBeTruthy()
  expect((await svcJson(`user_roles?user_id=eq.${coachId}&role=eq.coach&select=is_active`))[0]?.is_active,
    'the RPC deactivated the coach').toBe(false)
})

test('CLASS-SCHEDULES · an un-scoped read never leaks another gym', async () => {
  const owner = await tokenFor(`owner+${SLUG_A}@e2e.local`) // gym A
  const bClasses = (await svcJson(`classes?gym_id=eq.${gymB}&select=id`)).map((c: any) => c.id)
  const aClasses = (await svcJson(`classes?gym_id=eq.${gymA}&select=id`)).map((c: any) => c.id)
  expect(bClasses.length, 'gym B has classes (→ schedules) to witness the leak').toBeGreaterThan(0)

  // gym A's owner does an UN-SCOPED select (NO gym filter) — RLS must still scope it.
  const rows = (await (await asUser(owner, `class_schedules?select=id,class_id`)).json()) as Array<{ class_id: string }>
  expect(rows.filter((r) => bClasses.includes(r.class_id)).length,
    "gym B's schedules are absent from gym A's un-scoped read").toBe(0)
  expect(rows.some((r) => aClasses.includes(r.class_id)),
    'gym A still sees its OWN schedules (not over-restricted)').toBeTruthy()
})
