import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * DEMO-GUARDIAN — the 5th demo login (guardian@prolinegym.lb).
 *
 * Proves the login-page entry (5 demo accounts incl. Guardian, EN + AR) AND the
 * end-to-end demo: the guardian signs in → the portal kid-switcher shows the
 * linked hero student (Karim). The guardian is a PURE parent (no own membership),
 * so /portal redirects to ?kid=<Karim> → KidDashboard; the switcher renders the
 * Karim chip (the "Me" chip only appears when the guardian is also a member).
 *
 * Targets the SHARED proline-gym demo (seeded by migrations 000006/000017 +
 * 000066, not a per-worker gym). Read-only — safe under parallelism. The demo
 * password on the from-zero local CI stack is the 000008 default 'DemoPass!23'
 * (app.demo_password unset); the cloud project sets the real one out-of-band.
 */
const DEMO_PW = process.env.DEMO_PASSWORD || 'DemoPass!23'

async function freshCtx(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ locale }) // no session
  return { ctx, page: await ctx.newPage() }
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(login)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  // Leave the login page (the app pushes to /dashboard; role routing handles it).
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
}

test('DEMO-GUARDIAN · demo accounts gated behind ?demo=1 (hidden by default) incl. Guardian (EN + AR), click fills creds', async ({ browser }) => {
  // hide-demo (go-live): Proline's real login is clean; the demo buttons surface ONLY with ?demo=1.
  const en = await freshCtx(browser, 'en')
  try {
    // DEFAULT (no ?demo) → demo-account buttons ABSENT (clean prod login).
    await en.page.goto('/en/auth/login')
    await expect(en.page.locator('[data-testid="demo-account"]'),
      'demo accounts hidden by default (go-live clean login)').toHaveCount(0)
    // SHOWCASE (?demo=1) → all 5 demo logins render, the Guardian one present + clickable.
    await en.page.goto('/en/auth/login?demo=1')
    await expect(en.page.locator('[data-testid="demo-account"]'), 'all 5 demo logins render with ?demo=1')
      .toHaveCount(5)
    const guardian = en.page.locator('[data-testid="demo-account"][data-email="guardian@prolinegym.lb"]')
    await expect(guardian, 'the guardian demo account is listed').toBeVisible()
    await expect(guardian).toContainText('Guardian — Parent Portal')
    // Clicking it fills the form with the guardian credentials (UI demo password).
    await guardian.click()
    await expect(en.page.locator('#email')).toHaveValue('guardian@prolinegym.lb')
    await expect(en.page.locator('#password')).toHaveValue('ProlineDemo2024!')
  } finally {
    await en.ctx.close()
  }

  // AR — the Arabic label renders (RTL login page).
  const ar = await freshCtx(browser, 'ar')
  try {
    await ar.page.goto('/ar/auth/login?demo=1')
    await expect(ar.page.locator('[data-testid="demo-account"][data-email="guardian@prolinegym.lb"]'))
      .toContainText('ولي الأمر — بوابة الوالدين')
  } finally {
    await ar.ctx.close()
  }
})

test('DEMO-GUARDIAN · guardian login → kid-switcher shows the hero kid (Karim) · /en + /ar', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await freshCtx(browser, 'en')
  try {
    await signIn(page, 'guardian@prolinegym.lb', DEMO_PW)

    // Pure guardian → /portal redirects to the first (only) kid's dashboard.
    await page.goto('/en/portal')
    await expect(page, 'guardian-only → defaults to the linked kid').toHaveURL(/\/portal\?kid=/, { timeout: 20_000 })

    const switcher = page.locator('[data-testid="kid-switcher"]:visible').first()
    await expect(switcher, 'the kid-switcher renders').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="kid-chip"]:visible'), 'exactly one linked kid (Karim)').toHaveCount(1)
    await expect(switcher, 'the linked hero kid is Karim').toContainText('Karim')
    await expect(page.locator('[data-testid="kid-name"]:visible').first()).toContainText('Karim')
    await expect(page.locator('[data-testid="kid-dashboard"]:visible').first()).toBeVisible()
    await expect(page.locator('body'), 'i18n keys all resolve').not.toContainText('MISSING_MESSAGE')

    // /ar (RTL): same link resolves, Karim's Arabic name in the switcher.
    await page.goto('/ar/portal')
    await expect(page).toHaveURL(/\/portal\?kid=/, { timeout: 20_000 })
    await expect(page.locator('[data-testid="kid-switcher"]:visible').first(), 'kid-switcher renders on /ar')
      .toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="kid-switcher"]:visible').first()).toContainText('كريم')
  } finally {
    await ctx.close()
  }
})
