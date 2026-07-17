import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis, untilConsistent } from './helpers'

/**
 * AUTH-EASE — friendly first-login. Hermetic OWN gym (seed_e2e_wl_gym also seeds a
 * login-less "Adopt Member"), so this drives the whole lifecycle in isolation without
 * perturbing the shared-gym ON-1 fixtures:
 *   R1  the REAL invite mints a friendly, dictate-safe temp password (TwoWords+2 digits,
 *       ≥8, no l/1/O/0/I).
 *   R2  first sign-in lands on the clean "set your password" screen with the temp-password
 *       context line — captured en + ar on a MOBILE viewport (where these logins happen).
 *   R3/R4  the app-side minimum is 8: 7 chars is rejected (Next disabled + hint), 8 accepted.
 *   R4  forced change → the OLD temp password is dead, the NEW one works.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `authease-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const NEW_PW = 'BravoTango44' // the member's chosen password (12 chars)
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function ownerLogin(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
/** Poll the whole sign-in until it SETTLES off the login page (create-then-login race). */
async function signInExpectingSuccess(page: Page, login: string, password: string) {
  await untilConsistent(async () => {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(login)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').click()
    await expect(page, 'sign-in settles off the login page').not.toHaveURL(/\/auth\/login/, { timeout: 8_000 })
  }, { timeout: 60_000, intervals: [3_000, 5_000, 8_000, 12_000] })
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('AUTH-EASE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  // The seed's login-less "Adopt Member" carries a HARDCODED phone (+96176000501) in
  // EVERY gym. GoTrue enforces phone uniqueness GLOBALLY (the app's phone-owner guard
  // is only gym-scoped), so inviting our copy would collide with the shared-gym ON-1
  // member. Give ours a gym-unique phone (derived from the gym uuid's digits) first.
  const mem = (await (await svc(`profiles?gym_id=eq.${gymId}&first_name_en=eq.Adopt&last_name_en=eq.Member&select=id`)).json()) as Array<{ id: string }>
  const uniquePhone = '+9617' + (gymId.replace(/[^0-9]/g, '') + '0000000').slice(0, 7)
  await svc(`profiles?id=eq.${mem[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ phone: uniquePhone }) })
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('AUTH-EASE · friendly temp → first-login set-password (en+ar mobile) → min-8 boundary → old dead, new works', async ({ browser }) => {
  test.setTimeout(240_000)

  // ── R1: the owner invites the login-less member → a FRIENDLY temp password ──
  let login = '', temp = ''
  const owner = await ownerLogin(browser)
  try {
    await owner.page.goto('/en/students?search=Adopt')
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Adopt Member' }).first().click()
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(owner.page, '[data-testid="invite-btn"]').first().click()
    await expect(vis(owner.page, '[data-testid="invite-result"]').first(), 'invite returns credentials').toBeVisible({ timeout: 20_000 })
    login = (await vis(owner.page, '[data-testid="invite-login"]').first().textContent())!.trim()
    temp = (await vis(owner.page, '[data-testid="invite-temp-pw"]').first().textContent())!.trim()
    // R1 PROOF (end-to-end): the real invite minted TwoWords+2digits, ≥8, no ambiguous glyphs.
    expect(temp, `temp "${temp}" is TwoWords + 2 digits`).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[2-9]{2}$/)
    expect(temp, 'temp avoids l/1/O/0/I').not.toMatch(/[l1O0I]/)
    expect(temp.length).toBeGreaterThanOrEqual(8)
  } finally {
    await owner.ctx.close()
  }

  // ── R2: the member's first sign-in (MOBILE) lands on the set-password screen ──
  const member = await browser.newContext({ locale: 'en', viewport: { width: 390, height: 844 } })
  const page = await member.newPage()
  try {
    await signInExpectingSuccess(page, login, temp)
    await expect(page, 'forced to onboarding').toHaveURL(/\/onboarding/, { timeout: 20_000 })
    const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
    // R2: the temp-password context line + the clean password step.
    await expect(w('ob-password-context'), 'the temp-password context line shows').toBeVisible()
    await page.screenshot({ path: 'screenshots/auth-ease-setpw-en-mobile.png' })

    // R2 (ar): same screen, Arabic RTL, mobile — still must_change_password, so it renders.
    await page.goto('/ar/onboarding')
    await expect(page.getByTestId('ob-password-context'), 'ar temp-password context line').toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'screenshots/auth-ease-setpw-ar-mobile.png' })

    // ── R3/R4: the min-8 boundary — 7 rejected, 8 accepted ──
    await page.goto('/en/onboarding')
    await expect(w('ob-password'), 'back on the en password step').toBeVisible({ timeout: 15_000 })
    await w('ob-password').fill('1234567')   // 7
    await w('ob-password2').fill('1234567')
    await expect(page.locator('[data-testid="wizard-next"]:visible').first(),
      '7 chars cannot advance (app-side min 8)').toBeDisabled()
    await expect(page.getByText(/At least 8 characters/), 'the too-short hint says 8').toBeVisible()
    await w('ob-password').fill('12345678')  // 8 — the boundary
    await w('ob-password2').fill('12345678')
    await expect(page.locator('[data-testid="wizard-next"]:visible').first(),
      '8 chars is accepted').toBeEnabled()

    // ── R4: complete the forced change with the member's real new password ──
    await w('ob-password').fill(NEW_PW)
    await w('ob-password2').fill(NEW_PW)
    for (let i = 0; i < 6; i++) {
      const next = page.locator('[data-testid="wizard-next"]:visible')
      if (await next.count() === 0) break
      await next.first().click()
    }
    await w('wizard-submit').click()
    await expect(page, 'onboarding completes (flag cleared → off /onboarding)')
      .not.toHaveURL(/\/onboarding/, { timeout: 30_000 })
  } finally {
    await member.close()
  }

  // ── R4: the OLD temp password is now DEAD (single attempt — no untilConsistent retry) ──
  const dead = await browser.newContext({ locale: 'en' })
  const deadPage = await dead.newPage()
  try {
    await deadPage.goto('/en/auth/login')
    await deadPage.locator('#email').fill(login)
    await deadPage.locator('#password').fill(temp)
    await deadPage.locator('button[type="submit"]').click()
    await expect(deadPage, 'the old temp password no longer signs in').toHaveURL(/\/auth\/login/, { timeout: 10_000 })
  } finally {
    await dead.close()
  }

  // ── R4: the NEW password works (and skips onboarding — flag cleared) ──
  const fresh = await browser.newContext({ locale: 'en' })
  const freshPage = await fresh.newPage()
  try {
    await signInExpectingSuccess(freshPage, login, NEW_PW)
    await expect(freshPage, 'the new password signs in past onboarding').not.toHaveURL(/\/onboarding|\/auth\/login/, { timeout: 20_000 })
  } finally {
    await fresh.close()
  }
})
