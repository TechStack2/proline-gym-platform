import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/**
 * MEMBER360-PORTAL — the member's own drillable premium 360 hub (portal home).
 * Closes the Portal Elevation arc (Coach-360 was the first build). Proves, against
 * the ephemeral TI gym (student@ = Karim; parent = Rana the guardian):
 *  1. the home renders the five 360 cards (Membership · Billing · PT · Belt ·
 *     Classes+attendance) with the brand portal kit;
 *  2. RECONCILE — the Billing open-invoice rows sum to the balance headline, and
 *     the attendance drill rows count to the Classes headline;
 *  3. DRILL — each card → its tab (billing / pt / progress / classes / schedule);
 *  4. guardian kid-switcher (B3) + waivers + camps still render (no regression);
 *  5. /ar RTL-clean (no MISSING_MESSAGE / unresolved keys).
 * Read-only: the hub issues no writes. Every wait is bounded (a hung wait would
 * kill the serial suite); the project testMatch is anchored to this exact file.
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test.describe.serial('MEMBER360-PORTAL · member drillable 360 hub', () => {
  test('hub renders the 360 cards, reconciles billing + attendance, and drills', async ({ browser }) => {
    test.setTimeout(120_000)
    const { ctx, page } = await ctxFor(browser, 'student')
    try {
      await page.goto('/en/portal')
      const hub = vis(page, '[data-testid="self-view"]').first()
      await expect(hub, 'the Member-360 hub renders').toBeVisible({ timeout: 15_000 })

      // the five 360 surfaces (ActionCards carry footers → always rendered)
      await expect(vis(page, '[data-testid="card-membership"]').first(), 'Membership card').toBeVisible()
      await expect(vis(page, '[data-testid="card-billing"]').first(), 'Billing card').toBeVisible()
      await expect(vis(page, '[data-testid="card-pt"]').first(), 'PT card').toBeVisible()
      await expect(vis(page, '[data-testid="card-belt"]').first(), 'Belt card').toBeVisible()
      await expect(vis(page, '[data-testid="card-portal-recent-attendance"]').first(), 'Classes+attendance card').toBeVisible()

      // preserved IA-2 self-view fields, nested under self-view
      await expect(hub.getByTestId('self-membership').first(), 'self-membership preserved').toBeVisible()
      await expect(hub.getByTestId('self-pt-remaining').first(), 'self-pt-remaining preserved').toBeVisible()
      await expect(hub.getByTestId('self-next-class').first(), 'self-next-class preserved').toBeVisible()

      // RECONCILE (billing): open-invoice rows sum to the balance headline. Karim is a
      // SHARED fixture that ml1 mutates concurrently (issues/pays a renewal invoice), so a
      // single SSR snapshot can catch the balance headline and the open-invoice rows
      // mid-mutation and drift by an invoice. Re-fetch a FRESH snapshot and re-reconcile
      // until they agree — the shared-fixture sibling of the awaitEffect idiom (the "poll"
      // option: this test owns no single committed effect, the write comes from ml1).
      await untilConsistent(async () => {
        await page.goto('/en/portal')
        const billing = vis(page, '[data-testid="card-billing"]').first()
        const billingCount = Number(await billing.getAttribute('data-count'))
        if (billingCount === 0) return
        await vis(page, '[data-testid="billing-drill"]').first().locator('summary').click()
        const rows = page.locator('[data-testid="billing-row"]:visible')
        const n = await rows.count()
        let sum = 0
        for (let i = 0; i < n; i++) sum += Number((await rows.nth(i).getAttribute('data-v')) || 0)
        const balTxt = (await vis(page, '[data-testid="billing-balance"]').first().innerText()).replace(/[^0-9.]/g, '')
        expect(Math.round(sum), 'billing rows reconcile to the balance').toBe(Math.round(Number(balTxt)))
      })

      // RECONCILE (classes): the attendance drill rows count to the card headline.
      const cls = vis(page, '[data-testid="card-portal-recent-attendance"]').first()
      const clsCount = Number(await cls.getAttribute('data-count'))
      if (clsCount > 0) {
        const drill = vis(page, '[data-testid="portal-attendance-drill"]').first()
        expect(Number(await drill.getAttribute('data-rows')), 'attendance rows reconcile to count').toBe(clsCount)
      }

      // DRILL: each card → its tab.
      const drillCases: [string, RegExp][] = [
        ['membership-open', /\/portal\/billing/],
        ['pt-open', /\/portal\/pt/],
        ['belt-open', /\/portal\/progress/],
        ['classes-open', /\/portal\/classes/],
        ['billing-open', /\/portal\/billing/],
      ]
      for (const [tid, re] of drillCases) {
        await page.goto('/en/portal')
        await vis(page, `[data-testid="${tid}"]`).first().click()
        await expect(page, `${tid} drills to its tab`).toHaveURL(re, { timeout: 15_000 })
      }
    } finally {
      await ctx.close()
    }
  })

  test('guardian kid-switcher (B3) + waivers + camps intact', async ({ browser }) => {
    test.setTimeout(120_000)
    // Guardian (B3): a 2+-kid parent leads with the family overview (GUARDIAN-360);
    // the kid view + switcher are one tap away (no regression).
    const guardian = await ctxFor(browser, 'parent')
    try {
      await guardian.page.goto('/en/portal')
      await expect(vis(guardian.page, '[data-testid="family-overview"]'), 'family overview leads').toBeVisible({ timeout: 15_000 })
      await expect(vis(guardian.page, '[data-testid="kid-switcher"]').first(), 'kid-switcher renders').toBeVisible()
      await vis(guardian.page, '[data-testid="kid-chip"]').first().click()
      await expect(vis(guardian.page, '[data-testid="kid-dashboard"]').first(), 'the selected kid view renders').toBeVisible({ timeout: 15_000 })
      await expect(vis(guardian.page, '[data-testid="kid-name"]').first(), 'kid name renders').toBeVisible()
    } finally {
      await guardian.ctx.close()
    }

    // Member self: the waiver card + camps section still render on the 360 home.
    const { ctx, page } = await ctxFor(browser, 'student')
    try {
      await page.goto('/en/portal')
      await expect(vis(page, '[data-testid="self-view"]').first()).toBeVisible({ timeout: 15_000 })
      await expect(vis(page, '[data-testid="portal-waiver"]').first(), 'waiver card preserved').toBeVisible({ timeout: 15_000 })
      await expect(vis(page, '[data-testid="portal-camps"]').first(), 'camps section preserved').toBeVisible({ timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('/ar hub renders RTL-clean (no missing keys)', async ({ browser }) => {
    const { ctx, page } = await ctxFor(browser, 'student', 'ar')
    try {
      await page.goto('/ar/portal')
      await expect(vis(page, '[data-testid="self-view"]').first(), 'hub renders on /ar').toBeVisible({ timeout: 15_000 })
      await expect(vis(page, '[data-testid="card-billing"]').first()).toBeVisible()
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE').toBe(0)
      expect(await page.locator('text=portalHome.').count(), 'no unresolved portalHome key').toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
