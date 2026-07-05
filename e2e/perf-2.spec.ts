import { test, expect, type Browser } from '@playwright/test'

/**
 * PERF-2 — optimistic front-desk mutations. Subject: the attendance desk toggle
 * (the single highest-frequency front-desk action). It writes straight through the
 * browser Supabase client, so we can gate/fail that PostgREST write with page.route
 * and observe the optimistic paint + reconcile/rollback deterministically.
 *
 *   1. clicking a status paints it INSTANTLY (before the write round-trip resolves)
 *      and, once the write lands, it PERSISTS across a reload;
 *   2. an induced write failure ROLLS the row back to its prior status + toasts.
 *
 * Hermetic: seeds its OWN gym (seed_e2e_wl_gym — owner/coach/reception + Karim &
 * Omar enrolled in a Muay-Thai class scheduled every weekday) and tears it down. /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `perf2-${BASE}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const ATT_WRITE = '**/rest/v1/attendance_records*'
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
  if (gymId) await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {}) // cascades classes/enrollments/records
})

test('PERF-2 · a marked status paints instantly (before the write resolves) and persists', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    await page.goto('/en/attendance')
    const row = page.getByTestId('att-row').first()
    await expect(row, 'the seeded class roster renders').toBeVisible({ timeout: 20_000 })
    const sid = await row.getAttribute('data-student-id')
    expect(sid).toBeTruthy()

    // Gate the PostgREST write so it stays IN-FLIGHT while we assert the paint.
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    await page.route(ATT_WRITE, async (route) => {
      if (route.request().method() === 'POST') { await gate; await route.continue() }
      else await route.continue()
    })

    await row.getByTestId('att-btn-present').click()
    // OPTIMISTIC: the row flips to present WHILE the write is still gated (unresolved).
    await expect(row, 'the status paints before the round-trip completes')
      .toHaveAttribute('data-status', 'present', { timeout: 4_000 })

    // Let the write land, confirm it settled, drop the gate.
    release()
    await expect(page.locator('[data-sonner-toast]').first(), 'the save confirms').toBeVisible({ timeout: 15_000 })
    await page.unroute(ATT_WRITE)

    // PERSISTS: a fresh SSR read shows the same student still present.
    await page.reload()
    await expect(
      page.locator(`[data-testid="att-row"][data-student-id="${sid}"]`),
      'the mark persisted across a reload',
    ).toHaveAttribute('data-status', 'present', { timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})

test('PERF-2 · an induced write failure rolls the optimistic mark back', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    await page.goto('/en/attendance')
    const row = page.getByTestId('att-row').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    const before = (await row.getAttribute('data-status')) ?? ''
    const target = before === 'late' ? 'absent' : 'late' // always different from `before`

    // Fail the write — but slowly enough to observe the optimistic paint first.
    await page.route(ATT_WRITE, async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 1_500))
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'induced failure' }) })
      } else await route.continue()
    })

    await row.getByTestId(`att-btn-${target}`).click()
    // OPTIMISTIC paint happens immediately…
    await expect(row, 'the new status paints optimistically')
      .toHaveAttribute('data-status', target, { timeout: 1_200 })
    // …then the failed write ROLLS it back to the prior value + an error toast.
    await expect(row, 'the row rolls back on failure')
      .toHaveAttribute('data-status', before, { timeout: 10_000 })
    await expect(page.locator('[data-sonner-toast]').first(), 'an error is surfaced').toBeVisible({ timeout: 10_000 })
    await page.unroute(ATT_WRITE)
  } finally {
    await ctx.close()
  }
})
