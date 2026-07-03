import { test, expect, type Page } from '@playwright/test'

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
