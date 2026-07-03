import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * DOUBLE-SHELL — the staff (dashboard) mounts every page ONCE (audit P1 #1).
 *
 * The old layout rendered {children} twice (mobile + desktop shells) → double
 * data-fetch/polling (two NotificationBells), duplicate DOM ids (two
 * #pay-amount-usd on invoice detail), double offline listeners. These tests
 * assert the SINGLE-MOUNT REALITY — element COUNTS across the whole DOM (not
 * :visible-scoped), which the double shell made 2 — on BOTH viewports:
 *   · exactly ONE <main> and ONE mounted notification bell
 *   · exactly ONE #pay-amount-usd on invoice detail
 *   · the key staff flows (today / money / students / leads) still render.
 */
async function ownerCtx(browser: Browser, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({
    storageState: ROLES.owner.storage,
    locale: 'en',
    ...(viewport ? { viewport } : {}),
  })
  return { ctx, page: await ctx.newPage() }
}

test('DOUBLE-SHELL · desktop: one main + one bell across key flows; ONE #pay-amount-usd on invoice detail', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await ownerCtx(browser) // default desktop viewport
  try {
    // ── Key flows: the page subtree exists ONCE (main) with ONE mounted bell ──
    const flows: Array<{ path: string; marker: string }> = [
      { path: '/en/today', marker: '[data-testid="horizon-switcher"]' },
      { path: '/en/money', marker: '[data-testid="money-tabs"]' },
      { path: '/en/students', marker: '[data-testid="student-card"]' },
      { path: '/en/leads', marker: '[data-testid="add-lead-button"]' },
    ]
    for (const { path: route, marker } of flows) {
      await page.goto(route)
      await expect(vis(page, marker).first(), `${route} renders`).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('main'), `${route}: children mounted ONCE (one <main>)`).toHaveCount(1)
      await expect(page.locator('[data-testid="notification-bell"]'),
        `${route}: exactly ONE mounted bell (single poll/realtime channel)`).toHaveCount(1, { timeout: 15_000 })
    }

    // ── Invoice detail: the duplicate-id case. Issue a fresh invoice → detail ──
    await page.goto('/en/invoices/new')
    const student = vis(page, '[data-testid="inv-student"]').first()
    await expect(student).toBeVisible({ timeout: 15_000 })
    await student.selectOption({ index: 1 }) // first real member
    await vis(page, '[data-testid="inv-amount-usd"]').first().fill('5')
    await vis(page, '[data-testid="issue-submit"]').first().click()
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(vis(page, '[data-testid="pay-submit"]').first(), 'pay form renders').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#pay-amount-usd'),
      'ONE #pay-amount-usd in the whole DOM (was 2 — duplicate id)').toHaveCount(1)
    await expect(page.locator('main'), 'invoice detail: one <main>').toHaveCount(1)
  } finally {
    await ctx.close()
  }
})

test('DOUBLE-SHELL · mobile (390×844): one main + one bell; today + students render with the native chrome', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser, { width: 390, height: 844 })
  try {
    await page.goto('/en/today')
    await expect(page.locator('main'), 'mobile: children mounted ONCE').toHaveCount(1)
    await expect(page.locator('[data-testid="notification-bell"]'),
      'mobile: exactly ONE mounted bell').toHaveCount(1, { timeout: 15_000 })

    await page.goto('/en/students')
    await expect(vis(page, '[data-testid="student-card"]').first(), 'students renders on mobile').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('main'), 'students mobile: one <main>').toHaveCount(1)
    await expect(page.locator('[data-testid="notification-bell"]'), 'still one bell').toHaveCount(1, { timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})
