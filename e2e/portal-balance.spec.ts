import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/**
 * PORTAL-BALANCE — the member-visible money number is ONE number (audit P1).
 *
 * The portal HOME tile used to sum raw total_usd over ['pending','overdue'] —
 * omitting 'partial' invoices and never netting payments — while portal/billing
 * netted correctly. A part-paid member saw "$0 / settled" on home and a real
 * balance on billing. Both now compute through the shared reconcile helper.
 *
 * Fixture: owner issues Karim $20 (→ $22.20 with 11% TVA), records a $5.20
 * PARTIAL payment → net balance $17.00. Karim must then see:
 *   · a NON-ZERO home balance that INCLUDES the partial invoice, and
 *   · the SAME total on home as the sum of the billing tab's open-row balances,
 *   · the partial invoice's own billing row netted to $17.00.
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

const money = (text: string | null): number => {
  const m = (text ?? '').replace(/[^0-9.]/g, '')
  return m ? parseFloat(m) : NaN
}

test('PORTAL-BALANCE · a part-paid member sees the SAME non-zero balance on the home tile and the billing tab', async ({ browser }) => {
  test.setTimeout(180_000)

  // ── Owner: issue $20 to Karim (→ $22.20 TVA-inclusive) + record a $5.20 partial ──
  const owner = await ctxFor(browser, 'owner')
  let invoiceNumber = ''
  try {
    await owner.page.goto('/en/invoices/new')
    const karim = await owner.page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
    expect(karim, 'Karim in the member dropdown').toBeTruthy()
    await vis(owner.page, '[data-testid="inv-student"]').selectOption(karim!)
    await vis(owner.page, '[data-testid="inv-amount-usd"]').fill('20')
    await vis(owner.page, '[data-testid="issue-submit"]').click()
    await expect(vis(owner.page, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 })
    invoiceNumber = (await vis(owner.page, '[data-testid="invoice-number"]').textContent())!.trim()

    await vis(owner.page, '[data-testid="pay-amount-usd"]').fill('5.20')
    await vis(owner.page, '[data-testid="pay-submit"]').click()
    await expect(vis(owner.page, '[data-testid="invoice-status"]'), 'partial recorded').toHaveText(/Partial/i, { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="invoice-balance"]'), 'staff-side net balance').toHaveText(/17\.00/)
  } finally {
    await owner.ctx.close()
  }

  // ── Karim: home tile vs billing tab — the SAME netted number ──
  const member = await ctxFor(browser, 'student')
  try {
    // HOME: the balance tile counts the partial invoice, netted (would have been
    // $0/settled — 'partial' was excluded — before the fix).
    let homeBalance = NaN
    await untilConsistent(async () => {
      await member.page.goto('/en/portal')
      const text = await vis(member.page, '[data-testid="billing-balance"]').first().textContent()
      homeBalance = money(text)
      expect(Number.isFinite(homeBalance), 'home balance renders a number').toBe(true)
      expect(homeBalance, 'home balance is non-zero (includes the netted partial)').toBeGreaterThanOrEqual(17)
    }, { timeout: 40_000 })

    // BILLING: the partial invoice's own row is netted to $17.00.
    await member.page.goto('/en/portal/billing')
    const partialRow = vis(member.page, `[data-testid="portal-invoice"][data-invoice-number="${invoiceNumber}"]`).first()
    await expect(partialRow, 'the partial invoice row renders').toBeVisible({ timeout: 15_000 })
    await expect(partialRow, 'row is status=partial').toHaveAttribute('data-status', 'partial')
    await expect(partialRow.locator('[data-testid="portal-invoice-balance"]'),
      'billing nets the partial to $17.00').toContainText('$17.00')

    // ONE SOURCE OF TRUTH: home total == Σ of the billing tab's OPEN-row balances.
    const rows = member.page.locator('[data-testid="portal-invoice"]:visible')
    const n = await rows.count()
    let billingSum = 0
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i)
      const status = await row.getAttribute('data-status')
      if (!['pending', 'partial', 'overdue'].includes(status ?? '')) continue
      billingSum += money(await row.locator('[data-testid="portal-invoice-balance"]').textContent())
    }
    expect(Math.abs(billingSum - homeBalance),
      `home tile ($${homeBalance}) equals the billing tab's open balances ($${billingSum.toFixed(2)})`).toBeLessThan(0.011)
  } finally {
    await member.ctx.close()
  }
})
