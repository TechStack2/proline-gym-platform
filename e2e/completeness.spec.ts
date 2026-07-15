import { test, expect, type Browser } from '@playwright/test'

/**
 * COMPLETENESS — warn-and-allow product completeness + Incomplete badges.
 *
 * BILL-GUARDS made cost impossible to skip, but a class could still go live with NO
 * schedule slot (invisible on the timetable). This proves the J3 warn-and-allow +
 * the Incomplete surfaces, end to end:
 *   R2  the class wizard no longer HARD-BLOCKS a missing schedule — deselecting the
 *       default day reaches review, which shows an honest warning, and the class
 *       still saves (proceed allowed, never blocked).
 *   R3a the created no-schedule class shows an "Incomplete · No schedule" badge on
 *       its /classes card, while a COMPLETE seeded class shows no badge (no noise).
 *   R3b the Manage index (/settings) Classes card warns "N need setup".
 *
 * Hermetic: seeds its OWN fresh gym via seed_e2e_wl_gym (which wraps seed_e2e_gym →
 * disciplines + a coach + complete seeded classes), so the gym-wide incomplete count
 * is deterministic and the shared run gym is never perturbed. Tears the gym down.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `cmpl-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
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
  if (!URL || !KEY) throw new Error('COMPLETENESS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
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

test('COMPLETENESS · a no-schedule class warns-and-allows, badges Incomplete, and flags the Manage card', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  const className = `Incomplete Class ${Date.now().toString().slice(-6)}`
  try {
    await owner.page.goto('/en/classes')
    await owner.page.getByTestId('add-class-btn').click()

    // Step 1 — basics: name + discipline + coach (all still hard-required).
    await owner.page.getByTestId('class-name-en').fill(className)
    await owner.page.locator('[data-testid="wizard-discipline-chip"]').first().click()
    await owner.page.locator('[data-testid="wizard-coach-chip"]').first().click()
    await owner.page.getByTestId('wizard-next').click()

    // Step 2 — DESELECT the preselected Monday → zero schedule slots. R2: this used to
    // HARD-BLOCK (Next disabled); now it is warn-and-allow, so Next proceeds.
    await owner.page.locator('[data-testid="wizard-day-pill"][data-dow="1"]').click()
    await expect(owner.page.getByTestId('wizard-next'), 'no schedule no longer blocks Next').toBeEnabled()
    await owner.page.getByTestId('wizard-next').click()

    // Step 3 — capacity default + a fee (fee is still hard-required by BILL-GUARDS).
    await owner.page.getByTestId('class-monthly-fee').fill('30')
    await owner.page.getByTestId('wizard-next').click()

    // Step 4 — review: the honest schedule warning shows; submit is NOT blocked.
    await expect(owner.page.getByTestId('wizard-completeness-warn'), 'review warns about the missing schedule').toBeVisible()
    await expect(owner.page.getByTestId('wizard-completeness-warn')).toContainText(/won't appear on the timetable/i)
    // SHOT (en): the save-time warn-and-allow at review.
    await owner.page.screenshot({ path: 'screenshots/completeness-save-warning-en.png' }).catch(() => {})
    await owner.page.getByTestId('wizard-submit').click()
    await expect(owner.page.getByTestId('wizard-success'), 'the class still saves (proceed allowed)').toBeVisible({ timeout: 15_000 })
    await expect(owner.page.locator('[data-testid="class-wizard"]')).toHaveCount(0, { timeout: 10_000 })

    // R3a — the new class card carries the Incomplete badge + what's-missing.
    const mine = owner.page.locator('[data-testid="class-card"]').filter({ hasText: className }).first()
    await expect(mine).toBeVisible({ timeout: 15_000 })
    await expect(mine.getByTestId('class-incomplete'), 'incomplete class is badged').toBeVisible()
    await expect(mine.getByTestId('class-incomplete')).toContainText(/Incomplete/i)
    await expect(mine.getByTestId('class-incomplete')).toContainText(/No schedule/i)
    // SHOT (en): the Incomplete badge on the class card.
    await mine.scrollIntoViewIfNeeded().catch(() => {})
    await owner.page.screenshot({ path: 'screenshots/completeness-badge-en.png' }).catch(() => {})

    // R3a (no noise) — a COMPLETE seeded class (Muay Thai Beginner, weekday schedules)
    // shows NO badge.
    const seeded = owner.page.locator('[data-testid="class-card"]').filter({ hasText: 'Muay Thai Beginner' }).first()
    await expect(seeded, 'a seeded complete class renders').toBeVisible()
    await expect(seeded.getByTestId('class-incomplete'), 'a complete class shows nothing').toHaveCount(0)

    // R3b — the Manage index Classes card warns "N need setup".
    await owner.page.goto('/en/settings')
    const incompleteChip = owner.page.getByTestId('settings-classes-incomplete')
    await expect(incompleteChip, 'the Manage Classes card flags the gap').toBeVisible({ timeout: 20_000 })
    await expect(incompleteChip).toContainText(/need setup/i)
    // SHOT (en): the "N need setup" chip on the Manage index Classes card.
    await incompleteChip.scrollIntoViewIfNeeded().catch(() => {})
    await owner.page.screenshot({ path: 'screenshots/completeness-manage-en.png' }).catch(() => {})

    // ── Arabic (RTL) visual pass — the class already exists, so navigate + shoot. ──
    await owner.page.goto('/ar/settings')
    await expect(owner.page.getByTestId('settings-classes-incomplete')).toBeVisible({ timeout: 20_000 })
    await owner.page.screenshot({ path: 'screenshots/completeness-manage-ar.png' }).catch(() => {})
    await owner.page.goto('/ar/classes')
    const mineAr = owner.page.locator('[data-testid="class-card"]').filter({ hasText: className }).first()
    await expect(mineAr.getByTestId('class-incomplete')).toBeVisible({ timeout: 15_000 })
    await mineAr.scrollIntoViewIfNeeded().catch(() => {})
    await owner.page.screenshot({ path: 'screenshots/completeness-badge-ar.png' }).catch(() => {})
    // SHOT (ar): re-open the wizard, drop the default day, reach review → the AR warn.
    await owner.page.getByTestId('add-class-btn').click()
    await owner.page.getByTestId('class-name-en').fill(`${className} AR`)
    await owner.page.locator('[data-testid="wizard-discipline-chip"]').first().click()
    await owner.page.locator('[data-testid="wizard-coach-chip"]').first().click()
    await owner.page.getByTestId('wizard-next').click()
    await owner.page.locator('[data-testid="wizard-day-pill"][data-dow="1"]').click()
    await owner.page.getByTestId('wizard-next').click()
    await owner.page.getByTestId('class-monthly-fee').fill('30')
    await owner.page.getByTestId('wizard-next').click()
    await expect(owner.page.getByTestId('wizard-completeness-warn')).toBeVisible({ timeout: 15_000 })
    await owner.page.screenshot({ path: 'screenshots/completeness-save-warning-ar.png' }).catch(() => {})
  } finally {
    await owner.ctx.close()
  }
})
