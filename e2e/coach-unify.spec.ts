import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis, untilConsistent } from './helpers'

/**
 * J2 COACH-UNIFY — the unified add-coach flow at /coaches/add: Who → Login? →
 * (create) → inline Availability. Two proofs the slice adds:
 *   1. The "Login?" toggle ON adopts the coach into a REAL app login (the SAME
 *      provisioning path as staff-invite) — proven by actually signing the coach in.
 *   2. Setting availability in the post-create step makes the coach BOOKABLE
 *      (the green Coach-360 chip — the derived J3/J1 signal).
 * Hermetic: seeds its OWN gym (seed_e2e_wl_gym) + tears it (and its auth users) down.
 * Per-worker slug so a retry in a fresh worker never collides on the owner email.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `cu-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
/** Sign in a freshly-provisioned account by phone (the app resolves phone→login). */
async function signIn(page: Page, login: string, password: string) {
  await untilConsistent(async () => {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(login)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').click()
    await expect(page, 'sign-in settles off the login page').not.toHaveURL(/\/auth\/login/, { timeout: 8_000 })
  }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000, 5_000] })
}
/** Drive the onboarding wizard to completion (the on1/staff-invite helper). */
async function completeOnboarding(page: Page, newPassword: string) {
  await expect(page, 'forced to onboarding (must_change_password)').toHaveURL(/\/onboarding/, { timeout: 20_000 })
  const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
  await w('ob-password').fill(newPassword)
  await w('ob-password2').fill(newPassword)
  for (let i = 0; i < 6; i++) {
    const next = page.locator('[data-testid="wizard-next"]:visible')
    if ((await next.count()) === 0) break
    await next.first().click()
  }
  await w('wizard-submit').click()
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('COACH-UNIFY needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})

test.afterAll(async () => {
  if (!gymId) return
  // DELETE gyms cascades roles/profiles/coaches but NOT auth.users — delete the
  // gym's auth users first (incl. any coach we invited) so a re-seed can't 409.
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('COACH-UNIFY · login ON → a working coach login + availability makes them bookable', async ({ browser }) => {
  test.setTimeout(180_000)
  const coachPhone = `+96176${Date.now().toString().slice(-6)}`
  let tempPw = ''

  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/coaches/add')
    // Who
    await vis(owner.page, '[data-testid="coach-first-en"]').fill('Unify')
    await vis(owner.page, '[data-testid="coach-last-en"]').fill('Coach')
    await vis(owner.page, '[data-testid="coach-phone"]').fill(coachPhone)
    await vis(owner.page, '[data-testid="wizard-next"]').click()
    // Specialty
    await vis(owner.page, '[data-testid="coach-specialty-chip"]').first().click()
    await vis(owner.page, '[data-testid="wizard-next"]').click()
    // Login? — turn access ON, then create.
    await vis(owner.page, '[data-testid="coach-access-yes"]').click()
    await vis(owner.page, '[data-testid="wizard-submit"]').click()

    // Post-create: credentials shown (login ON). Capture the one-time password.
    await expect(vis(owner.page, '[data-testid="coach-created-panel"]').first(), 'the post-create panel appears')
      .toBeVisible({ timeout: 20_000 })
    await expect(vis(owner.page, '[data-testid="invite-result"]').first(), 'credentials shown for a granted login')
      .toBeVisible({ timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="invite-login"]').first()).toHaveText(coachPhone)
    tempPw = ((await vis(owner.page, '[data-testid="invite-temp-pw"]').first().textContent()) ?? '').trim()
    expect(tempPw.length, 'a temp password is issued').toBeGreaterThan(6)

    // Set availability inline → the coach becomes bookable.
    await vis(owner.page, '[data-testid="avail-day-pill"][data-dow="1"]').first().click()
    await vis(owner.page, '[data-testid="avail-start"]').first().fill('16:00')
    await vis(owner.page, '[data-testid="avail-end"]').first().fill('20:00')
    await vis(owner.page, '[data-testid="avail-add"]').first().click()
    await expect(vis(owner.page, '[data-testid="avail-row"]').first(), 'the window publishes (bookable)')
      .toBeVisible({ timeout: 15_000 })

    // Done → land on the new coach; the bookable chip is green.
    await vis(owner.page, '[data-testid="coach-created-done"]').click()
    await expect(owner.page, 'lands on the new coach').toHaveURL(/\/en\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="coach-bookable-chip"]').first(), 'bookable green after availability set')
      .toHaveAttribute('data-bookable', 'yes', { timeout: 15_000 })
  } finally {
    await owner.ctx.close()
  }

  // The login WORKS: sign the coach in by phone → onboarding → the coach app.
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await signIn(page, coachPhone, tempPw)
    await completeOnboarding(page, 'NewCoachPass!1')
    await expect(page, 'the coach lands in the coach app').toHaveURL(/\/coach(\/|$|\?)/, { timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})

test('COACH-UNIFY · login OFF → a login-less coach; availability is skippable', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/coaches/add')
    await vis(owner.page, '[data-testid="coach-first-en"]').fill('NoLogin')
    await vis(owner.page, '[data-testid="coach-last-en"]').fill('Coach')
    await vis(owner.page, '[data-testid="wizard-next"]').click()
    await vis(owner.page, '[data-testid="coach-specialty-chip"]').first().click()
    await vis(owner.page, '[data-testid="wizard-next"]').click()
    // Login? defaults OFF → no credentials, and availability is skippable.
    await vis(owner.page, '[data-testid="wizard-submit"]').click()
    await expect(vis(owner.page, '[data-testid="coach-created-panel"]').first()).toBeVisible({ timeout: 20_000 })
    await expect(owner.page.getByTestId('invite-result'), 'no credentials for a login-less coach').toHaveCount(0)
    await expect(vis(owner.page, '[data-testid="coach-not-bookable-note"]').first(), 'skippable: not bookable yet')
      .toBeVisible({ timeout: 15_000 })
    // Skip availability → land on the coach; NOT bookable (no windows).
    await vis(owner.page, '[data-testid="coach-created-done"]').click()
    await expect(owner.page).toHaveURL(/\/en\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(vis(owner.page, '[data-testid="coach-bookable-chip"]').first())
      .toHaveAttribute('data-bookable', 'no', { timeout: 15_000 })
  } finally {
    await owner.ctx.close()
  }
})
