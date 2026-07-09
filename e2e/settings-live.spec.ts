import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * SETTINGS-LIVE — the two previously-DEAD Settings forms persist for real.
 *
 *  1. Gym editor: owner edits name_en + brand_color → Save → reload → values
 *     persist (server re-read, not client state). The gym name is RESTORED at
 *     the end — other specs share this worker-gym and assert on its name.
 *  2. Exchange rates: owner adds a rate via the 000075 RPC → it becomes the
 *     current rate + appears in history → the /invoices/new LBP derivation
 *     uses it (placeholder = usd × rate; nothing is issued). exchange_rates is
 *     GLOBAL, so the guard uses TOMORROW's date (no collision with the seeded
 *     today/manual 89,000) and finishes by upserting the SAME day+source back
 *     to 89,000 — the steady-state rate every other spec sees is unchanged.
 *
 * The (dashboard) double-shell mounts settings twice → every locator uses vis().
 */
async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

const tomorrowISO = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10)

test('SETTINGS-LIVE · gym editor persists (name + brand color), then restores the name', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    await page.goto('/en/settings?tab=gym') // M2-A: /settings root is the card index; open the gym section
    const nameEn = vis(page, '[data-testid="gym-name-en"]').first()
    await expect(nameEn).toBeVisible({ timeout: 15_000 })
    const originalName = await nameEn.inputValue()
    expect(originalName.length, 'seeded gym name present').toBeGreaterThan(0)

    const TEST_NAME = `${originalName} EDITED`
    const TEST_COLOR = '#1a7f37'
    await nameEn.fill(TEST_NAME)
    await vis(page, '[data-testid="gym-brand-color"]').first().fill(TEST_COLOR)
    // M2-D: per-section saves — name is the Identity section, brand color is Branding.
    await vis(page, '[data-testid="gym-save-identity"]').first().click()
    await expect(vis(page, '[data-testid="gym-save-ok-identity"]').first(), 'identity save confirms').toBeVisible({ timeout: 15_000 })
    await vis(page, '[data-testid="gym-save-branding"]').first().click()
    await expect(vis(page, '[data-testid="gym-save-ok-branding"]').first(), 'branding save confirms').toBeVisible({ timeout: 15_000 })

    // PERSISTENCE: a fresh server render (reload) shows the saved values.
    await page.reload()
    await expect(vis(page, '[data-testid="gym-name-en"]').first(), 'name persisted').toHaveValue(TEST_NAME, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="gym-brand-color"]').first(), 'brand color persisted').toHaveValue(TEST_COLOR)
    await expect(vis(page, '[data-testid="gym-header-name"]').first(), 'identity card reflects the save').toContainText(TEST_NAME)

    // Validation: a malformed color is rejected (no partial write) — the Branding save.
    await vis(page, '[data-testid="gym-brand-color"]').first().fill('red')
    await vis(page, '[data-testid="gym-save-branding"]').first().click()
    await expect(vis(page, '[data-testid="gym-save-error-branding"]').first(), 'bad hex rejected').toBeVisible({ timeout: 10_000 })

    // RESTORE the shared-gym name (+ clear the color) so no other spec sees the edit.
    await vis(page, '[data-testid="gym-name-en"]').first().fill(originalName)
    await vis(page, '[data-testid="gym-brand-color"]').first().fill('')
    await vis(page, '[data-testid="gym-save-identity"]').first().click()
    await expect(vis(page, '[data-testid="gym-save-ok-identity"]').first(), 'name restore saves').toBeVisible({ timeout: 15_000 })
    await vis(page, '[data-testid="gym-save-branding"]').first().click()
    await expect(vis(page, '[data-testid="gym-save-ok-branding"]').first(), 'color clear saves').toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(vis(page, '[data-testid="gym-name-en"]').first(), 'name restored').toHaveValue(originalName, { timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('SETTINGS-LIVE · add exchange rate → current + history + new-invoice LBP derivation uses it; then corrected back', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    // Add 89,500 dated TOMORROW (strictly the latest; today/manual 89,000 untouched).
    await page.goto('/en/settings?tab=rates') // M2-A: ?tab=rates opens the Offers section (exchange rates live there)
    await expect(vis(page, '[data-testid="rate-input"]').first()).toBeVisible({ timeout: 15_000 })
    await vis(page, '[data-testid="rate-input"]').first().fill('89500')
    await vis(page, '[data-testid="rate-date"]').first().fill(tomorrowISO())
    await vis(page, '[data-testid="rate-save"]').first().click()
    await expect(vis(page, '[data-testid="rate-save-ok"]').first(), 'rate saved via the RPC').toBeVisible({ timeout: 15_000 })

    // It is now the CURRENT rate + in the history table (server re-read).
    await page.reload() // reload preserves ?tab=rates → back on the Offers section
    await expect(vis(page, 'body').first(), 'new rate is the current rate').toContainText('89,500', { timeout: 15_000 })

    // Derivation: /invoices/new derives LBP from the LATEST rate → 10 × 89,500.
    await page.goto('/en/invoices/new')
    await vis(page, '[data-testid="inv-amount-usd"]').first().fill('10')
    await expect(
      vis(page, '[data-testid="inv-amount-lbp"]').first(),
      'new-invoice LBP derivation uses the freshly-added rate',
    ).toHaveAttribute('placeholder', '895000', { timeout: 10_000 })

    // CORRECTION (same day+source upsert): put the steady-state 89,000 back so the
    // global current rate is value-identical for every other spec in the gate.
    await page.goto('/en/settings?tab=rates') // M2-A: Offers section (exchange rates)
    await vis(page, '[data-testid="rate-input"]').first().fill('89000')
    await vis(page, '[data-testid="rate-date"]').first().fill(tomorrowISO())
    await vis(page, '[data-testid="rate-save"]').first().click()
    await expect(vis(page, '[data-testid="rate-save-ok"]').first(), 'correction upserts the same day+source').toBeVisible({ timeout: 15_000 })

    // Prove the correction landed (also proves the upsert-correct workflow itself).
    await page.goto('/en/invoices/new')
    await vis(page, '[data-testid="inv-amount-usd"]').first().fill('10')
    await expect(vis(page, '[data-testid="inv-amount-lbp"]').first(), 'derivation follows the corrected rate')
      .toHaveAttribute('placeholder', '890000', { timeout: 10_000 })
  } finally {
    await ctx.close()
  }
})
