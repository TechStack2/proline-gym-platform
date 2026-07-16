import { test, type BrowserContext, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

/**
 * DEMO-GYM + SHOT-SWAP · R2 — capture the SIX real product surfaces of the
 * purpose-built demo gym (deep-teal brand) that back the Praxella landing
 * vignettes. Runs against the ephemeral CI stack:
 *   1. seeds slug "demo" via the SAME script the auditor runs against prod
 *      (scripts/seed-demo-gym.js, service-role key from the CI env — no cloud
 *      secret; the local stack mints its own key into the process env),
 *   2. logs in as the demo owner / coach / member through the real login form,
 *   3. captures each surface tight-cropped to its meaningful container, at fixed
 *      viewports, light theme, in EN and AR → screenshots/demo-<surface>-<loc>.png
 *      (uploaded as the e2e-screenshots artifact; optimised to WebP at commit time).
 *
 * Serial + single describe → one worker seeds once (the demo gym is a single shared
 * tenant, not per-worker). Screenshot-only; asserts nothing about product state.
 */

const PWD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const DESKTOP = { width: 1440, height: 1000 }
const PHONE = { width: 390, height: 844 }
const OUT = 'screenshots'

async function login(ctx: BrowserContext, email: string): Promise<Page> {
  const page = await ctx.newPage()
  await page.goto('/en/auth/login', { waitUntil: 'domcontentloaded' })
  await page.fill('#email', email)
  await page.fill('#password', PWD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 }).catch(() => {})
  return page
}

/** Navigate + tight-crop the located surface (falls back to <main>, then viewport). */
async function shoot(page: Page, url: string, selector: string, out: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(1400)
  const target = page.locator(selector).first()
  const el = (await target.count()) ? target : page.locator('main').first()
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 5_000 })
    await page.waitForTimeout(300)
    await el.screenshot({ path: `${OUT}/${out}.png` })
  } catch {
    await page.screenshot({ path: `${OUT}/${out}.png`, fullPage: false })
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('DEMO-GYM marketing capture', () => {
  test.beforeAll(() => {
    // clean-slate seed of the demo gym into the local stack (idempotent; --reset so
    // repeat CI runs start fresh). Same script the auditor applies to prod.
    execSync('node scripts/seed-demo-gym.js --reset', {
      env: { ...process.env, DEMO_SEED_PASSWORD: PWD },
      stdio: 'inherit',
      timeout: 180_000,
    })
  })

  for (const loc of ['en', 'ar'] as const) {
    test(`owner surfaces · ${loc} (week board · signups · coach board)`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: DESKTOP, locale: loc })
      const page = await login(ctx, 'owner+demo@e2e.local')
      await shoot(page, `/${loc}/schedule`, '[data-testid="week-grid"]', `demo-board-${loc}`)
      await shoot(page, `/${loc}/leads`, 'main', `demo-signups-${loc}`)
      await shoot(page, `/${loc}/schedule?view=day`, '[data-testid="coach-diary"]', `demo-coachboard-${loc}`)
      await ctx.close()
    })

    test(`coach PT surface · ${loc}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: DESKTOP, locale: loc })
      const page = await login(ctx, 'coach+demo@e2e.local')
      await shoot(page, `/${loc}/coach/pt`, 'main', `demo-pt-${loc}`)
      await ctx.close()
    })

    test(`coach portal (mobile) · ${loc}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: PHONE, locale: loc })
      const page = await login(ctx, 'coach+demo@e2e.local')
      await shoot(page, `/${loc}/coach`, '[data-testid="coach-360-portal"]', `demo-coach-${loc}`)
      await ctx.close()
    })

    test(`member portal (mobile) · ${loc}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: PHONE, locale: loc })
      const page = await login(ctx, 'student+demo@e2e.local')
      await shoot(page, `/${loc}/portal`, '[data-testid="self-view"]', `demo-member-${loc}`)
      await ctx.close()
    })
  }
})
