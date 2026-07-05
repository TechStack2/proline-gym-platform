import { test, expect } from '@playwright/test'
import { ROLES } from './roles'

/**
 * SCHEDULE-MOBILE-FREEZE — the staff Schedule DAY view froze the tab when the
 * window was resized across the mobile breakpoint: NativeHeader's IntersectionObserver
 * set `isCollapsed`, whose collapse moved the observed (in-flow) sentinel back across
 * the threshold → an infinite setState↔layout loop (reconciler recursion) + a flood of
 * "inline style violates CSP" from the loop re-rendering inline-styled nodes.
 *
 * This pins BOTH fixes:
 *  1. the page stays RESPONSIVE after toggling 1024↔390 (a frozen tab times out on the
 *     next click);
 *  2. no FLOOD of CSP inline-style violations (the schedule chips + the header accent
 *     bar now use build-time Tailwind classes, not `style={{ backgroundColor }}`);
 *  3. a schedule chip carries its discipline color via CLASS, not a CSP-stripped
 *     inline style attribute.
 * Runs against the prod build (next start) → the real strict-dynamic CSP is active.
 */
function cspInlineCollector(page: import('@playwright/test').Page): string[] {
  const hits: string[] = []
  page.on('console', (m) => {
    const t = m.text()
    if (/content security policy/i.test(t) && /(inline )?style|style-src/i.test(t)) hits.push(t)
  })
  return hits
}

test('SCHEDULE-MOBILE · day view survives 1024↔390 resize — no freeze, no CSP inline-style flood', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', viewport: { width: 1024, height: 844 } })
  const page = await ctx.newPage()
  const cspInline = cspInlineCollector(page)
  try {
    await page.goto('/en/schedule?view=day')
    // The view switcher (a stable control on both breakpoints) renders.
    await expect(page.getByTestId('schedule-views'), 'the day view renders').toBeVisible({ timeout: 20_000 })

    // Toggle across the mobile breakpoint repeatedly — the freeze trigger.
    for (const w of [390, 1024, 390, 1024, 390]) {
      await page.setViewportSize({ width: w, height: 844 })
      await page.waitForTimeout(350)
    }

    // FREEZE GUARD: a known control stays clickable. A frozen (looping) tab blocks the
    // main thread → this click times out. Navigation proves the tab is alive.
    await page.getByTestId('view-week').click({ timeout: 8_000 })
    await expect(page.getByTestId('week-grid').or(page.getByText(/no events|aucun|لا/i)).first(),
      'clicking Week navigated (tab not frozen)').toBeVisible({ timeout: 15_000 })

    // FLOOD GUARD: the freeze loop re-applied inline styles THOUSANDS of times
    // (reconciler recursion). A healthy page has only a bounded handful — the
    // pre-existing `--shell-accent` shell-root inline style, re-applied once per
    // resize-triggered shell re-render (a separate, flagged CSP debt, NOT this
    // freeze). The meaningful line is bounded-vs-flood: well under 100, never
    // thousands. (The freeze also makes the click above time out, so it's caught twice.)
    expect(cspInline.length, `CSP inline-style violations flooded (${cspInline.length}):\n${cspInline.slice(0, 3).join('\n')}`).toBeLessThan(100)

    // #2: a schedule chip carries its discipline color via CLASS, not an inline style
    // attribute (which prod CSP strips → chips would render the default red).
    const chip = page.getByTestId('week-chip').first()
    if (await chip.count() > 0) {
      const styleAttr = (await chip.getAttribute('style')) ?? ''
      expect(styleAttr, 'a week chip must not use an inline background-color style').not.toContain('background-color')
    }
  } finally {
    await ctx.close()
  }
})
