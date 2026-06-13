import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * FIN-1 — Today horizons + owner finances + churn → win-back → reactivation.
 *
 * Drives the FIN-1-OWNED seed fixtures (000051), which are isolated from the
 * ml1 tick/reinstate fixtures (those are mutated by the ml1 spec that runs
 * earlier):
 *   · "Horizon Member" — membership ending +6d + an open invoice due +6d.
 *   · "Dropped Member" — membership lapsed THIS month (lapsed_at set) + an
 *     aged open invoice due -40d (the 31–60 aging bucket).
 *
 * Test order matters within the file (one worker, declaration order): the
 * horizon test reads the Horizon invoice pristine BEFORE the dashboard test
 * pays it for the revenue proof.
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

const money = (s: string) => Number((s.match(/[\d.]+/)?.[0]) ?? '0')

async function openFile(page: Page, name: string) {
  // The students search matches a single field (first/last/phone), not the
  // concatenated full name — search by the first token, filter the card by the
  // rendered full name.
  const q = name.split(' ')[0]
  await page.goto(`/en/students?search=${encodeURIComponent(q)}`)
  await vis(page, '[data-testid="student-card"]').filter({ hasText: name }).first().click()
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
}

test('FIN-1 · horizons re-scope: +6d member in Week+Month not Today; projected collections sum', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    const expiringHas = async () =>
      vis(page, '[data-testid="expiring-row"]').filter({ hasText: 'Horizon Member' }).count()
    const projected = async () =>
      money((await vis(page, '[data-testid="projected-usd"]').first().textContent()) ?? '$0')

    // ── Today (default): the +6d member must NOT appear in expiring ──
    await page.goto('/en/today')
    await expect(vis(page, '[data-testid="horizon-switcher"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="horizon-today"]').first()).toHaveAttribute('data-active', 'true')
    expect(await expiringHas(), 'Horizon Member (+6d) is NOT in the Today expiring lens').toBe(0)
    const projToday = await projected()

    // ── Week: the +6d member appears; projected grows by at least its invoice ──
    await page.goto('/en/today?h=week')
    await expect(vis(page, '[data-testid="horizon-week"]').first()).toHaveAttribute('data-active', 'true')
    expect(await expiringHas(), 'Horizon Member appears in the Week lens').toBeGreaterThanOrEqual(1)
    const projWeek = await projected()
    expect(projWeek, 'Week projected collections includes the +6d invoice ($55.50)')
      .toBeGreaterThanOrEqual(projToday + 55.5 - 0.01)

    // ── Month: still present (cumulative) ──
    await page.goto('/en/today?h=month')
    await expect(vis(page, '[data-testid="horizon-month"]').first()).toHaveAttribute('data-active', 'true')
    expect(await expiringHas(), 'Horizon Member appears in the Month lens').toBeGreaterThanOrEqual(1)
  } finally {
    await ctx.close()
  }
})

