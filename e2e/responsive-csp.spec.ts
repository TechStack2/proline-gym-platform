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
    // At 800px the reachable nav is the SIDE RAIL, not the bottom bar: the bar is
    // `md:hidden` (≥768) and the rail is `hidden md:flex`. The pre-W1 assertion said
    // `getByRole('tablist').first()`, which matched the rail here — both chrome pieces
    // carried that role. With real nav ARIA the two are addressed separately.
    await expect(page.getByTestId('desktop-rail'), 'the side rail (reachable nav) is present').toBeVisible()
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
    await expect(page.getByTestId('tab-bar').first(), 'the bottom TabBar at 390px').toBeVisible()
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

/**
 * SHELL-OVERLAP-FIX — at md–lg (768–1023px) the staff shell shows NativeTabBar's
 * w-20 side rail (fixed left-0, or right-0 in RTL), but the content wrapper only
 * cleared the w-64 Sidebar at lg (lg:pl-64) → the rail overlapped the content. The
 * fix adds a md-tier clearance (md:pl-20 / md:pr-20) so content clears the rail at
 * md–lg. Portal + coach shells already clear at md (md:ml-20) — unaffected.
 */
test('SHELL-OVERLAP · at 800px content clears the w-20 side rail — LTR + RTL', async ({ browser }) => {
  // LTR: the rail hugs the LEFT edge; the content's left edge must be at/after the
  // rail's right edge (md:pl-20).
  {
    const { ctx, page } = await staffPage(browser, 800)
    try {
      await page.goto('/en/today')
      const rail = page.getByTestId('desktop-rail')
      const title = page.getByTestId('native-large-title').first()
      await expect(rail, 'the w-20 side rail renders at 800px').toBeVisible({ timeout: 15_000 })
      await expect(title, 'the mobile shell title renders at 800px').toBeVisible()
      const railBox = await rail.boundingBox()
      const titleBox = await title.boundingBox()
      expect(railBox && titleBox, 'rail + title are measurable').toBeTruthy()
      expect(railBox!.x, 'the rail is anchored to the left edge').toBeLessThan(8)
      expect(titleBox!.x, 'the title is NOT under the left rail (cleared by md:pl-20)')
        .toBeGreaterThanOrEqual(railBox!.x + railBox!.width - 1)
    } finally {
      await ctx.close()
    }
  }
  // RTL (/ar): the rail flips to the RIGHT edge; the content's right edge must be
  // at/before the rail's left edge (md:pr-20).
  {
    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar', viewport: { width: 800, height: 860 } })
    const page = await ctx.newPage()
    try {
      await page.goto('/ar/today')
      const rail = page.getByTestId('desktop-rail')
      const title = page.getByTestId('native-large-title').first()
      await expect(rail, 'the RTL side rail renders at 800px').toBeVisible({ timeout: 15_000 })
      await expect(title, 'the RTL shell title renders at 800px').toBeVisible()
      const railBox = await rail.boundingBox()
      const titleBox = await title.boundingBox()
      expect(railBox && titleBox, 'rail + title are measurable').toBeTruthy()
      expect(railBox!.x + railBox!.width, 'the rail is anchored to the right edge').toBeGreaterThan(800 - 8)
      expect(titleBox!.x + titleBox!.width, 'the title is NOT under the right rail (cleared by md:pr-20)')
        .toBeLessThanOrEqual(railBox!.x + 1)
    } finally {
      await ctx.close()
    }
  }
})

test('SHELL-OVERLAP · the side rail is absent <md and ≥lg (boundaries unchanged)', async ({ browser }) => {
  // <md: the bottom TabBar is the nav (no left rail → no clearance needed).
  {
    const { ctx, page } = await staffPage(browser, 390)
    try {
      await page.goto('/en/today')
      await expect(page.getByTestId('native-large-title').first(), 'mobile shell at 390px').toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('desktop-rail'), 'no side rail <md (bottom TabBar instead)').toBeHidden()
    } finally {
      await ctx.close()
    }
  }
  // ≥lg: the w-64 Sidebar is the nav; the rail is gone (its wrapper is lg:hidden).
  {
    const { ctx, page } = await staffPage(browser, 1280)
    try {
      await page.goto('/en/today')
      await expect(page.getByTestId('desktop-sidebar'), 'the Sidebar at 1280px').toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('desktop-rail'), 'no side rail ≥lg (Sidebar instead)').toBeHidden()
    } finally {
      await ctx.close()
    }
  }
})
