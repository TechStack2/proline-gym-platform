import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { gymSlug, vis } from './helpers'

/**
 * SMOKE — a small, fast, curated subset for TARGETED branch runs
 * (`gh workflow run e2e.yml -f projects="<slice>"` → setup + smoke + <slice>).
 * Catches gross breakage of the critical paths: the staff dashboard, the member
 * portal, the public landing, the billing write happy-path, and /ar localization.
 *
 * Every check SELF-CONTEXTS (its own owner / student / anon context) so it never
 * depends on a project-pinned storageState. This spec is run ONLY by the `smoke`
 * project, which materializes only under `E2E_TIERED=1` — the FULL push-to-main
 * union gate never runs it (no project matches `smoke.spec.ts` there), so the full
 * gate's coverage + project count stay unchanged.
 */
async function open(browser: Browser, role: 'owner' | 'student' | null, locale = 'en') {
  const ctx = await browser.newContext(role ? { storageState: ROLES[role].storage, locale } : { locale })
  return { ctx, page: await ctx.newPage() }
}

test.describe('SMOKE · critical-path subset', () => {
  test('staff dashboard loads', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'owner')
    try {
      const resp = await page.goto('/en/today')
      expect(resp?.status() ?? 0, '/today responds OK').toBeLessThan(400)
      await expect(vis(page, '[data-testid="horizon-switcher"]').first(), 'staff dashboard renders').toBeVisible({ timeout: 15_000 })
    } finally { await ctx.close() }
  })

  test('member portal loads', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'student')
    try {
      const resp = await page.goto('/en/portal/billing')
      expect(resp?.status() ?? 0, '/portal/billing responds OK').toBeLessThan(400)
      await expect(page.locator('body'), 'portal renders').toBeVisible({ timeout: 15_000 })
    } finally { await ctx.close() }
  })

  test('public landing loads', async ({ browser }) => {
    const { ctx, page } = await open(browser, null)
    try {
      const resp = await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
      expect(resp?.status() ?? 0, 'landing responds OK').toBeLessThan(400)
      await expect(page.locator('[data-testid="pricing-plans"]'), 'live catalog renders').toBeVisible({ timeout: 15_000 })
    } finally { await ctx.close() }
  })

  test('billing write happy-path (issue an invoice)', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'owner')
    try {
      await page.goto('/en/invoices/new')
      const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
      expect(karim, 'Karim in the member dropdown').toBeTruthy()
      await vis(page, '[data-testid="inv-student"]').selectOption(karim!)
      await vis(page, '[data-testid="inv-type"]').selectOption('membership')
      await vis(page, '[data-testid="inv-amount-usd"]').fill('20')
      await vis(page, '[data-testid="issue-submit"]').click()
      await expect(vis(page, '[data-testid="invoice-number"]'), 'invoice issued + detail renders').toBeVisible({ timeout: 15_000 })
    } finally { await ctx.close() }
  })

  test('/ar dashboard is localized (no missing keys)', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'owner', 'ar')
    try {
      const resp = await page.goto('/ar/today')
      expect(resp?.status() ?? 0, '/ar/today responds OK').toBeLessThan(400)
      await expect(vis(page, '[data-testid="horizon-switcher"]').first(), '/ar dashboard renders').toBeVisible({ timeout: 15_000 })
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
    } finally { await ctx.close() }
  })
})
