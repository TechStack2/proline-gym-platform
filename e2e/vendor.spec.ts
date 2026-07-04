import { test, expect } from '@playwright/test'

/**
 * VENDOR-LANDING (Phase 4, WL-ready) — the (marketing) apex serves the Gym 360 Pro
 * VENDOR product page when the request resolves as a vendor request (Host ∈
 * VENDOR_LANDING_HOSTS, or ?vendor=1 preview), and the CURRENT tenant/DEFAULT
 * landing otherwise (zero prod behavior change — VENDOR_LANDING_HOSTS defaults
 * empty). Asserts:
 *   · ?vendor=1 → the vendor hero + nine-pillar feature grid + pricing render,
 *     and NO tenant catalog (hero-gym-name / disciplines / plans) leaks in;
 *   · no flag → the apex still renders the Proline/DEFAULT tenant landing, and the
 *     vendor page is absent (no regression).
 * On /en (the vendor page is host/param-resolved, gym-independent — /en avoids the
 * /ar localized-dropdown gotchas).
 *
 * NOTE: named vendor.spec.ts (not vendor-landing) so the `landing` project's
 * unanchored /landing\.spec\.ts/ testMatch does not also pick it up.
 */
test('VENDOR-LANDING · ?vendor=1 renders the Gym 360 Pro page, no tenant catalog', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // anon — the vendor page is public
  const page = await ctx.newPage()
  try {
    await page.goto('/en?vendor=1')

    // The vendor hero = the product name (not a gym).
    await expect(page.getByTestId('vendor-hero-name'), 'the vendor product name renders')
      .toHaveText(/Gym 360 Pro/, { timeout: 15_000 })
    await expect(page.getByTestId('vendor-hero')).toBeVisible()

    // The nine platform pillars render as the feature grid.
    await expect(page.getByTestId('vendor-features')).toBeVisible()
    await expect(page.getByTestId('vendor-feature-card'), 'nine platform pillars').toHaveCount(9)
    // Real (not placeholder-generic) content — e.g. the dual-currency billing pillar.
    await expect(page.locator('[data-testid="vendor-feature-card"][data-pillar="billing"]')).toBeVisible()

    // Pricing teaser + its explicit placeholder marker.
    await expect(page.getByTestId('vendor-pricing')).toBeVisible()
    await expect(page.getByTestId('vendor-pricing-placeholder'), 'pricing is clearly marked placeholder').toBeVisible()
    await expect(page.getByTestId('vendor-tier')).toHaveCount(3)
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
