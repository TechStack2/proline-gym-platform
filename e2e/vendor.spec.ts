import { test, expect } from '@playwright/test'

/**
 * PRAXELLA-DOOR — the (marketing) apex serves the PRAXELLA vendor marketing page
 * when the request resolves as a vendor request (Host ∈ vendor hosts, or ?vendor=1
 * preview), and the CURRENT tenant/DEFAULT landing otherwise (zero prod behavior
 * change on the Railway host). Asserts:
 *   · ?vendor=1 → the Praxella hero + nine-pillar feature grid + how-it-works +
 *     request-demo form render, and NO tenant catalog (hero-gym-name / disciplines
 *     / plans) leaks in;
 *   · no flag → the apex still renders the Proline/DEFAULT tenant landing, and the
 *     vendor page is absent (no regression).
 * On /en (the vendor page is host/param-resolved, gym-independent — /en avoids the
 * /ar localized-dropdown gotchas).
 *
 * NOTE: named vendor.spec.ts (not *landing.spec.ts) so the `landing` project's
 * unanchored /landing\.spec\.ts/ testMatch does not also pick it up.
 */
test('PRAXELLA-DOOR · ?vendor=1 renders the Praxella page, no tenant catalog', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // anon — the vendor page is public
  const page = await ctx.newPage()
  try {
    await page.goto('/en?vendor=1')

    // The vendor hero = the platform wordmark (from the PLATFORM_BRAND constant), not a gym.
    await expect(page.getByTestId('vendor-hero-name'), 'the platform wordmark renders')
      .toHaveText(/Praxella/, { timeout: 15_000 })
    await expect(page.getByTestId('vendor-hero')).toBeVisible()

    // The platform pillars render as the feature grid.
    await expect(page.getByTestId('vendor-features')).toBeVisible()
    await expect(page.getByTestId('vendor-feature-card'), 'nine platform pillars').toHaveCount(9)
    // Real (not placeholder-generic) content — e.g. the dual-currency billing pillar.
    await expect(page.locator('[data-testid="vendor-feature-card"][data-pillar="billing"]')).toBeVisible()

    // How-it-works (three steps) + the request-demo form.
    await expect(page.getByTestId('vendor-how')).toBeVisible()
    await expect(page.getByTestId('vendor-how-step'), 'three how-it-works steps').toHaveCount(3)
    await expect(page.getByTestId('vendor-demo')).toBeVisible()
    await expect(page.getByTestId('vendor-demo-form')).toBeVisible()
    // A primary CTA exists.
    await expect(page.getByTestId('vendor-cta')).toBeVisible()

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
