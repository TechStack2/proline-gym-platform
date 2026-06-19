import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, createClassViaWizard } from './helpers'

/**
 * MEMBER-ENRICH — read-time enrichment (zero schema): surface class + DISCIPLINE
 * (+ belt + membership status) at a glance on the three surfaces that lacked the
 * `class → disciplines` join:
 *   1) member-list cards   — discipline · class · membership-status chips
 *   2) Member-360 panel    — each registration as class + discipline + schedule
 *   3) class roster        — each student's belt + discipline
 *
 * Deterministic from the run seed (000029): Karim is enrolled in "Muay Thai
 * Beginner" (Muay Thai discipline) → his card/roster carry the discipline with no
 * extra seeding. For the registrations panel + a clean single-enrollee roster we
 * create a fresh class and register Karim to it (request→approve = active, which
 * also projects the attendance roster). Karim's MEMBERSHIP is mutated by ml1, so
 * the status chip is asserted at page level (his enrollment is never mutated).
 */
const RUN = Date.now().toString().slice(-6)
const CLASS_NAME = `ME Enrich ${RUN}`

async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

test.describe.serial('MEMBER-ENRICH · class+discipline+belt+status on cards/Member-360/roster', () => {
  test('member-list cards surface discipline + class + belt, and membership status is shown', async ({ browser }) => {
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/students')
      const karim = vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first()
      await expect(karim, "Karim's member card is on the roster").toBeVisible({ timeout: 15_000 })

      // the read-time info area (one query, ordered chips) — the extension point.
      await expect(karim.getByTestId('member-info'), 'enrichment info area renders on the card').toBeVisible()
      // discipline + class (seeded: Muay Thai Beginner → Muay Thai)
      await expect(karim.getByTestId('member-discipline').first(), 'discipline chip on the card').toBeVisible()
      await expect(karim.getByTestId('member-class').first(), 'active-class chip on the card').toContainText('Muay Thai')
      // belt (already on the card) — Karim is White
      await expect(karim, 'belt rank on the card').toContainText(/White/i)

      // membership status is visible on the roster (page level — ml1 mutates Karim's)
      await expect(vis(page, '[data-testid="member-membership"]').first(), 'membership-status chip visible on a card').toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('Member-360 shows class+discipline+schedule; roster shows belt+discipline', async ({ browser }) => {
    test.setTimeout(120_000)
    const { ctx, page } = await ownerPage(browser)
    let classId = ''
    try {
      // ── fresh class (Mon + Wed/Fri @ 19:00) so the roster has a single, clean enrollee ──
      await page.goto('/en/classes')
      await createClassViaWizard(page, { nameEn: CLASS_NAME, capacity: '20', fee: '40', extraDays: [3, 5], presetTime: '19:00' })

      // ── register Karim to it (request→approve = active → also enrolls) ──
      await page.goto('/en/students')
      await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click()
      await expect(vis(page, '[data-testid="m360-register-open"]').first(), 'on Karim Member-360').toBeVisible({ timeout: 15_000 })
      await vis(page, '[data-testid="m360-register-open"]').first().click()
      const option = vis(page, '[data-testid="m360-class-option"]').filter({ hasText: CLASS_NAME }).first()
      await expect(option, 'the new class is offered in the register modal').toBeVisible({ timeout: 10_000 })
      classId = (await option.getAttribute('data-id')) || ''
      await option.click()
      await vis(page, '[data-testid="m360-register-submit"]').first().click()
      await expect(page.locator('[data-testid="m360-register-modal"]'), 'register modal closes on success').toHaveCount(0, { timeout: 15_000 })

      // ── Member-360 enrollments panel: the reg row now carries class + discipline + schedule ──
      const regRow = vis(page, '[data-testid="member-reg-row"]').filter({ hasText: CLASS_NAME }).first()
      await expect(regRow, 'the new registration row is in the Member-360 panel').toBeVisible({ timeout: 15_000 })
      const ds = regRow.getByTestId('reg-discipline-schedule')
      await expect(ds, 'discipline + schedule line on the reg row').toBeVisible()
      await expect(ds, 'schedule day/time is shown (19:00)').toContainText('19:00')

      // ── roster (single enrollee = Karim): belt + discipline chip ──
      expect(classId, 'captured the new class id from the register modal').toBeTruthy()
      await page.goto(`/en/classes/${classId}`)
      await expect(vis(page, '[data-testid="enrolled-student"]').first(), 'Karim is on the roster').toContainText('Karim', { timeout: 15_000 })
      await expect(vis(page, '[data-testid="roster-info"]').first(), 'belt is on the roster row').toContainText(/white/i)
      const rosterDisc = vis(page, '[data-testid="roster-discipline"]').first()
      await expect(rosterDisc, 'discipline chip on the roster row').toBeVisible()

      // the roster discipline must be the SAME one shown on the Member-360 reg row.
      const disc = (await rosterDisc.innerText()).trim()
      expect(disc, 'discipline chip is non-empty').toBeTruthy()
      await expect(ds, 'Member-360 reg row shows the same discipline').toContainText(disc)
    } finally {
      await ctx.close()
    }
  })

  test('/ar renders the enriched chips localized (no missing i18n keys)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar' })
    const page = await ctx.newPage()
    try {
      await page.goto('/ar/students')
      await expect(vis(page, '[data-testid="student-card"]').first(), 'roster renders in Arabic').toBeVisible({ timeout: 15_000 })
      await expect(vis(page, '[data-testid="member-info"]').first(), 'enrichment info area renders in Arabic').toBeVisible()
      // i18n parity: the membership label must resolve (not next-intl's raw fallback)
      expect(await page.locator('text=students.membership').count(), 'no unresolved students.membership key').toBe(0)
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar/students').toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
