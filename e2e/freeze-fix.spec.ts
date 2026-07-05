import { test, expect } from '@playwright/test'
import { ROLES } from './roles'

/**
 * FREEZE-FIX — /settings must not freeze at TABLET (md) width. Owner-reported: at
 * ~768–1023px, loading /settings pegs the main thread in a synchronous vendor
 * recursion (a5→a6→a5) until the PWA is restarted. This is the regression guard:
 * it loads /settings at 820×1024 as owner, toggles across the md boundary (the prod
 * repro is a resize), and asserts the page stays RESPONSIVE with no layout/recursion
 * loop errors. A frozen main thread → the responsiveness probe times out (RED); an
 * async ResizeObserver loop → the console floods (RED).
 */
test('FREEZE-FIX · /settings at md (820×1024) stays responsive — no layout/recursion loop', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({
    storageState: ROLES.owner.storage,
    locale: 'en',
    viewport: { width: 820, height: 1024 },
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // Probe: the browser main thread must service a double-rAF within `ms`. If a sync
  // loop has pegged the thread, page.evaluate never resolves → the Node-side timeout
  // wins → false. (waitForTimeout + this race are Node-driven, so they survive a
  // frozen page.)
  const isResponsive = async (ms: number) =>
    Promise.race([
      page
        .evaluate(
          () =>
            new Promise<boolean>((r) =>
              requestAnimationFrame(() => requestAnimationFrame(() => r(true))),
            ),
        )
        .catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
    ])

  try {
    await page.goto('/en/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500) // let hydration + any loop manifest

    // The prod trigger is a resize — toggle across the md boundary a few times.
    for (const w of [768, 900, 820, 1023, 820]) {
      await page.setViewportSize({ width: w, height: 1024 })
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1500)

    const loopErrors = errors.filter((e) =>
      /ResizeObserver loop|Maximum call stack|Maximum update depth/i.test(e),
    )
    const responsive = await isResponsive(4000)

    expect(
      responsive,
      `main thread is FROZEN at md. console errors seen: ${JSON.stringify(errors.slice(0, 8))}`,
    ).toBe(true)
    expect(
      loopErrors,
      `layout/recursion loop detected: ${JSON.stringify(loopErrors.slice(0, 8))}`,
    ).toHaveLength(0)

    // And a stable settings control is still reachable (not behind a frozen overlay).
    await expect(page.getByTestId('settings-language').first()).toBeVisible({ timeout: 8000 })
  } finally {
    await ctx.close()
  }
})
