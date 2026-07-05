import { test, expect } from '@playwright/test'
import { ROLES } from './roles'

/**
 * PERF-1 (perceived speed) — two low-risk wins:
 *   (1) Route-segment loading.tsx skeletons: navigating between two dashboard pages
 *       shows an INSTANT skeleton (the Suspense fallback) before the real content,
 *       instead of a 2-3s blank. Proven by soft-navigating owner /today → /students
 *       (Sidebar <Link>, prefetch on) with the target's RSC fetch delayed so the
 *       skeleton stays observable, then asserting it renders and is later replaced.
 *   (2) #5c mobile TabBar clearance: the fixed bottom NativeTabBar (<md) no longer
 *       hides the last content row — the scroll container reserves tab-bar height +
 *       safe-area as bottom padding. Proven on BOTH shells (staff + portal) by the
 *       content wrapper's computed padding-bottom at a mobile width.
 * /en, real owner + student sessions. No migration.
 */

test('PERF-1 · navigating between dashboard pages shows a skeleton immediately', async ({ browser }) => {
  test.setTimeout(60_000)
  const ctx = await browser.newContext({
    storageState: ROLES.owner.storage,
    locale: 'en',
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/today')
    // ≥lg: the desktop Sidebar is the nav. Its presence == the shell (and the start
    // page) has settled, so no skeleton is showing yet.
    await expect(page.getByTestId('desktop-sidebar'), 'the shell settled on /today').toBeVisible({ timeout: 25_000 })
    await expect(page.getByTestId('page-skeleton'), 'no skeleton once /today has loaded').toHaveCount(0)

    // Hold the /money navigation RSC fetch so the loading.tsx skeleton stays on screen
    // long enough to assert (a fast local fetch would otherwise swap it for the real
    // content within a frame). /money is `force-dynamic`, so its content is never
    // statically prefetched — the loading boundary is what shows on nav. Guard
    // continue(): a superseded prefetch or the context teardown can leave a matched
    // route already-handled, and an un-caught reject there would fail the test.
    await page.route('**/en/money**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue().catch(() => {})
    })

    // Soft-nav via the Sidebar <Link> (prefetch on) — the hot path this slice targets.
    // Scope to the visible desktop Sidebar so we don't match the lg:hidden mobile TabBar.
    await page.getByTestId('desktop-sidebar').getByTestId('nav-money').click()

    // The skeleton appears IMMEDIATELY, before the money content.
    await expect(page.getByTestId('page-skeleton').first(), 'the skeleton renders instantly on nav')
      .toBeVisible({ timeout: 5_000 })

    // …and is replaced by the real page once the (held) fetch resolves.
    await page.unroute('**/en/money**')
    await expect(page.getByTestId('page-skeleton'), 'the skeleton is replaced by the loaded page')
      .toHaveCount(0, { timeout: 25_000 })
  } finally {
    await ctx.close()
  }
})

test('PERF-1 · #5c — mobile content clears the fixed bottom TabBar (last row visible)', async ({ browser }) => {
  const MOBILE = { width: 390, height: 780 }
  // The bottom NativeTabBar is ~4rem tall (<md). The content scroll container must
  // reserve at least that much bottom padding so its last row is not obscured. We
  // assert the reserved padding directly (robust — no data/scroll-length dependency).
  const MIN_CLEARANCE_PX = 56

  // (a) Staff dashboard shell.
  const staffCtx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', viewport: MOBILE })
  const staff = await staffCtx.newPage()
  try {
    await staff.goto('/en/today')
    const pad = await staff.getByTestId('shell-content').first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom) || 0)
    expect(pad, 'the staff content reserves tab-bar clearance at mobile').toBeGreaterThanOrEqual(MIN_CLEARANCE_PX)
  } finally {
    await staffCtx.close()
  }

  // (b) Member portal shell (the shell that LACKED the clearance — this slice's fix).
  const portalCtx = await browser.newContext({ storageState: ROLES.student.storage, locale: 'en', viewport: MOBILE })
  const portal = await portalCtx.newPage()
  try {
    await portal.goto('/en/portal')
    const pad = await portal.getByTestId('shell-content').first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom) || 0)
    expect(pad, 'the portal content reserves tab-bar clearance at mobile').toBeGreaterThanOrEqual(MIN_CLEARANCE_PX)
  } finally {
    await portalCtx.close()
  }
})
