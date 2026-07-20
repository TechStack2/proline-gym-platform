import { test, expect, type Page } from '@playwright/test'
import { roleEmail, E2E_PASSWORD } from './roles'

/**
 * LOGIN-LIMITER — the auth limiter is per-(IP + identifier), not per-IP.
 *
 * Old posture: 5 req/min per IP in the middleware — a gym's members share NAT
 * wifi (one IP), so five attempts locked the whole building out at check-in,
 * and CI retry loops self-doomed the union gate. New posture: a tight
 * per-identifier limit (default 5/min) lives in the phone sign-in server
 * action; the middleware keeps a high pure-IP flood backstop (default 30/min).
 *
 * This guard proves — from ONE IP (the runner):
 *   1. wrong password ×5 on ONE identifier → attempt 6 is rate-limited
 *      (the distinct too-many-attempts message), and
 *   2. a DIFFERENT identifier right after still gets the ordinary generic
 *      failure — NOT the limiter — so one noisy account can't lock out the
 *      rest of the gym's wifi.
 * The limiter keys on the SUBMITTED identifier whether or not an account
 * exists (no existence leak), so fixture phones need no real accounts.
 */
const GENERIC = 'An error occurred during login'
const LIMITED = 'Too many attempts'

async function attemptPhoneLogin(page: Page, phone: string, password: string) {
  await page.locator('#email').fill(phone)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

test('LOGIN-LIMITER · per-identifier: 6th wrong attempt on one phone is limited; another phone from the SAME IP is not', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ locale: 'en' }) // anon, one "IP"
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    const PHONE_A = '+96170001111'
    const PHONE_B = '+96170002222'

    // 5 wrong attempts on identifier A → each fails with the GENERIC error.
    for (let i = 1; i <= 5; i++) {
      await attemptPhoneLogin(page, PHONE_A, `Wrong${i}!x`)
      await expect(page.getByText(GENERIC), `attempt ${i} fails generically (not limited)`)
        .toBeVisible({ timeout: 15_000 })
    }

    // Attempt 6 on A → the per-identifier limiter fires (distinct message).
    await attemptPhoneLogin(page, PHONE_A, 'Wrong6!x')
    await expect(page.getByText(LIMITED, { exact: false }),
      'attempt 6 on the SAME identifier is rate-limited').toBeVisible({ timeout: 15_000 })

    // Identifier B from the SAME IP, immediately: ordinary generic failure —
    // NOT the limiter. (Old per-IP posture would have 429'd everyone by now.)
    await attemptPhoneLogin(page, PHONE_B, 'Wrong1!x')
    await expect(page.getByText(GENERIC),
      'a different identifier from the same IP fails generically (not limited)').toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(LIMITED, { exact: false }),
      'the limited message is NOT shown for identifier B').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

/**
 * AUTH-STUCK — the login screen must never hang silently (P1 field failure:
 * a prod owner's network dropped mid sign-in; the server-action await rejected,
 * the exception escaped the handler, and the spinner spun forever).
 *
 * SW note: the app registers a service worker in prod builds, and the known
 * page.route()+continue() hang applies under it — so these tests ONLY abort or
 * HOLD intercepted requests (never continue): abort exercises the reject path,
 * an unsettled route exercises the stall path. Aborted requests never reach the
 * server, so they also never consume per-identifier limiter attempts.
 */
test('AUTH-STUCK · transport failure: spinner clears, connection error shows, form recovers', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')

    // From here, the only request matching the login URL is the server-action
    // POST (the page is already loaded; /auth/forgot etc. don't match). Abort =
    // the browser's own offline failure shape (fetch TypeError).
    await page.route('**/auth/login**', (r) => r.abort('internetdisconnected'))

    await page.locator('#email').fill(roleEmail('owner'))
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()

    // (a) the distinct CONNECTION error is visible (not the generic credential one),
    await expect(page.getByTestId('login-error'), 'transport failure surfaces the connection state')
      .toContainText('Connection problem', { timeout: 15_000 })
    // (b) the spinner cleared — the submit button is enabled again,
    await expect(page.locator('button[type="submit"]'), 'loading state cleared').toBeEnabled()

    // (c) the form is usable again: lift the network failure, same submit succeeds.
    await page.unroute('**/auth/login**')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
  } finally {
    await ctx.close()
  }
})

test('AUTH-STUCK · success-path stall: navigation grace stops the spinner with a retry affordance', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')

    // HOLD every /dashboard fetch (never settle the route — no continue, no
    // abort): sign-in succeeds server-side, but the post-login navigation can
    // never complete — the exact "signed in on a dying connection" stall.
    await page.route('**/dashboard**', () => { /* intentionally never settled */ })

    await page.locator('#email').fill(roleEmail('owner'))
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()

    // Within the ~8s grace + margin: the spinner stops and the slow-navigation
    // message appears instead of spinning silently.
    await expect(page.getByTestId('login-error'), 'stalled navigation surfaces the slow-nav state')
      .toContainText('taking too long', { timeout: 15_000 })
    await expect(page.locator('button[type="submit"]'), 'retry affordance — button usable again').toBeEnabled()
  } finally {
    await ctx.close()
  }
})
