import { test, expect } from '@playwright/test'

/**
 * PRAXELLA-BRAND-IMPL — the (marketing) apex serves the PRAXELLA vendor marketing
 * page (rebuilt to the approved design) when the request resolves as a vendor
 * request (Host ∈ vendor hosts, or ?vendor=1 preview), and the CURRENT tenant/
 * DEFAULT landing otherwise (zero prod behavior change on the Railway host). Asserts:
 *   · ?vendor=1 → the Praxella brand lockup + the full section anatomy (hero week
 *     board · verticals · Operations trio · Portals phones · Region trio ·
 *     White-label browsers · the real request-demo form), and NO tenant catalog
 *     (hero-gym-name / disciplines / plans) leaks in;
 *   · no flag → the apex still renders the Proline/DEFAULT tenant landing, and the
 *     vendor page is absent (no regression).
 * On /en (the vendor page is host/param-resolved, gym-independent — /en avoids the
 * /ar localized-dropdown gotchas).
 *
 * NOTE: named vendor.spec.ts (not *landing.spec.ts) so the `landing` project's
 * unanchored /landing\.spec\.ts/ testMatch does not also pick it up.
 */
test('PRAXELLA-BRAND-IMPL · ?vendor=1 renders the Praxella design, no tenant catalog', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // anon — the vendor page is public
  const page = await ctx.newPage()
  try {
    await page.goto('/en?vendor=1')

    await expect(page.getByTestId('vendor-hero')).toBeVisible({ timeout: 15_000 })
    // The nav brand lockup = the Praxella wordmark (PraxellaLogo), not a gym.
    await expect(page.getByTestId('vendor-nav-name'), 'the Praxella lockup renders')
      .toContainText(/Praxella/i)
    await expect(page.getByTestId('vendor-nav-cta')).toBeVisible()
    await expect(page.getByTestId('vendor-cta')).toBeVisible()

    // Hero week board + verticals strip.
    await expect(page.getByTestId('vendor-board')).toBeVisible()
    await expect(page.getByTestId('vendor-verticals')).toBeVisible()

    // Operations trio (signups · schedule · PT) as three alternating splits.
    await expect(page.getByTestId('vendor-ops')).toBeVisible()
    await expect(page.getByTestId('vendor-ops-split'), 'three operations splits').toHaveCount(3)
    await expect(page.locator('[data-testid="vendor-ops-split"][data-op="pt"]')).toBeVisible()

    // Portals (two phones) · Region (three cards) · White-label (two browsers).
    await expect(page.getByTestId('vendor-portals')).toBeVisible()
    await expect(page.getByTestId('vendor-phone'), 'member + coach portal phones').toHaveCount(2)
    await expect(page.getByTestId('vendor-region')).toBeVisible()
    await expect(page.getByTestId('vendor-tcard'), 'three region cards').toHaveCount(3)
    await expect(page.getByTestId('vendor-wl')).toBeVisible()
    await expect(page.getByTestId('vendor-browser'), 'two white-label browser mockups').toHaveCount(2)

    // The demo section is the REAL submit_platform_lead form (unchanged).
    await expect(page.getByTestId('vendor-demo')).toBeVisible()
    await expect(page.getByTestId('vendor-demo-form')).toBeVisible()

    // NO tenant catalog leaks onto the vendor page.
    await expect(page.getByTestId('hero-gym-name'), 'no tenant hero on the vendor page').toHaveCount(0)
    await expect(page.getByTestId('discipline-card'), 'no tenant disciplines').toHaveCount(0)
    await expect(page.getByTestId('pricing-plans'), 'no tenant membership plans').toHaveCount(0)
    await expect(page.getByTestId('landing-jsonld'), 'no tenant JSON-LD').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('VENDOR-LANDING · without the flag the apex still renders the tenant/DEFAULT landing', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en') // apex, no ?vendor, unmapped host → DEFAULT_GYM_SLUG (Proline)

    // The tenant hero renders (no regression to the current apex behavior).
    await expect(page.getByTestId('hero-gym-name'), 'apex still serves the tenant/default landing')
      .toBeVisible({ timeout: 15_000 })
    // …and the vendor page is NOT rendered.
    await expect(page.getByTestId('vendor-hero'), 'no vendor page without the flag').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
