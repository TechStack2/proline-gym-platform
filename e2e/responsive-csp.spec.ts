import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * RESPONSIVE-CSP-HARDENING — the staff/portal shells + calendar views are
 * responsive under the prod CSP:
 *   (a) /schedule day view survives a mobile-resize toggle WITHOUT freezing (the
 *       NativeHeader IntersectionObserver setState is equality-guarded; the
 *       day-view cells are de-inlined), and the cells render their color via the
 *       nonce'd <style> (a refused style → transparent);
 *   (b) at 800px (the former md–lg dead zone) nav is reachable (mobile TabBar);
 *   (c) <lg shows the TabBar, ≥lg shows the Sidebar (no regression);
 *   (d) the portal schedule at mobile is likewise freeze-free (shared NativeHeader).
 *
 * NOTE on CSP: a broad "no console CSP error" assertion is NOT viable on the
 * dashboard — it has PRE-EXISTING inline-style violations (next/image `fill` etc.)
 * outside this slice's file list. The de-inline of THIS slice's cells is proven by
 * the cells rendering their color under the prod CSP (a blocked <style> → unset).
 * /en, real staff/member sessions.
 */
async function staffPage(browser: Browser, width: number) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', viewport: { width, height: 860 } })
  return { ctx, page: await ctx.newPage() }
}

test('RESPONSIVE-CSP · schedule day view survives mobile-resize (no freeze) + cells de-inlined CSP-safely', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await staffPage(browser, 1024)
  try {
    await page.goto('/en/schedule?view=day')
    await expect(page.getByTestId('schedule-views'), 'the schedule day view renders').toBeVisible({ timeout: 20_000 })
    // The bug was an infinite render loop (NativeHeader observer + the day-view's
    // formerly-inline cells) that FROZE the tab. Toggle across the lg breakpoint; a
    // frozen tab makes the final assertion time out. (setViewportSize is a CDP
    // command → it completes even if page JS is pegged, so a freeze surfaces here.)
    for (const w of [390, 1024, 390, 1024, 390]) {
      await page.setViewportSize({ width: w, height: 860 })
      await page.waitForTimeout(350)
    }
    await expect(page.getByTestId('schedule-views'), 'the day view stays responsive after the resize toggle (no freeze)')
      .toBeVisible({ timeout: 10_000 })

    // The day-view cells are DE-INLINED: their discipline color now comes from a
    // NONCE'D <style> + data-cellbg (was inline style={{ backgroundColor }}, stripped
    // by the prod CSP). A REFUSED <style> → transparent. The week grid has
    // reliably-seeded colored class chips (same nonce'd <style>).
    await page.goto('/en/schedule')
    const chip = page.getByTestId('week-chip').first()
    await expect(chip, 'the week grid renders colored class chips').toBeVisible({ timeout: 15_000 })
    const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, 'the de-inlined cell renders its color (the nonced <style> was applied under the prod CSP)').not.toBe('rgba(0, 0, 0, 0)')
  } finally {
    await ctx.close()
  }
})

test('RESPONSIVE-CSP · nav is reachable at 800px (the former md–lg dead zone)', async ({ browser }) => {
  const { ctx, page } = await staffPage(browser, 800)
  try {
    await page.goto('/en/today')
    // The shell now uses the MOBILE chrome below lg → the bottom TabBar is the nav
    // (was: desktop Header whose hamburger targeted a hard-hidden Sidebar = no nav).
    await expect(page.getByTestId('native-large-title').first(), 'the mobile shell is active at 800px').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tablist').first(), 'the bottom tab bar (reachable nav) is present').toBeVisible()
    await expect(page.getByTestId('desktop-sidebar'), 'the desktop Sidebar is NOT shown at 800px').toBeHidden()
  } finally {
    await ctx.close()
  }
})

test('RESPONSIVE-CSP · <lg shows the TabBar, ≥lg shows the Sidebar (no regression)', async ({ browser }) => {
  const { ctx, page } = await staffPage(browser, 390)
  try {
    await page.goto('/en/today')
    await expect(page.getByTestId('native-large-title').first(), 'mobile shell at 390px').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tablist').first(), 'the bottom TabBar at 390px').toBeVisible()
    await expect(page.getByTestId('desktop-sidebar'), 'no Sidebar at 390px').toBeHidden()

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('desktop-sidebar'), 'the Sidebar at 1280px').toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('native-large-title'), 'no mobile large title at 1280px').toBeHidden()
  } finally {
    await ctx.close()
  }
})

test('RESPONSIVE-CSP · portal schedule at mobile — no freeze (shared NativeHeader)', async ({ browser }) => {
  test.setTimeout(75_000)
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, locale: 'en', viewport: { width: 390, height: 860 } })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/portal/schedule')
    await expect(page.getByTestId('native-large-title').first(), 'the portal schedule renders at mobile').toBeVisible({ timeout: 20_000 })
    for (const w of [1024, 390, 1024, 390]) {
      await page.setViewportSize({ width: w, height: 860 })
      await page.waitForTimeout(300)
    }
    await expect(page.getByTestId('native-large-title').first(), 'the portal stays responsive (no freeze)').toBeVisible({ timeout: 10_000 })
  } finally {
    await ctx.close()
  }
})
