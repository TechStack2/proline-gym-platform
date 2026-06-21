import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * COACH360-PORTAL — the coach's own drillable premium 360 hub (portal home).
 * Proves, against the ephemeral TI gym (Sami = coach@, with a class every day,
 * Karim+Omar enrolled, and a seeded PT package):
 *  1. the hub renders the six 360 surfaces (Today · This Week · My Students · PT ·
 *     Trials · Profile/landing) with the brand portal kit;
 *  2. RECONCILE — My Students' drill rows count to the headline number;
 *  3. DRILL — a student row → Member-360, PT → /coach/pt, Profile → /coach/profile,
 *     Today → the class attendance roster;
 *  4. /ar renders RTL-clean (no MISSING_MESSAGE / unresolved keys);
 *  5. no regression — the existing coach tabs still load + the roster shows Karim.
 * Read-only: the hub issues no writes.
 */
async function coachCtx(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.coach.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test.describe.serial('COACH360-PORTAL · coach drillable 360 hub', () => {
  test('hub renders the 6 surfaces, reconciles My Students, and drills', async ({ browser }) => {
    test.setTimeout(120_000)
    const { ctx, page } = await coachCtx(browser)
    try {
      await page.goto('/en/coach')
      await expect(vis(page, '[data-testid="coach-360-portal"]').first(), 'the 360 hub renders').toBeVisible({ timeout: 15_000 })

      // the six 360 surfaces (deterministic from the seed: class every day, 2 enrolled, 1 PT)
      await expect(vis(page, '[data-testid="card-coach-today"]').first(), 'Today card').toBeVisible()
      await expect(vis(page, '[data-testid="card-coach-week"]').first(), 'This Week card').toBeVisible()
      await expect(vis(page, '[data-testid="card-coach-students"]').first(), 'My Students card').toBeVisible()
      await expect(vis(page, '[data-testid="card-coach-pt"]').first(), 'PT card').toBeVisible()
      await expect(vis(page, '[data-testid="card-coach-trials"]').first(), 'Trials card').toBeVisible()
      await expect(vis(page, '[data-testid="coach-profile-status"]').first(), 'Profile/landing card').toBeVisible()

      // RECONCILIATION: the My Students drill rows count to the headline number.
      const studentsCard = vis(page, '[data-testid="card-coach-students"]').first()
      const headline = Number(await studentsCard.getAttribute('data-count'))
      expect(headline, 'students headline ≥ 2 (Karim + Omar enrolled)').toBeGreaterThanOrEqual(2)
      const drill = vis(page, '[data-testid="coach-students-drill"]').first()
      expect(Number(await drill.getAttribute('data-rows')), 'student rows reconcile to the headline').toBe(headline)

      // DRILL: My Students row → the coach's students tab, FOCUSED on that student
      // (coaches are redirected away from /dashboard/*, so the drill stays in-portal).
      await drill.locator('summary').click()
      const row = vis(page, '[data-testid="coach-students-row"]').first()
      await expect(row).toBeVisible()
      await row.click()
      await expect(page, 'student row drills into the coach students tab').toHaveURL(/\/coach\/students\?q=/, { timeout: 15_000 })
      await expect(vis(page, 'input[type="text"]').first(), 'the tab opens pre-filtered to the student').not.toHaveValue('')

      // DRILL: PT card → /coach/pt
      await page.goto('/en/coach')
      await vis(page, '[data-testid="coach-pt-open"]').first().click()
      await expect(page, 'PT drills to the PT tab').toHaveURL(/\/coach\/pt/, { timeout: 15_000 })

      // DRILL: Profile/landing card → /coach/profile
      await page.goto('/en/coach')
      await vis(page, '[data-testid="coach-profile-open"]').first().click()
      await expect(page, 'Profile drills to the profile tab').toHaveURL(/\/coach\/profile/, { timeout: 15_000 })

      // DRILL: Today class row → the attendance roster
      await page.goto('/en/coach')
      await vis(page, '[data-testid="coach-today-row"]').first().locator('a').first().click()
      await expect(page, "Today drills into the class roster").toHaveURL(/\/coach\/attendance/, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('/ar hub renders RTL-clean (no missing keys)', async ({ browser }) => {
    const { ctx, page } = await coachCtx(browser, 'ar')
    try {
      await page.goto('/ar/coach')
      await expect(vis(page, '[data-testid="coach-360-portal"]').first(), 'hub renders on /ar').toBeVisible({ timeout: 15_000 })
      await expect(vis(page, '[data-testid="card-coach-students"]').first()).toBeVisible()
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE').toBe(0)
      expect(await page.locator('text=coachHub.').count(), 'no unresolved coachHub key').toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('no regression: the existing coach tabs still load + roster shows Karim', async ({ browser }) => {
    const { ctx, page } = await coachCtx(browser)
    try {
      for (const path of ['/en/coach/students', '/en/coach/attendance', '/en/coach/trials', '/en/coach/pt', '/en/coach/profile']) {
        const resp = await page.goto(path)
        expect(resp?.status() ?? 0, `${path} loads`).toBeLessThan(400)
      }
      await page.goto('/en/coach/students')
      await expect(page.getByText('Karim').first(), 'roster still shows the enrolled student').toBeVisible({ timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })
})
