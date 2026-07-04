import { test, expect } from '@playwright/test'

/**
 * CATALOG-SCOPE (Phase 4 SECURITY) — the anon key can NO LONGER enumerate every
 * gym's catalog. 000080 dropped the six anon *_public_read policies and replaced
 * them with per-gym SECURITY DEFINER RPCs. Asserts:
 *   (a) an anon PostgREST client SELECTing each catalog table directly gets ZERO
 *       rows (RLS denies — the blanket read is gone), even though rows exist;
 *   (b) the per-gym RPC returns ONLY the queried gym's rows (no cross-tenant leak)
 *       and anon is allowed to call it (GRANT anon).
 *
 * Seeds TWO isolated gyms with a distinctly-named discipline each (service role).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_A = `cat-a-${BASE}`
const SLUG_B = `cat-b-${BASE}`
const DISC_A = 'CATSCOPE Alpha Discipline'
const DISC_B = 'CATSCOPE Beta Discipline'
const DID_A = 'd0000000-0000-4000-8000-0000000000a1'
const DID_B = 'd0000000-0000-4000-8000-0000000000b2'

// The six catalog tables whose blanket anon read 000080 revoked.
const TABLES = ['disciplines', 'classes', 'class_schedules', 'membership_plans', 'pt_packages', 'camps']

const svc = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const anon = { apikey: ANON!, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }

let gymA = ''
let gymB = ''

async function seedWl(slug: string, name: string): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ p_slug: slug, p_brand_color: '#334455', p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string
}

async function seedDiscipline(id: string, gymId: string, name: string) {
  const res = await fetch(`${URL}/rest/v1/disciplines`, {
    method: 'POST',
    headers: { ...svc, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ id, gym_id: gymId, name_ar: name, name_en: name, name_fr: name, is_active: true, sort_order: 0 }),
  })
  if (!res.ok) throw new Error(`seed discipline(${name}) failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY || !ANON) throw new Error('CATALOG-SCOPE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY + URL')
  gymA = await seedWl(SLUG_A, 'Catalog Scope A')
  gymB = await seedWl(SLUG_B, 'Catalog Scope B')
  await seedDiscipline(DID_A, gymA, DISC_A)
  await seedDiscipline(DID_B, gymB, DISC_B)
})

test('CATALOG-SCOPE · anon cannot bulk-enumerate ANY catalog table (blanket read killed)', async () => {
  for (const table of TABLES) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=5`, { headers: anon })
    // RLS filters rows (200 with []), it does not error — the point is ZERO rows,
    // even though seeded rows exist for these gyms.
    expect(res.status, `anon SELECT ${table} resolves (RLS filters, not 4xx)`).toBe(200)
    const rows = (await res.json()) as unknown[]
    expect(Array.isArray(rows) ? rows.length : -1, `anon blanket SELECT ${table} → ZERO rows`).toBe(0)
  }
})

test('CATALOG-SCOPE · the per-gym RPC returns ONLY that gym rows (anon-callable, no cross-tenant leak)', async () => {
  async function rpc(gymId: string): Promise<string[]> {
    const res = await fetch(`${URL}/rest/v1/rpc/get_landing_disciplines`, {
      method: 'POST',
      headers: anon, // anon MUST be able to call the definer RPC (GRANT anon)
      body: JSON.stringify({ p_gym_id: gymId }),
    })
    expect(res.status, 'anon may call the landing RPC').toBe(200)
    return ((await res.json()) as Array<{ name_en: string }>).map((r) => r.name_en)
  }
  const namesA = await rpc(gymA)
  const namesB = await rpc(gymB)

  expect(namesA, 'gym A RPC returns A discipline').toContain(DISC_A)
  expect(namesA, 'gym A RPC must NOT leak gym B discipline').not.toContain(DISC_B)
  expect(namesB, 'gym B RPC returns B discipline').toContain(DISC_B)
  expect(namesB, 'gym B RPC must NOT leak gym A discipline').not.toContain(DISC_A)
})
