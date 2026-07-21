import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * RESPONSIVE-CSP-HARDENING — the staff/portal shells + calendar views are
 * responsive under the prod CSP:
 *   (a) /schedule day view survives a mobile-resize toggle WITHOUT freezing (the
 *       NativeHeader IntersectionObserver setState is equality-guarded; the
 *       day-view cells are de-inlined), and the cells still render their color —
 *       since DS2-TOKENS that colour is a static `cat-tint` rule, so an unpainted
 *       cell now means a broken stylesheet rather than a refused inline style;
 *   (b) at 800px (the former md–lg dead zone) nav is reachable — since W2b that
 *       band is DESKTOP mode: the §4.1 icon rail (historical `desktop-sidebar`
 *       testid) + identity bar;
 *   (c) <md shows the TabBar, ≥md shows the rail (no regression);
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

    // The day-view cells are DE-INLINED. They were inline style={{ backgroundColor }}
    // (stripped by the prod CSP → re-applied every render → the freeze this test
    // guards); then a nonce'd <style> + data-cellbg; and since DS2-TOKENS §1.3 a
    // static `cat-tint` + data-cat rule, which nothing dynamic has to smuggle past the
    // CSP at all. The assertion below is unchanged and still the right one — a cell
    // that fails to paint is the visible symptom in every one of those mechanisms.
    await page.goto('/en/schedule')
    const chip = page.getByTestId('week-chip').first()
    await expect(chip, 'the week grid renders colored class chips').toBeVisible({ timeout: 15_000 })
    const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, 'the de-inlined cell renders its category tint under the prod CSP').not.toBe('rgba(0, 0, 0, 0)')
  } finally {
    await ctx.close()
  }
})

test('RESPONSIVE-CSP · nav is reachable at 800px (the former md–lg dead zone)', async ({ browser }) => {
  const { ctx, page } = await staffPage(browser, 800)
  try {
    await page.goto('/en/today')
    // PREMISE UPDATED (W2b / DS 2.0 §4.1): the staff shell now switches chrome at
    // md (768), like portal + coach — at 800px it is DESKTOP mode: the §4.1 icon
    // rail (which keeps the historical `desktop-sidebar` testid) + identity bar.
    // The legacy standalone md–lg rail (`desktop-rail`) and the mobile chrome are
    // gone from this band. Nav stays reachable — that is this test's invariant.
    await expect(page.getByTestId('desktop-sidebar'), 'the §4.1 rail (reachable nav) shows at 800px').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('identity-bar'), 'the identity bar shows at 800px').toBeVisible()
    await expect(page.getByTestId('native-large-title').first(), 'the mobile chrome is NOT active at 800px').toBeHidden()
    await expect(page.getByTestId('tab-bar'), 'no bottom TabBar at 800px').toBeHidden()
    // Decisive: a rail tap still navigates.
    await page.getByTestId('desktop-sidebar').getByTestId('nav-members').click()
    await expect(page, 'rail navigation works at 800px').toHaveURL(/\/students(\b|\/|\?|$)/)
  } finally {
    await ctx.close()
  }
})

test('RESPONSIVE-CSP · <md shows the TabBar, ≥md shows the rail (no regression)', async ({ browser }) => {
  const { ctx, page } = await staffPage(browser, 390)
  try {
    await page.goto('/en/today')
    await expect(page.getByTestId('native-large-title').first(), 'mobile shell at 390px').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('tab-bar').first(), 'the bottom TabBar at 390px').toBeVisible()
    await expect(page.getByTestId('desktop-sidebar'), 'no rail at 390px').toBeHidden()

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('desktop-sidebar'), 'the rail at 1280px').toBeVisible({ timeout: 10_000 })
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
 * SHELL-OVERLAP-FIX — PREMISE UPDATED (W2b / DS 2.0 §4.1). The old guard measured
 * the legacy md–lg TabBar rail (w-20) against the mobile title; both are gone —
 * the staff shell now runs the §4.1 contract: ONE `--rail-w` token feeds the
 * rail's width AND the content's `ms-[var(--rail-w)]` offset (72px icon rail at
 * 768–1023, 232px expanded ≥1024). The INVARIANT this test keeps is the same:
 * content never renders under the rail, in LTR or RTL.
 */
test('SHELL-OVERLAP · at 800px content clears the §4.1 icon rail — LTR + RTL', async ({ browser }) => {
  // LTR: the rail hugs the LEFT edge; the content's left edge must clear it.
  {
    const { ctx, page } = await staffPage(browser, 800)
    try {
      await page.goto('/en/today')
      const rail = page.getByTestId('desktop-sidebar')
      const content = page.getByTestId('shell-content')
      await expect(rail, 'the icon rail renders at 800px').toBeVisible({ timeout: 15_000 })
      const railBox = await rail.boundingBox()
      const contentBox = await content.boundingBox()
      expect(railBox && contentBox, 'rail + content are measurable').toBeTruthy()
      expect(railBox!.x, 'the rail is anchored to the left edge').toBeLessThan(8)
      expect(railBox!.width, 'the 768–1023 rail is the 72px icon state').toBeGreaterThanOrEqual(71)
      expect(contentBox!.x, 'content is NOT under the left rail (ms-[var(--rail-w)])')
        .toBeGreaterThanOrEqual(railBox!.x + railBox!.width - 1)
    } finally {
      await ctx.close()
    }
  }
  // RTL (/ar): the rail flips to the RIGHT edge (logical start side); the
  // content's right edge must be at/before the rail's left edge.
  {
    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar', viewport: { width: 800, height: 860 } })
    const page = await ctx.newPage()
    try {
      await page.goto('/ar/today')
      const rail = page.getByTestId('desktop-sidebar')
      const content = page.getByTestId('shell-content')
      await expect(rail, 'the RTL rail renders at 800px').toBeVisible({ timeout: 15_000 })
      const railBox = await rail.boundingBox()
      const contentBox = await content.boundingBox()
      expect(railBox && contentBox, 'rail + content are measurable').toBeTruthy()
      expect(railBox!.x + railBox!.width, 'the rail is anchored to the right edge').toBeGreaterThan(800 - 8)
      expect(contentBox!.x + contentBox!.width, 'content is NOT under the right rail (ms-[var(--rail-w)])')
        .toBeLessThanOrEqual(railBox!.x + 1)
    } finally {
      await ctx.close()
    }
  }
})

test('SHELL-OVERLAP · rail states at the §4.1 boundaries (absent <md, expanded ≥lg)', async ({ browser }) => {
  // <md: the bottom TabBar is the nav (no rail → no clearance needed).
  {
    const { ctx, page } = await staffPage(browser, 390)
    try {
      await page.goto('/en/today')
      await expect(page.getByTestId('native-large-title').first(), 'mobile shell at 390px').toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('desktop-sidebar'), 'no rail <md (bottom TabBar instead)').toBeHidden()
    } finally {
      await ctx.close()
    }
  }
  // ≥lg: the SAME rail, expanded to 232px (one nav, two states — §4.1).
  {
    const { ctx, page } = await staffPage(browser, 1280)
    try {
      await page.goto('/en/today')
      const rail = page.getByTestId('desktop-sidebar')
      await expect(rail, 'the rail at 1280px').toBeVisible({ timeout: 15_000 })
      const railBox = await rail.boundingBox()
      expect(railBox!.width, 'the ≥1024 rail is the 232px expanded state').toBeGreaterThanOrEqual(231)
      await expect(page.getByTestId('tab-bar'), 'no bottom TabBar ≥md').toBeHidden()
    } finally {
      await ctx.close()
    }
  }
})
