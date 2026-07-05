import { test, expect } from '@playwright/test'

/**
 * ATTENDANCE-GYM-SCOPE (SECURITY) — the staff /attendance page must show ONLY the
 * caller's gym's classes. `class_schedules_read` RLS is a blanket authenticated read
 * (USING auth.role()='authenticated'), so before the fix an un-scoped select returned
 * EVERY gym's "today" classes. The page now scopes at the query (classes.gym_id).
 *
 * Seeds TWO isolated gyms (service role, seed_e2e_gym_no_membership → the
 * service_role-callable wrapper around seed_e2e_gym: owner + coach + discipline + a
 * Muay Thai class scheduled every weekday; membership disabled, irrelevant here). Gym
 * B also gets a UNIQUELY-named class scheduled every weekday. Logs in as gym A's owner
 * and asserts: gym A's own class renders (page works + query returns MY gym) and gym
 * B's unique class is ABSENT (no cross-tenant leak). /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23'

const SLUG_MINE = `attsc-mine-${BASE}`
const SLUG_OTHER = `attsc-other-${BASE}`
const OWNER_MINE = `owner+${SLUG_MINE}@e2e.local`
// seed_e2e_gym names its class "Muay Thai Beginner" (scheduled every weekday).
const MINE_CLASS = 'Muay Thai Beginner'
// Uniquely-named class that exists ONLY in the OTHER gym — the leak canary.
const OTHER_CLASS = `ATTSC OTHER ${BASE}`

async function svc(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res
}

async function seedGym(slug: string): Promise<string> {
  // seed_e2e_gym itself is postgres-only (REVOKEd from PUBLIC); its no-membership
  // wrapper is GRANTed to service_role and calls it internally. Idempotent per slug
  // (teardown-on-reseed). Returns the gym UUID.
  const res = await svc('rpc/seed_e2e_gym_no_membership', 'POST', { p_slug: slug, p_password: PASSWORD })
  return (await res.json()) as string
}

async function firstId(table: string, gymId: string): Promise<string> {
  const res = await svc(`${table}?gym_id=eq.${gymId}&select=id&limit=1`)
  const rows = (await res.json()) as Array<{ id: string }>
  if (!rows[0]?.id) throw new Error(`no ${table} row for gym ${gymId}`)
  return rows[0].id
}

async function seedClassEveryDay(gymId: string, name: string) {
  const [coachId, disciplineId] = await Promise.all([firstId('coaches', gymId), firstId('disciplines', gymId)])
  const clsRes = await svc(
    'classes',
    'POST',
    { gym_id: gymId, discipline_id: disciplineId, coach_id: coachId, name_en: name, name_ar: name, name_fr: name, is_active: true },
    { Prefer: 'return=representation' },
  )
  const classId = ((await clsRes.json()) as Array<{ id: string }>)[0].id
  // Schedule EVERY weekday so it is "today" regardless of the runner's timezone.
  await svc(
    'class_schedules',
    'POST',
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({ class_id: classId, day_of_week: d, start_time: '10:00', end_time: '11:00', is_active: true })),
  )
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('ATTENDANCE-SCOPE needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  await seedGym(SLUG_MINE) // gym A: owner + "Muay Thai Beginner" (every weekday)
  const gymOther = await seedGym(SLUG_OTHER) // gym B
  await seedClassEveryDay(gymOther, OTHER_CLASS) // gym B: the uniquely-named leak canary
})

test('ATTENDANCE-SCOPE · staff sees ONLY their own gym classes on /attendance (no cross-tenant leak)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // fresh — log in as gym A's owner
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(OWNER_MINE)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })

    await page.goto('/en/attendance')
    // The caller's OWN gym class renders → the page works AND the scoped query
    // returns MY gym (guards against the fix accidentally emptying the page).
    await expect(
      page.getByText(MINE_CLASS, { exact: false }).first(),
      "the caller's own gym class renders on /attendance",
    ).toBeVisible({ timeout: 20_000 })
    // The OTHER gym's uniquely-named class must NOT appear — this is the leak canary
    // (before the fix, the blanket class_schedules read surfaced it cross-tenant).
    await expect(
      page.getByText(OTHER_CLASS, { exact: false }),
      "the other gym's class must NOT leak onto the attendance page",
    ).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
