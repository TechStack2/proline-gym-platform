import { test, expect, type Browser, type Page, type Locator } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * PORTAL-MODAL — every inline `fixed inset-0` modal reachable on a PageTransition
 * shell (portal / coach / mobile-dashboard) is portaled to <body> via the shared
 * <ModalPortal>, so it stays VIEWPORT-centered instead of resolving against the
 * transformed page box (off-screen on a scrolled/tall shell page). Presentation
 * only — same testids/behavior. Proven here for two key modals on scrolled
 * PageTransition pages; WaiverSign (f3) + every staff modal (adm1/b2/e1/pt/…)
 * keep passing through the full suite (portaling is a no-op on the transform-less
 * desktop dashboard).
 */
const MOBILE = { width: 390, height: 720 }
const RUN = Date.now().toString().slice(-6)

async function ctxFor(browser: Browser, role: keyof typeof ROLES, opts: { viewport?: { width: number; height: number }; locale?: string } = {}) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: opts.locale ?? 'en', ...(opts.viewport ? { viewport: opts.viewport } : {}) })
  return { ctx, page: await ctx.newPage() }
}

/** The modal's box sits WITHIN the viewport (not page-relative / scrolled off). */
async function expectWithinViewport(page: Page, modal: Locator, label: string) {
  const vp = page.viewportSize()!
  // The page must be tall enough that a page-box-relative (buggy) modal WOULD be
  // off-screen — otherwise the assertion is vacuous.
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 8)
  expect(scrollable, `${label}: the shell page is taller than the viewport (the bug would manifest)`).toBeTruthy()
  const box = await modal.boundingBox()
  expect(box, `${label}: the modal has a box`).toBeTruthy()
  expect(box!.x, `${label}: left edge within viewport`).toBeGreaterThanOrEqual(-2)
  expect(box!.y, `${label}: top edge within viewport`).toBeGreaterThanOrEqual(-2)
  expect(Math.round(box!.x + box!.width), `${label}: right edge within viewport`).toBeLessThanOrEqual(vp.width + 2)
  expect(Math.round(box!.y + box!.height), `${label}: bottom edge within viewport`).toBeLessThanOrEqual(vp.height + 2)
}

/** Owner sells a fresh PT pack to Karim → /portal/pt shows a bookable assignment. */
async function sellPtToKarim(page: Page, name: string) {
  await page.goto('/en/settings?tab=ptpackages')
  await vis(page, '[data-testid="ptpkg-add-en"]').fill(name)
  await vis(page, '[data-testid="ptpkg-add-sessions"]').fill('10')
  await vis(page, '[data-testid="ptpkg-add-price"]').fill('100')
  await vis(page, '[data-testid="ptpkg-add-validity"]').fill('60')
  await vis(page, '[data-testid="ptpkg-add-btn"]').click()
  await expect(vis(page, `[data-testid="ptpkg-row"][data-name-en="${name}"]`).first()).toBeVisible({ timeout: 15_000 })
  await page.goto('/en/students?search=Karim')
  await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
  await vis(page, '[data-testid="pt-sell-open"]').first().click()
  await page.locator('[data-testid="pt-type-chip"]').filter({ hasText: name }).first().click()
  await page.locator('[data-testid="pt-coach-chip"]').first().click()
  await page.getByTestId('pt-sell-submit').click()
  await expect(vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: name }).first()).toBeVisible({ timeout: 20_000 })
}

test.describe('PORTAL-MODAL · portal/coach fixed modals stay viewport-centered', () => {
  test('book-pt opens viewport-centered on a scrolled PORTAL page (PageTransition)', async ({ browser }) => {
    test.setTimeout(150_000)
    const PACK = `PM Pack ${RUN}`
    const owner = await ctxFor(browser, 'owner')
    try {
      await sellPtToKarim(owner.page, PACK)
    } finally {
      await owner.ctx.close()
    }

    const student = await ctxFor(browser, 'student', { viewport: MOBILE })
    try {
      await student.page.goto('/en/portal/pt')
      const trigger = vis(student.page, '[data-testid="pt-book-open"]').first()
      await expect(trigger, 'a bookable PT assignment is on the portal').toBeVisible({ timeout: 15_000 })
      // Scroll the portal page — a page-box-relative (buggy) modal would land off-screen.
      await student.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await trigger.scrollIntoViewIfNeeded()
      await trigger.click()
      const modal = vis(student.page, '[data-testid="pt-book-modal"]').first()
      await expect(modal).toBeVisible({ timeout: 15_000 })
      await expectWithinViewport(student.page, modal, 'book-pt (portal, scrolled)')
    } finally {
      await student.ctx.close()
    }
  })

  test('form-wizard (add-lead) opens viewport-centered on a scrolled mobile-dashboard page', async ({ browser }) => {
    const owner = await ctxFor(browser, 'owner', { viewport: MOBILE })
    try {
      await owner.page.goto('/en/leads')
      const add = vis(owner.page, '[data-testid="add-lead-button"]').first()
      await expect(add).toBeVisible({ timeout: 15_000 })
      await owner.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await add.scrollIntoViewIfNeeded()
      await add.click()
      const modal = vis(owner.page, '[data-testid="add-lead-modal"]').first()
      await expect(modal).toBeVisible({ timeout: 15_000 })
      await expectWithinViewport(owner.page, modal, 'form-wizard (scrolled)')
    } finally {
      await owner.ctx.close()
    }
  })

  test('/ar modal is viewport-centered + localized (no missing keys)', async ({ browser }) => {
    const owner = await ctxFor(browser, 'owner', { viewport: MOBILE, locale: 'ar' })
    try {
      await owner.page.goto('/ar/leads')
      const add = vis(owner.page, '[data-testid="add-lead-button"]').first()
      await expect(add).toBeVisible({ timeout: 15_000 })
      await owner.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await add.scrollIntoViewIfNeeded()
      await add.click()
      const modal = vis(owner.page, '[data-testid="add-lead-modal"]').first()
      await expect(modal).toBeVisible({ timeout: 15_000 })
      await expectWithinViewport(owner.page, modal, 'form-wizard /ar (scrolled)')
      expect(await owner.page.locator('text=MISSING_MESSAGE').count(), 'no missing i18n on /ar').toBe(0)
    } finally {
      await owner.ctx.close()
    }
  })
})
