import { test, expect, type Browser } from '@playwright/test'

/**
 * PERF-2 — optimistic front-desk mutations. Subject: the attendance desk toggle
 * (the single highest-frequency front-desk action). It writes straight through the
 * browser Supabase client, so we can fail that PostgREST write with page.route and
 * observe the optimistic paint + rollback deterministically.
 *
 *   1. clicking a status paints it INSTANTLY and, once the real write lands, it
 *      PERSISTS (verified via a service-role DB read + a fresh SSR reload);
 *   2. an induced write failure paints optimistically BEFORE the (delayed) round-trip
 *      resolves, then ROLLS the row back to its prior status.
 *
 * We fulfill the failure (reliable) rather than gate-then-continue a real write
 * (unreliable under the prod service worker). Hermetic: seeds its OWN gym
 * (seed_e2e_wl_gym — owner/coach/reception + Karim & Omar enrolled in a Muay-Thai
 * class scheduled every weekday). The slug carries the worker index so a retry in a
 * fresh worker never collides with a prior attempt's surviving auth users. /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `perf2-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const ATT_WRITE = '**/rest/v1/attendance_records*'
const TODAY = new Date().toISOString().slice(0, 10)
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function loginOwner(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('PERF-2 needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})

test.afterAll(async () => {
  // Delete the gym (cascades classes/enrollments/records + gym-scoped user_roles) and
  // the run's auth users (GoTrue admin) so a survivor never blocks a later re-seed.
  if (!gymId) return
  const roleRows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
  for (const r of roleRows) {
    await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  }
})

test('PERF-2 · a marked status paints instantly and the real write persists', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    await page.goto('/en/attendance')
    // Only this gym's card has visible enrolled rows (class_enrollments is gym-scoped),
    // so the first att-row is deterministically one of our seeded students.
    const row = page.getByTestId('att-row').first()
    await expect(row, 'the seeded class roster renders').toBeVisible({ timeout: 20_000 })
    const sid = await row.getAttribute('data-student-id')
    expect(sid).toBeTruthy()

    // Click present — the optimistic paint is synchronous (instant).
    await row.getByTestId('att-btn-present').click()
    await expect(row, 'the status paints instantly').toHaveAttribute('data-status', 'present', { timeout: 3_000 })

    // PERSISTS: the real write commits (poll the DB via service role — this also
    // guarantees the write is no longer in flight before we reload, so the reload
    // can't abort it).
    await expect.poll(async () => {
      const rows = await (await svc(`attendance_records?student_id=eq.${sid}&attendance_date=eq.${TODAY}&select=status`)).json().catch(() => [])
      return Array.isArray(rows) ? rows[0]?.status : undefined
    }, { message: 'the mark reaches the DB', timeout: 15_000, intervals: [500, 1000, 2000] }).toBe('present')

    // …and a fresh SSR read still shows it.
    await page.reload()
    await expect(
      page.locator(`[data-testid="att-row"][data-student-id="${sid}"]`),
      'the mark persisted across a reload',
    ).toHaveAttribute('data-status', 'present', { timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})

test('PERF-2 · an induced write failure paints before the round-trip resolves, then rolls back', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    await page.goto('/en/attendance')
    const row = page.getByTestId('att-row').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    const before = (await row.getAttribute('data-status')) ?? ''
    const target = before === 'late' ? 'absent' : 'late' // always different from `before`

    // Fail the write — but only AFTER a delay, so the optimistic paint is observable
    // while the round-trip is still outstanding.
    await page.route(ATT_WRITE, async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 1_500))
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'induced failure' }) }).catch(() => {})
      } else await route.continue().catch(() => {})
    })

    await row.getByTestId(`att-btn-${target}`).click()
    // BEFORE the round-trip resolves: the new status is already painted.
    await expect(row, 'the new status paints before the round-trip resolves')
      .toHaveAttribute('data-status', target, { timeout: 1_200 })
    // AFTER the failed write: the optimistic mark rolls back to its prior value (the
    // rollback happens only in the catch path, so this proves the error was handled).
    await expect(row, 'the row rolls back on failure')
      .toHaveAttribute('data-status', before, { timeout: 10_000 })
    await page.unroute(ATT_WRITE)
  } finally {
    await ctx.close()
  }
})
