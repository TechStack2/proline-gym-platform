import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * RESPONSIVE-CSP-HARDENING — the staff/portal shells + calendar views must be
 * responsive under the prod CSP without the freeze/dead-zone/inline-style bugs:
 *   (a) /schedule day view survives a mobile-resize toggle (the NativeHeader
 *       IntersectionObserver loop is guarded; the day-view cells are de-inlined) —
 *       no freeze, no CSP inline-style violation;
 *   (b) at 800px (the former md–lg dead zone) nav is reachable (mobile TabBar);
 *   (c) <lg shows the TabBar, ≥lg shows the Sidebar (no regression);
 *   (d) the portal schedule at mobile is likewise freeze/CSP-clean (shared shell).
 * /en, real staff/member sessions.
 */
const CSP_STYLE = /refused to apply.*style|violates.*style-src/i

function watchCsp(page: Page): string[] {
  const errs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && CSP_STYLE.test(m.text())) errs.push(m.text())
  })
  return errs
}
async function staffPage(browser: Browser, width: number) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', viewport: { width, height: 860 } })
  return { ctx, page: await ctx.newPage() }
}

test('RESPONSIVE-CSP · schedule day view survives mobile-resize (no freeze, no CSP inline-style error)', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await staffPage(browser, 1024)
  const cspErrors = watchCsp(page)
  try {
    await page.goto('/en/schedule?view=day')
    await expect(page.getByTestId('schedule-views'), 'the schedule day view renders').toBeVisible({ timeout: 20_000 })
    // The bug was an infinite render loop (NativeHeader observer + CSP-stripped
    // day-view cells) that FROZE the tab. Toggle across the lg breakpoint; a frozen
    // tab makes the final assertion time out. (setViewportSize is a CDP command → it
    // completes even if page JS is pegged, so the freeze surfaces at the assert.)
    for (const w of [390, 1024, 390, 1024, 390]) {
      await page.setViewportSize({ width: w, height: 860 })
      await page.waitForTimeout(350)
    }
    await expect(page.getByTestId('schedule-views'), 'the day view stays responsive after the resize toggle (no freeze)')
      .toBeVisible({ timeout: 10_000 })
    expect(cspErrors, 'no CSP inline-style violation on the schedule day view').toEqual([])
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

test('RESPONSIVE-CSP · portal schedule at mobile — no freeze, no CSP inline-style error', async ({ browser }) => {
  test.setTimeout(75_000)
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, locale: 'en', viewport: { width: 390, height: 860 } })
  const page = await ctx.newPage()
  const cspErrors = watchCsp(page)
  try {
    await page.goto('/en/portal/schedule')
    await expect(page.getByTestId('native-large-title').first(), 'the portal schedule renders at mobile').toBeVisible({ timeout: 20_000 })
    for (const w of [1024, 390, 1024, 390]) {
      await page.setViewportSize({ width: w, height: 860 })
      await page.waitForTimeout(300)
    }
    await expect(page.getByTestId('native-large-title').first(), 'the portal stays responsive (no freeze)').toBeVisible({ timeout: 10_000 })
    expect(cspErrors, 'no CSP inline-style violation on the portal schedule').toEqual([])
  } finally {
    await ctx.close()
  }
})