test('FIN-1 · owner dashboard: aging buckets the -40d invoice (31–60) + drill-down; revenue buckets a paid membership by product+method', async ({ browser }) => {
  test.setTimeout(150_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    // ── Aging: the seeded -40d open invoice lands in the 31–60 bucket ──
    await page.goto('/en/money')
    await expect(vis(page, '[data-testid="owner-finances"]').first()).toBeVisible({ timeout: 15_000 })
    const bucket = vis(page, '[data-testid="aging-bucket"][data-bucket="d31_60"]').first()
    const agingUsd = money((await bucket.getByTestId('aging-usd').textContent()) ?? '$0')
    expect(agingUsd, 'the -40d invoice ($55.50) ages into 31–60').toBeGreaterThanOrEqual(55.5 - 0.01)

    // Drill-down → the filtered invoice list is non-empty.
    await bucket.click()
    await expect(page).toHaveURL(/tab=invoices&aging=d31_60/, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="invoice-row"]').first(), 'aging drill-down lists the aged invoice')
      .toBeVisible({ timeout: 15_000 })

    // ── Revenue proof: pay the Horizon member's +6d membership invoice (cash
    //    USD, full balance) → it buckets under Membership for the current month
    //    and the method breakdown shows Cash (USD). ──
    await openFile(page, 'Horizon Member')
    await vis(page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
      .first().locator('a').first().click()
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(page, '[data-testid="pay-submit"]').first().click() // full balance, default cash_usd
    await page.waitForTimeout(1500)

    await page.goto('/en/money')
    const mk = new Date().toISOString().slice(0, 7)
    const revRow = vis(page, `[data-testid="revenue-row"][data-month="${mk}"]`).first()
    const memCell = money((await revRow.locator('[data-product="membership"]').textContent()) ?? '$0')
    expect(memCell, 'the paid membership shows under this month\'s Membership revenue').toBeGreaterThanOrEqual(55.5 - 0.01)
    await expect(
      vis(page, '[data-testid="method-row"][data-method="cash_usd"]').first(),
      'method breakdown shows Cash (USD)',
    ).toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('FIN-1 · churn → win-back → reactivation loop (read-time)', async ({ browser }) => {
  test.setTimeout(150_000)
  const { ctx, page } = await ctxFor(browser, 'owner')
  try {
    // ── Churn: the Dropped member lapsed THIS month ──
    await page.goto('/en/money')
    const mk = new Date().toISOString().slice(0, 7)
    const churnRow = vis(page, `[data-testid="churn-row"][data-month="${mk}"]`).first()
    expect(
      Number(await churnRow.getByTestId('churn-lapsed').textContent()),
      'this month shows at least one lapsed membership',
    ).toBeGreaterThanOrEqual(1)

    // ── Win-back queue: the Dropped member is present, churned (not reactivated) ──
    await page.goto('/en/money?tab=winback')
    const row = vis(page, '[data-testid="winback-row"]').filter({ hasText: 'Dropped Member' }).first()
    await expect(row, 'lapsed member appears in the win-back queue').toBeVisible({ timeout: 15_000 })
    await expect(row).toHaveAttribute('data-reactivated', 'false')

    // Log an outcome + a next-action date of TODAY (so it lands in Today's horizon).
    const today = new Date().toISOString().slice(0, 10)
    await row.getByTestId('winback-log-toggle').click()
    await row.locator('[data-testid="winback-outcome-chip"][data-value="promised_visit"]').click()
    await row.getByTestId('winback-note').fill('FIN-1 e2e — promised to drop by')
    await row.getByTestId('winback-next-date').fill(today)
    await row.getByTestId('winback-log-submit').click()
    await expect(
      vis(page, '[data-testid="winback-row"]').filter({ hasText: 'Dropped Member' }).first().getByTestId('winback-last-outcome'),
      'the logged outcome shows on the row',
    ).toBeVisible({ timeout: 15_000 })

    // ── Win-back-due card carries it (next_action_date == today) ──
    await page.goto('/en/today')
    await expect(
      vis(page, '[data-testid="winback-due-row"]').filter({ hasText: 'Dropped Member' }).first(),
      'the win-back-due card carries the followup due today',
    ).toBeVisible({ timeout: 15_000 })

    // ── Reactivate via the ML-1 reinstate flow → queue row flips reactivated ──
    await openFile(page, 'Dropped Member')
    await vis(page, '[data-testid="ms-reinstate"]').first().click()
    await page.waitForTimeout(1500)
    await page.goto('/en/money?tab=winback')
    await expect(
      vis(page, '[data-testid="winback-row"]').filter({ hasText: 'Dropped Member' }).first(),
      'reinstated member still listed',
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      vis(page, '[data-testid="winback-row"]').filter({ hasText: 'Dropped Member' }).first(),
      'read-time reactivation flips the row',
    ).toHaveAttribute('data-reactivated', 'true', { timeout: 15_000 })
    await expect(
      vis(page, '[data-testid="winback-row"]').filter({ hasText: 'Dropped Member' }).first().getByTestId('winback-reactivated'),
    ).toBeVisible()
  } finally {
    await ctx.close()
  }
})
