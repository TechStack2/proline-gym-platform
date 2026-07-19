import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, createClassViaWizard } from './helpers'

/**
 * FD-2 — Today 360: the horizon switcher swaps the entire CARD SET (not a wider
 * window) + the PWA footer fix. Three lenses, three different questions:
 *   Today = run the shift (operational) · Week = plan & chase (tactical) ·
 *   Month = grow & diagnose (strategic).
 *
 * Seeded deterministically per run: FIN-1's "Horizon Member" membership ends
 * +6d (000051) and nothing renews it before this spec → the Week "renewals due
 * this week" card always has a row. This spec also records a payment THIS MONTH
 * (register-to-class + pay, mirroring fd1) → the Month revenue card.
 *
 * Runs LAST (after ax2); owner session; isolated contexts.
 */
const RUN = Date.now().toString().slice(-6)

async function ctxFor(browser: Browser, role: keyof typeof ROLES, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', ...(viewport ? { viewport } : {}) })
  return { ctx, page: await ctx.newPage() }
}

test('FD-2 · horizons render DISTINCT card sets — Today/Week/Month each show period-specific cards', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    // ── TODAY (operational): Money-today is present + labeled "Today"; the
    //    Week-only + Month-only cards are absent from the DOM entirely. ──
    await page.goto('/en/today')
    await expect(vis(page, '[data-testid="horizon-today"]').first()).toHaveAttribute('data-active', 'true')
    await expect(vis(page, '[data-testid="card-money"]').first(), 'Today shows the operational Money-today card').toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('[data-testid="card-classes"]:visible, [data-testid="card-empty-classes"]:visible').first(),
      'Today classes card is labeled "Today"',
    ).toContainText("Today's classes")
    // Week-only + Month-only cards must NOT exist on Today:
    await expect(page.locator('[data-testid="card-schedule-fill"], [data-testid="card-empty-schedule-fill"]'),
      'Week-only "schedule fill" is absent from Today').toHaveCount(0)
    await expect(page.locator('[data-testid="card-renewals-week"], [data-testid="card-empty-renewals-week"]'),
      'Week-only "renewals this week" is absent from Today').toHaveCount(0)
    await expect(page.locator('[data-testid="card-revenue-product"], [data-testid="card-empty-revenue-product"]'),
      'Month-only "revenue by product" is absent from Today').toHaveCount(0)

    // ── WEEK (tactical): the Week-only cards appear; the operational Today
    //    cards and the Month-only cards are gone. Renewals reflect Karim. ──
    await page.goto('/en/today?h=week')
    await expect(vis(page, '[data-testid="horizon-week"]').first()).toHaveAttribute('data-active', 'true')
    await expect(vis(page, '[data-testid="card-schedule-fill"]').first(), 'Week shows the schedule-fill card').toBeVisible({ timeout: 15_000 })
    expect(await vis(page, '[data-testid="renewals-week-row"]').count(),
      'a renewal is due THIS WEEK (Horizon Member ends +6d)').toBeGreaterThanOrEqual(1)
    await expect(page.locator('[data-testid="card-money"]'), 'operational Money-today is absent from Week').toHaveCount(0)
    await expect(page.locator('[data-testid="card-revenue-product"], [data-testid="card-empty-revenue-product"]'),
      'Month-only "revenue by product" is absent from Week').toHaveCount(0)

    // ── MONTH (strategic): the Month-only cards appear; the Week-only and
    //    operational cards are gone. ──
    await page.goto('/en/today?h=month')
    await expect(vis(page, '[data-testid="horizon-month"]').first()).toHaveAttribute('data-active', 'true')
    await expect(vis(page, '[data-testid="card-revenue-product"]').first(), 'Month shows the revenue-by-product card').toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="card-members-churn"]').first(), 'Month shows the new-vs-churn card').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="card-schedule-fill"], [data-testid="card-empty-schedule-fill"]'),
      'Week-only "schedule fill" is absent from Month').toHaveCount(0)
    await expect(page.locator('[data-testid="card-money"]'), 'operational Money-today is absent from Month').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('FD-2 · data correctness: a paid-this-month surfaces in Month revenue; renewals project this week', async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const CLASS_NAME = `FD2 Class ${RUN}r${testInfo.retry}`
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    // ── Seed a paid-this-month: register Karim to a fresh class (issues an open
    //    invoice) then pay it (a payment dated today → this month, product=class). ──
    await page.goto('/en/classes')
    await createClassViaWizard(page, { nameEn: CLASS_NAME, capacity: '10', fee: '40', presetTime: '19:00' })

    await page.goto('/en/students?search=Karim')
    await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })

    await vis(page, '[data-testid="m360-register-open"]').first().click()
    await page.locator('[data-testid="m360-class-option"]').filter({ hasText: CLASS_NAME }).first().click()
    await page.getByTestId('m360-register-submit').click()
    await expect(
      vis(page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first(),
      'registration lands active on the file',
    ).toBeVisible({ timeout: 20_000 })

    await vis(page, '[data-testid="m360-pay-open"]').first().click()
    const amount = page.getByTestId('m360-pay-amount')
    await expect(amount).toBeVisible({ timeout: 15_000 })
    const paid = parseFloat(await amount.inputValue())
    expect(paid, 'pay modal pre-fills an open balance').toBeGreaterThan(0)
    await page.getByTestId('m360-pay-submit').click()
    await expect(
      vis(page, '[data-testid="member-payment-row"]').filter({ hasText: `$${paid.toFixed(2)}` }).first(),
      'the payment lands on the file',
    ).toBeVisible({ timeout: 20_000 })

    // ── Month: the revenue-by-product card reflects a paid-this-month ──
    await page.goto('/en/today?h=month')
    await expect(vis(page, '[data-testid="card-revenue-product"]').first()).toBeVisible({ timeout: 15_000 })
    expect(await vis(page, '[data-testid="revenue-product-row"]').count(),
      'Month revenue buckets at least one product (a paid-this-month exists)').toBeGreaterThanOrEqual(1)

    // ── Week: renewals due this week project collectable revenue ──
    await page.goto('/en/today?h=week')
    const projText = (await vis(page, '[data-testid="renewals-week-projected"]').first().textContent()) ?? '$0'
    const projected = Number(projText.match(/[\d.]+/)?.[0] ?? '0')
    expect(projected, 'Week renewals project revenue (memberships/class regs ending this week)').toBeGreaterThan(0)
  } finally {
    await ctx.close()
  }
})

