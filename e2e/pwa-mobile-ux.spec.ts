import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * PWA-MOBILE-UX — installed-mobile-PWA shell polish.
 *   #2 The bottom NativeTabBar items scale up on Pro-Max-class widths (fixed
 *      22px icon / 10px label looked tiny on the wide flex-1 cells).
 *   #3 The language switcher is exposed in Settings AND the mobile More menu, and
 *      the More menu's tail items are reachable (not clipped by the fold / home
 *      indicator).
 * All frontend/shell — driven at an iPhone Pro Max viewport as the owner.
 */
const PRO_MAX = { width: 430, height: 932 } // iPhone 15/16 Pro Max, CSS px

async function ownerMobile(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', viewport: PRO_MAX })
  return { ctx, page: await ctx.newPage() }
}

test('PWA-MOBILE-UX #2 · bottom tab-bar icons scale up (legible) on Pro-Max-class widths', async ({ browser }) => {
  const { ctx, page } = await ownerMobile(browser)
  try {
    await page.goto('/en/today')
    const tabBar = page.locator('[data-testid="tab-bar"]:visible').first()
    await expect(tabBar, 'the mobile tab bar renders (md:hidden is off at 430px)').toBeVisible({ timeout: 15_000 })
    // The mobile tab icons scale to ~27px at ≥420px (base 22px on small phones).
    const icon = page.locator('[data-testid="tab-bar"]:visible a svg, [data-testid="tab-bar"]:visible button svg').first()
    const box = await icon.boundingBox()
    expect(box, 'a tab icon has a rendered box').not.toBeNull()
    expect(box!.height, 'tab icon is scaled up (legible) on Pro-Max width').toBeGreaterThanOrEqual(26)
  } finally {
    await ctx.close()
  }
})

test('PWA-MOBILE-UX #3 · language switcher in Settings + the mobile More menu (tail reachable), and it switches', async ({ browser }) => {
  const { ctx, page } = await ownerMobile(browser)
  try {
    // ── #3a: Settings exposes the language switcher (ar/en/fr) ──
    await page.goto('/en/settings?tab=gym')
    const langSection = vis(page, '[data-testid="settings-language"]').first()
    await expect(langSection, 'Settings has a Language section').toBeVisible({ timeout: 15_000 })
    await expect(langSection.getByRole('button', { name: 'Français' }), 'FR option in Settings').toBeVisible()
    await expect(langSection.getByRole('button', { name: 'العربية' }), 'AR option in Settings').toBeVisible()

    // ── #3b: the mobile More menu exposes the language switcher at its BOTTOM and
    //    it's reachable (a clipped/hidden row could not be scrolled-to + clicked) ──
    await page.goto('/en/today')
    await page.locator('[data-testid="tab-more"]:visible').first().click()
    const moreLang = vis(page, '[data-testid="more-language"]').first()
    await expect(moreLang, 'the More menu exposes the language switcher').toBeVisible({ timeout: 10_000 })
    await moreLang.scrollIntoViewIfNeeded()
    // Reachable + functional: switching to FR navigates (proves the tail row is not clipped away).
    await moreLang.getByRole('button', { name: 'Français' }).click()
    await expect(page, 'language switch from the mobile menu navigates to /fr').toHaveURL(/\/fr(\/|$)/, { timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})
