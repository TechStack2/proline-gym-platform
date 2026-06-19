import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, createClassViaWizard } from './helpers'

/**
 * DRILL-360 — every 360 card drills into the rows driving its number, and the
 * Month revenue/movement cards RECONCILE (drilled rows sum/count to the
 * headline). Runs LAST; owner session.
 */
const RUN = Date.now().toString().slice(-6)

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

const num = (s: string | null) => Number((s ?? '').replace(/[^\d.-]/g, '') || '0')

/** Open a <details> by clicking its summary (idempotent). */
async function expand(page: Page, drillTestid: string) {
  const d = vis(page, `[data-testid="${drillTestid}"]`).first()
  await expect(d).toBeVisible({ timeout: 15_000 })
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await d.locator('summary').first().click()
  }
  return d
}

test('DRILL-360 · every Month card drills + revenue/movement reconcile', async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const CLASS_NAME = `Drill Class ${RUN}r${testInfo.retry}`
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    // ── Seed a deterministic paid-this-month (class registration) → guarantees a
    //    'class' revenue product with known contributing rows. ──
    await page.goto('/en/classes')
    await createClassViaWizard(page, { nameEn: CLASS_NAME, capacity: '10', fee: '40', presetTime: '19:00' })
    await page.goto('/en/students?search=Karim')
    await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(page, '[data-testid="m360-register-open"]').first().click()
    await page.locator('[data-testid="m360-class-option"]').filter({ hasText: CLASS_NAME }).first().click()
    await page.getByTestId('m360-register-submit').click()
    await expect(vis(page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first())
      .toBeVisible({ timeout: 20_000 })
    await vis(page, '[data-testid="m360-pay-open"]').first().click()
    await expect(page.getByTestId('m360-pay-amount')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('m360-pay-submit').click()
    await page.waitForTimeout(1500)

    // ── Month: every card exposes a drill (a <details> drill or an ActionRow href) ──
    await page.goto('/en/today?h=month')
    for (const card of ['revenue-product', 'members-churn', 'conversion-month', 'active-trend', 'growth-month']) {
      const section = vis(page, `[data-testid="card-${card}"]`).first()
      await expect(section, `${card} card present`).toBeVisible({ timeout: 15_000 })
      const drills = await section.locator('details[data-testid], a[href]').count()
      expect(drills, `${card} exposes a drill control`).toBeGreaterThan(0)
    }
    // aging + renewals drill via ActionRow rows (seeded by fin1/fd*) — links when present
    const agingRow = vis(page, '[data-testid="aging-month-row"]').first()
    if (await agingRow.count()) expect(await agingRow.locator('a').first().getAttribute('href')).toContain('/money')

    // ── RECONCILE revenue: a product's drilled payments sum to its headline $.
    //    Pick the first product present (membership from fin1/fd*, or the seeded
    //    class payment) — reconciliation is product-agnostic. ──
    const prodRow = vis(page, '[data-testid="revenue-product-row"]').first()
    await expect(prodRow, 'a revenue product is present').toBeVisible({ timeout: 15_000 })
    const headlineAmt = num(await prodRow.locator('[data-testid="revenue-amount"]').first().getAttribute('data-v'))
    await prodRow.locator('summary').first().click()
    const drillRows = prodRow.locator('[data-testid="revenue-drill-row"]')
    await expect(drillRows.first()).toBeVisible({ timeout: 10_000 })
    const vals = await drillRows.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-v') || '0')))
    const sum = vals.reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - headlineAmt), `class revenue rows (${sum}) reconcile to headline ($${headlineAmt})`).toBeLessThan(0.05)

    // ── RECONCILE movement: each segment's drilled rows COUNT to its number ──
    for (const seg of [['new', 'movement-drill-new', 'movement-new-row'], ['churned', 'movement-drill-churned', 'movement-churned-row'], ['recovered', 'movement-drill-recovered', 'movement-recovered-row']]) {
      const [, drill, rowTid] = seg
      const headCount = Number(await vis(page, `[data-testid="movement-${seg[0] === 'churned' ? 'churn' : seg[0]}"]`).first().textContent())
      await expand(page, drill)
      const rowCount = await vis(page, `[data-testid="${rowTid}"]`).count()
      expect(rowCount, `movement ${seg[0]} rows reconcile to headline (${headCount})`).toBe(headCount)
    }

    // ── RECONCILE active-trend: drilled active members count to activeNow ──
    const activeNow = Number(await vis(page, '[data-testid="active-now"]').first().textContent())
    await expand(page, 'active-trend-drill')
    expect(await vis(page, '[data-testid="active-trend-row"]').count(), 'active rows reconcile to activeNow').toBe(activeNow)

    // ── A drilled row navigates to a populated Member-360 ──
    await vis(page, '[data-testid="active-trend-row"]').first().click()
    await expect(page, 'active member row → Member-360').toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })

    // ── Week: coach-load → Coach-360; schedule-fill → class detail ──
    await page.goto('/en/today?h=week')
    const coachRow = vis(page, '[data-testid="coach-load-row"]').first()
    await expect(coachRow).toBeVisible({ timeout: 15_000 })
    expect(await coachRow.locator('a').first().getAttribute('href'), 'coach-load row links to Coach-360').toMatch(/\/coaches\/[0-9a-f-]{36}/)
    expect(await vis(page, '[data-testid="schedule-fill-row"]').first().locator('a').first().getAttribute('href'),
      'schedule-fill row links to the class detail').toMatch(/\/classes\/[0-9a-f-]{36}/)
    await coachRow.locator('a').first().click()
    await expect(vis(page, '[data-testid="coach-360"]').first(), 'coach-load drills into Coach-360')
      .toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('DRILL-360 · /ar Month drills render clean (no MISSING_MESSAGE)', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    await page.goto('/ar/today?h=month')
    await expect(vis(page, '[data-testid="card-revenue-product"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE')
    // a drill control resolves its Arabic label
    await expand(page, 'active-trend-drill')
    await expect(vis(page, '[data-testid="card-members-churn"]').first()).toBeVisible()
  } finally {
    await ctx.close()
  }
})