test('FD-2 · PWA footer: the last Today card clears the fixed mobile tab bar', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ctxFor(browser, 'owner', { width: 390, height: 740 })
  try {
    await page.goto('/en/today')
    // pt-refill is always the last card in the Today stack (populated or collapsed).
    const lastCard = page.locator('[data-testid="card-pt-refill"]:visible, [data-testid="card-empty-pt-refill"]:visible').first()
    await expect(lastCard).toBeVisible({ timeout: 15_000 })
    const bar = page.locator('[data-testid="tab-bar"]:visible').first()
    await expect(bar).toBeVisible({ timeout: 15_000 })

    // Scroll the dashboard content container to the very bottom, then nudge back
    // up: W1-FOUNDATION §2.2 hides the bar on scroll-DOWN, and this assertion is
    // about the content's bottom PADDING, so it must measure against a bar that is
    // actually parked at the bottom edge.
    await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = m.scrollHeight })
    await page.waitForTimeout(400)
    await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = Math.max(0, m.scrollTop - 120) })
    await page.waitForTimeout(500)

    const barBox = await bar.boundingBox()
    const cardBox = await lastCard.boundingBox()
    expect(barBox && cardBox).toBeTruthy()
    // With the FD-2 bottom padding, the last card's bottom sits ABOVE the bar's
    // top even at max scroll (pre-fix it hid behind the fixed bar).
    expect(cardBox!.y + cardBox!.height, 'last Today card clears the tab bar').toBeLessThanOrEqual(barBox!.y + 2)
  } finally {
    await ctx.close()
  }
})

test('FD-2 · /ar renders the Week + Month lenses with no missing messages', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    for (const h of ['', '?h=week', '?h=month']) {
      await page.goto(`/ar/today${h}`)
      await expect(vis(page, '[data-testid="horizon-switcher"]').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('body'), `/ar/today${h} has no MISSING_MESSAGE`).not.toContainText('MISSING_MESSAGE')
    }
    // The Arabic Month strategic card title resolves (not a raw key).
    await expect(vis(page, '[data-testid="card-revenue-product"]').first()).toContainText('إيراد', { timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})
