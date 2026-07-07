import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * J5 SETTINGS-REFIT — the new closed-set pickers + hero UPLOAD on the regrouped gym
 * settings form, and the render-site correctness for a stored (relative) hero path.
 *   1. currency → 3 chips (USD/LBP/Both): pick Both → Save → persists.
 *   2. timezone → searchable picker: pick Asia/Beirut → Save → persists.
 *   3. hero UPLOAD → gym-landing bucket, storing a RELATIVE path <gymId>/hero.jpg.
 *   4. a relative hero path resolves via the gym-landing bucket at the landing's
 *      og:image (the seo.ts render site) — the AVATAR-PATHS contract end-to-end.
 * Hermetic: seeds its OWN gym (seed_e2e_wl_gym), per-worker slug, tears it + its auth
 * users down. The (dashboard) double-shell mounts settings twice → vis()/.first().
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `sr-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function svc(p: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('SETTINGS-REFIT needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('SETTINGS-REFIT · currency chips + searchable timezone picker persist (no free-text for closed sets)', async ({ browser }) => {
  test.setTimeout(90_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/settings')
    await expect(vis(owner.page, '[data-testid="gym-name-en"]').first()).toBeVisible({ timeout: 15_000 })

    // ── Currency: pick the "Both" chip (closed set, no free-text) → Save → persists ──
    await vis(owner.page, '[data-testid="gym-currency-chip"][data-value="BOTH"]').first().click()
    // ── Timezone: search the picker → pick Asia/Beirut ──
    await vis(owner.page, '[data-testid="gym-timezone"]').first().fill('Beirut')
    await vis(owner.page, '[data-testid="gym-timezone-option"][data-value="Asia/Beirut"]').first().click()

    await vis(owner.page, '[data-testid="gym-save"]').first().click()
    await expect(vis(owner.page, '[data-testid="gym-save-ok"]').first(), 'save confirms').toBeVisible({ timeout: 15_000 })

    // PERSISTENCE across a fresh server render.
    await owner.page.reload()
    await expect(vis(owner.page, '[data-testid="gym-currency-chip"][data-value="BOTH"]').first(), 'currency chip persisted')
      .toHaveAttribute('data-active', 'true', { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="gym-timezone"]').first(), 'timezone persisted')
      .toHaveValue('Asia/Beirut', { timeout: 15_000 })
  } finally {
    await owner.ctx.close()
  }
})

test('SETTINGS-REFIT · a relative hero path resolves via the gym-landing bucket (landing og:image)', async ({ browser }) => {
  test.setTimeout(90_000)
  // Set a relative hero path directly (independent of the upload test).
  const relPath = `${gymId}/hero.jpg`
  const res = await svc(`gyms?id=eq.${gymId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hero_image_url: relPath }),
  })
  expect(res.ok, 'hero path set').toBeTruthy()

  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('hero-gym-name'), 'the gym landing renders').toBeVisible({ timeout: 15_000 })
    const ogImage = await page.locator('head meta[property="og:image"]').first().getAttribute('content')
    expect(ogImage, 'og:image resolves the relative hero via the gym-landing bucket')
      .toContain(`/storage/v1/object/public/gym-landing/${relPath}`)
  } finally {
    await ctx.close()
  }
})
