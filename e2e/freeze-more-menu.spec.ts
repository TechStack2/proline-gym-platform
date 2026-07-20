import { test, expect, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * FREEZE-MORE-MENU — regression guard for the deterministic "screen freeze":
 *   1) tap "More…" in the shell nav → a bottom sheet + backdrop open
 *   2) click the BACKDROP → the shade disappears (open-state torn between layers)
 *   3) click away to close → the ENTIRE screen stopped responding until a refresh.
 *
 * Root cause: SwipeableSheet kept its internal `currentSnap` after the controlled
 * `isOpen` went false, so the `fixed inset-0 z-[100]` container stayed mounted. Its
 * backdrop child went pointer-events:none (shade vanished) but the CONTAINER kept
 * pointer-events:auto and swallowed every click app-wide. This drives the exact
 * 3-step sequence at mobile + tablet and asserts the app is still interactive.
 *
 * Raw page.mouse.click is used for step 3 on purpose: on the (unfixed) app the
 * lingering overlay swallows it, so we assert the wedge via the probes below rather
 * than a confusing actionability timeout.
 */
// W1-FOUNDATION §2.2: the staff bar is the shared TabBar primitive now — real nav
// ARIA, so the old `aria-controls$="-more"` hook is gone. The stable handles are the
// testids, one per surface: bottom bar (mobile) and side rail (tablet).
const MORE = '[data-testid="tab-more"]:visible, [data-testid="rail-more"]:visible'
const MEMBERS = '[data-testid="tab-members"]:visible, [data-testid="rail-members"]:visible'

async function runFreezeSequence(page: Page) {
  await page.goto('/en/today', { waitUntil: 'domcontentloaded' })
  await expect(page.locator(MORE).first(), 'shell nav is up').toBeVisible({ timeout: 15_000 })

  // 1) open the More sheet
  await page.locator(MORE).first().click()
  await expect(page.getByTestId('sheet-overlay'), 'the sheet opens').toBeVisible()
  await expect(page.getByTestId('sheet-backdrop')).toBeVisible()

  // 2) click the backdrop in the top zone (above the 78vh sheet) → dismiss the shade
  await page.getByTestId('sheet-backdrop').click({ position: { x: 24, y: 16 } })

  // 3) click away to close the popup — the step that used to wedge the whole app
  await page.mouse.click(24, 16)
}

async function assertStillInteractive(page: Page) {
  // (a) the overlay is fully torn down — no lingering fixed container
  await expect(page.locator('[data-testid="sheet-overlay"]'), 'overlay unmounted').toHaveCount(0)

  // (b) nothing full-viewport intercepts screen center; body isn't locked
  const probe = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2))
    return {
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      bodyOverflow: getComputedStyle(document.body).overflow,
      inOverlay: !!(el && el.closest('[data-testid="sheet-overlay"]')),
      tag: el ? el.tagName : null,
    }
  })
  expect(probe.bodyPointerEvents, 'body is not pointer-events:none').not.toBe('none')
  expect(probe.bodyOverflow, 'body scroll-lock released').not.toBe('hidden')
  expect(probe.inOverlay, 'screen center is real content, not a stuck overlay').toBe(false)
  expect(probe.tag, 'elementFromPoint resolved a real element').not.toBeNull()

  // (c) decisive: a nav tap still navigates
  await page.locator(MEMBERS).first().click()
  await expect(page, 'navigation still works after the sequence').toHaveURL(/\/students(\b|\/|\?|$)/)
}

test.describe('FREEZE-MORE-MENU', () => {
  test.use({ storageState: ROLES.owner.storage })

  test('mobile — More sheet backdrop + dismiss never wedges the app', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await runFreezeSequence(page)
    await assertStillInteractive(page)
  })

  test('tablet — More sheet backdrop + dismiss never wedges the app', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 820, height: 1180 })
    await runFreezeSequence(page)
    await assertStillInteractive(page)
  })
})
