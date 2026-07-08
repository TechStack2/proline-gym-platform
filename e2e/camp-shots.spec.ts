import { test, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * CAMP-SHOTS (M2-B PRODUCT-SETUP) — visual evidence, not a functional assertion.
 * Full-page screenshots of the setup hub (showing the product-gated camps milestone)
 * and the camp create wizard step-by-step (now on the shared FormWizard), into
 * screenshots/ — the e2e-screenshots CI artifact the auditor reviews before decree.
 * Best-effort (.catch): captures whatever renders rather than failing the evidence run.
 */
async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {})
}

test('CAMP-SHOTS · setup hub (camps milestone) + camp wizard steps', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
  try {
    // ── The guided setup hub — the product-gated "Your camps" milestone card ──
    await page.goto('/en/setup')
    await page.locator('[data-testid="setup-hub"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
    await shot(page, 'camp-setup-hub')

    // ── The camp create wizard, step by step (Basics → Dates & capacity → Pricing → Review) ──
    await page.goto('/en/camps')
    await page.locator('[data-testid="camp-add-btn"]').first().click()
    await page.locator('[data-testid="camp-wizard"]').first().waitFor({ timeout: 10_000 }).catch(() => {})
    await shot(page, 'camp-wizard-1-basics')

    await page.getByTestId('camp-name-en').fill('Summer Shots Camp')
    await page.getByTestId('wizard-next').click()
    await shot(page, 'camp-wizard-2-dates')

    await page.getByTestId('camp-start').fill(today)
    await page.getByTestId('camp-end').fill(end)
    await page.getByTestId('camp-capacity').fill('20')
    await page.getByTestId('wizard-next').click()
    await shot(page, 'camp-wizard-3-pricing')

    await page.getByTestId('camp-price-usd').fill('150')
    await page.getByTestId('wizard-next').click()
    await shot(page, 'camp-wizard-4-review')
  } finally {
    await ctx.close()
  }
})
