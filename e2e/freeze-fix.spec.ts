import { test, expect } from '@playwright/test'
import { ROLES } from './roles'

/**
 * FREEZE-FIX — /settings must not freeze when the app is RESIZED across the desktop↔
 * tablet boundary (~1024px, where the shell swaps the Sidebar for the mobile
 * NativeHeader). Owner-reported at prod: resizing desktop→tablet on /settings pegs the
 * main thread in a synchronous vendor recursion (a5→a6→a5) until the PWA restarts.
 * Regression guard: load /settings as owner, then cross the lg↔md boundary repeatedly,
 * probing that the main thread stays RESPONSIVE (a frozen thread → the double-rAF probe
 * times out) with no layout/recursion loop console errors.
 */
test('FREEZE-FIX · /settings survives desktop↔tablet resize — no layout/recursion freeze', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({
    storageState: ROLES.owner.storage,
    locale: 'en',
    viewport: { width: 1280, height: 1000 },
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // The browser main thread must service a double-rAF within `ms`; a sync freeze pegs
  // it so page.evaluate never resolves → the Node-side timeout wins → false.
  const isResponsive = (ms: number) =>
    Promise.race([
      page
        .evaluate(
          () => new Promise<boolean>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
        )
        .catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
    ])

  try {
    await page.goto('/en/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000) // hydrate at desktop width

    // Cross the lg↔md boundary (1024) repeatedly — desktop (Sidebar) ↔ tablet
    // (NativeHeader + w-20 rail). Probe responsiveness after EACH step so a freeze is
    // caught the moment it happens, at the width that triggered it.
    let frozenAt: number | null = null
    for (const w of [820, 1280, 768, 1100, 900, 1023, 1200, 820, 1280, 768]) {
      await page.setViewportSize({ width: w, height: 1000 })
      await page.waitForTimeout(350)
      if (!(await isResponsive(3000))) {
        frozenAt = w
        break
      }
    }

    const loopErrors = errors.filter((e) =>
      /ResizeObserver loop|Maximum call stack|Maximum update depth/i.test(e),
    )
    expect(
      frozenAt,
      `main thread FROZE at width=${frozenAt}px. console errors: ${JSON.stringify(errors.slice(0, 8))}`,
    ).toBeNull()
    expect(
      loopErrors,
      `layout/recursion loop detected: ${JSON.stringify(loopErrors.slice(0, 8))}`,
    ).toHaveLength(0)

    // Settle at md and confirm a stable settings control is still interactive.
    await page.setViewportSize({ width: 820, height: 1000 })
    await expect(page.getByTestId('settings-language').first()).toBeVisible({ timeout: 8000 })
  } finally {
    await ctx.close()
  }
})
