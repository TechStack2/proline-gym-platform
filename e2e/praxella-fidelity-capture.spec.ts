import { test, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * PRAXELLA-BRAND-IMPL — capture the SIX REAL product screens the vendor-landing
 * vignettes are modeled on, so the owner's fidelity pairs (real | vignette) use
 * authentic, seeded data. Screenshot-only; asserts nothing about product state.
 * Runs against the seeded CI stack (owner/coach/student per-worker gyms).
 * Artifacts land in screenshots/ (uploaded by the e2e workflow).
 */
async function shoot(browser: Browser, storage: string, url: string, out: string, vp?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: storage, locale: 'en', viewport: vp ?? { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `screenshots/${out}.png`, fullPage: false }).catch(() => {})
  } finally {
    await ctx.close()
  }
}

test('FIDELITY · 1 · week schedule board (real /schedule)', async ({ browser }) => {
  await shoot(browser, ROLES.owner.storage, '/en/schedule', 'fidelity-real-1-week-board')
})
test('FIDELITY · 2 · signups pipeline (real /leads)', async ({ browser }) => {
  await shoot(browser, ROLES.owner.storage, '/en/leads', 'fidelity-real-2-signups')
})
test('FIDELITY · 3 · coach board / day diary (real /schedule?view=day)', async ({ browser }) => {
  await shoot(browser, ROLES.owner.storage, '/en/schedule?view=day', 'fidelity-real-3-coach-board')
})
test('FIDELITY · 4 · PT package + slots (real /coach/pt)', async ({ browser }) => {
  await shoot(browser, ROLES.coach.storage, '/en/coach/pt', 'fidelity-real-4-pt')
})
test('FIDELITY · 5 · member portal home (real /portal)', async ({ browser }) => {
  await shoot(browser, ROLES.student.storage, '/en/portal', 'fidelity-real-5-member-portal', { width: 420, height: 900 })
})
test('FIDELITY · 6 · coach today / roster (real /coach)', async ({ browser }) => {
  await shoot(browser, ROLES.coach.storage, '/en/coach', 'fidelity-real-6-coach-portal', { width: 420, height: 900 })
})
