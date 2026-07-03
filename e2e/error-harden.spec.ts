import { test, expect } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * ERROR-HARDEN — error surfaces + auth hardening (audit P1 bundle).
 *   1. A server throw renders the BRANDED, localized error boundary (retry
 *      affordance; the raw message never reaches the UI) — /en + /ar (RTL).
 *   2. The EMAIL login path is rate-limited per (IP+identifier) like the phone
 *      path (it used to hit GoTrue client-side, bypassing the limiter).
 *   3. gyms UPDATE is owner/head_coach-only (000077): a receptionist's settings
 *      save does NOT persist (RLS-filtered); the owner path stays green via the
 *      settings-live spec in this same slice.
 * The forced-error hook is E2E_TEST_MODE-gated (never active in prod).
 */
const RUN = Date.now().toString().slice(-6)
const GENERIC = 'An error occurred during login'
const LIMITED = 'Too many attempts'

test('EH #1 · a segment throw renders the branded localized boundary — no raw error, retry present (/en + /ar)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/today?__err=1')
    await expect(vis(page, '[data-testid="segment-error"]').first(), 'the branded boundary renders').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('error-retry'), 'a retry affordance is offered').toBeVisible()
    await expect(page.locator('body'), 'the raw error message never reaches the UI').not.toContainText('raw internals')
    await expect(page.locator('body')).not.toContainText('e2e forced segment error')
    await expect(page.locator('body')).toContainText('Something went wrong')

    // /ar — localized + RTL.
    await page.goto('/ar/today?__err=1')
    const arBoundary = vis(page, '[data-testid="segment-error"]').first()
    await expect(arBoundary, 'the boundary renders on /ar').toBeVisible({ timeout: 15_000 })
    await expect(arBoundary).toContainText('حدث خطأ ما')
    await expect(arBoundary, 'RTL-correct').toHaveAttribute('dir', 'rtl')
  } finally {
    await ctx.close()
  }
})

test('EH #2 · email wrong-password ×N is rate-limited distinctly (the client-side bypass is closed)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  const email = `eh-limit-${RUN}@nowhere.test` // limiter keys on the SUBMITTED id — no account needed
  try {
    for (let i = 1; i <= 5; i++) {
      await page.goto('/en/auth/login')
      await page.locator('#email').fill(email)
      await page.locator('#password').fill('WrongPass!123')
      await page.locator('button[type="submit"]').click()
      await expect(page.getByText(GENERIC), `attempt ${i} fails generically (not limited, not raw)`).toBeVisible({ timeout: 10_000 })
    }
    // 6th attempt on the same email → the DISTINCT limiter message.
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill('WrongPass!123')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText(LIMITED, { exact: false }), 'the 6th email attempt is rate-limited distinctly').toBeVisible({ timeout: 10_000 })
  } finally {
    await ctx.close()
  }
})

test('EH #3 · a receptionist cannot persist gym settings (gyms UPDATE is owner/head_coach-only)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.reception.storage, locale: 'en' })
  const page = await ctx.newPage()
  const HACK = `Recep Hack ${RUN}`
  try {
    await page.goto('/en/settings')
    const nameEn = vis(page, '[data-testid="gym-name-en"]').first()
    await expect(nameEn).toBeVisible({ timeout: 15_000 })
    await nameEn.fill(HACK)
    await vis(page, '[data-testid="gym-save"]').first().click()
    // RLS filters the UPDATE to zero rows — whatever the UI says, NOTHING persists.
    await page.waitForTimeout(1500) // let any write round-trip
    await page.reload()
    await expect(vis(page, '[data-testid="gym-name-en"]').first(), 'the receptionist write did NOT persist')
      .not.toHaveValue(HACK, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="gym-header-name"]').first()).not.toContainText(HACK)
  } finally {
    await ctx.close()
  }
})
