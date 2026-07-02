import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/**
 * ON-1 — portal/app invites (Option B identity adoption). Drives the dedicated
 * login-less fixtures (000054): "Adopt Member" (student + a PAID pre-adoption
 * invoice) and "Adopt Coachee" (coach). Needs SUPABASE_SERVICE_ROLE_KEY in the
 * CI webServer (the invite/onboarding actions call the GoTrue admin API).
 *
 * CREDENTIAL NOTE: phone logins are disabled on this project, so the invite
 * credentials with a synthetic email (phone-derived) + keeps phone for G1. The
 * member signs in with that email + temp password.
 */
async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

async function freshCtx(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' }) // no session
  return { ctx, page: await ctx.newPage() }
}

async function signIn(page: Page, login: string, password: string) {
  // ON1-RESILIENCE: the invite's GoTrue admin createUser + the phone→email resolver
  // are server-side async — the just-created account isn't always resolvable the
  // instant we proceed, so an immediate login hits the create-then-login race and
  // fails (stays on /auth/login), and the test then races the redirect. POLL the
  // WHOLE sign-in (ml1/off2 untilConsistent style): re-attempt until it actually
  // SETTLES OFF the login page — i.e. the account propagated, login succeeded, and
  // the redirect settled — instead of racing. No assertion is weakened: login MUST
  // succeed within the window; a genuinely-broken login still fails (throws at 60s).
  await untilConsistent(async () => {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(login)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').click()
    // Settled = left the login page (the app pushes to /dashboard; role routing /
    // the onboarding gate take over). A still-propagating account stays on
    // /auth/login (error) → this fails → untilConsistent re-attempts.
    await expect(page, 'sign-in settles off the login page (account propagated)')
      .not.toHaveURL(/\/auth\/login/, { timeout: 8_000 })
  }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000, 5_000] })
}

/** Drive the onboarding wizard to completion (password → lang → avatar → finish). */
async function completeOnboarding(page: Page, newPassword: string) {
  await expect(page, 'forced to onboarding').toHaveURL(/\/onboarding/, { timeout: 20_000 })
  const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
  // PWD-FOCUS guard: type the password ONE CHARACTER AT A TIME (pressSequentially,
  // not fill). A regression where the password <Input> is rebuilt every render —
  // losing focus after a single keystroke — would let only the first character
  // land; assert the FULL value stuck in each field. fill() masks this (one atomic
  // input event), which is why the original bug shipped green.
  const pwField = w('ob-password')
  await pwField.click()
  await pwField.pressSequentially(newPassword, { delay: 25 })
  await expect(pwField, 'new-password holds focus across keystrokes — full value lands').toHaveValue(newPassword)
  const pw2Field = w('ob-password2')
  await pw2Field.click()
  await pw2Field.pressSequentially(newPassword, { delay: 25 })
  await expect(pw2Field, 'confirm-password holds focus across keystrokes — full value lands').toHaveValue(newPassword)
  // Advance through all intermediate steps to the last (F3 added an OPTIONAL
  // waiver step for members with their own student → the wizard length varies;
  // members get it, coaches don't). Step-count-agnostic: click Next until Submit.
  for (let i = 0; i < 6; i++) {
    const next = page.locator('[data-testid="wizard-next"]:visible')
    if (await next.count() === 0) break
    await next.first().click()
  }
  await w('wizard-submit').click() // finish
}

test('ON-1 · member invite → onboarding → portal (identity intact) + wa.me + re-invite idempotent', async ({ browser }) => {
  test.setTimeout(240_000)
  const owner = await ownerCtx(browser)
  let login = '', temp = ''
  try {
    // Open the seeded login-less member's file and invite.
    await owner.page.goto('/en/students?search=Adopt')
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Adopt Member' }).first().click()
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(owner.page, '[data-testid="invite-btn"]').first().click()
    await expect(vis(owner.page, '[data-testid="invite-result"]').first(), 'invite returns credentials').toBeVisible({ timeout: 20_000 })
    login = (await vis(owner.page, '[data-testid="invite-login"]').first().textContent())!.trim()
    temp = (await vis(owner.page, '[data-testid="invite-temp-pw"]').first().textContent())!.trim()
    // INVITE-PHONE-UX (Option B): the invite now surfaces the member's PHONE as the login
    // (the synthetic email stays hidden). Signing in with it below exercises the server-side
    // phone→email resolver end-to-end — a stronger check than the old synthetic-email assert.
    expect(login, 'invite surfaces the phone as the login').toMatch(/^\+?[0-9][0-9\s-]{5,}$/)
    expect(login, 'no synthetic email surfaced to staff').not.toContain('@')
    expect(temp.length).toBeGreaterThan(6)
    // wa.me share link present, prefilled with the temp password.
    const wa = await vis(owner.page, '[data-testid="invite-wa-link"]').first().getAttribute('href')
    expect(wa, 'wa.me deep-link present').toContain('wa.me/')
    expect(decodeURIComponent(wa!), 'message carries the temp password').toContain(temp)
    // INVITE-MSG-URL: the message includes a tappable login URL (app origin + /auth/login).
    expect(decodeURIComponent(wa!), 'message carries the login URL').toContain('/auth/login')
  } finally {
    await owner.ctx.close()
  }

  // ── New context: the member signs in with the temp credential ──
  const member = await freshCtx(browser)
  try {
    await signIn(member.page, login, temp)
    await completeOnboarding(member.page, 'NewMemberPass!1')
    await expect(member.page, 'lands in the member portal').toHaveURL(/\/portal/, { timeout: 20_000 })

    // Identity integrity: the pre-adoption PAID invoice still resolves for them
    // (RLS intact — auth.uid() == the unchanged profile id).
    await member.page.goto('/en/portal/billing')
    await expect(
      member.page.locator('body'),
      'a pre-existing invoice still resolves on the adopted member',
    ).toContainText('55.50', { timeout: 15_000 })
  } finally {
    await member.ctx.close()
  }

  // ── Re-invite idempotency: a second invite regenerates the temp, no error ──
  const owner2 = await ownerCtx(browser)
  try {
    await owner2.page.goto('/en/students?search=Adopt')
    await vis(owner2.page, '[data-testid="student-card"]').filter({ hasText: 'Adopt Member' }).first().click()
    await vis(owner2.page, '[data-testid="invite-btn"]').first().click()
    await expect(vis(owner2.page, '[data-testid="invite-result"]').first(), 're-invite succeeds').toBeVisible({ timeout: 20_000 })
    await expect(owner2.page.locator('[data-testid="invite-error"]')).toHaveCount(0)
    const temp2 = (await vis(owner2.page, '[data-testid="invite-temp-pw"]').first().textContent())!.trim()
    expect(temp2.length, 'a fresh temp password was generated').toBeGreaterThan(6)
  } finally {
    await owner2.ctx.close()
  }
})

test('ON-1 · team invite (coach) → onboarding → coach app with coach role', async ({ browser }) => {
  test.setTimeout(240_000)
  const owner = await ownerCtx(browser)
  let login = '', temp = ''
  try {
    await owner.page.goto('/en/coaches')
    await vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: 'Adopt Coachee' }).first().click()
    await expect(owner.page).toHaveURL(/\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(owner.page, '[data-testid="invite-btn"]').first().click()
    await expect(vis(owner.page, '[data-testid="invite-result"]').first()).toBeVisible({ timeout: 20_000 })
    login = (await vis(owner.page, '[data-testid="invite-login"]').first().textContent())!.trim()
    temp = (await vis(owner.page, '[data-testid="invite-temp-pw"]').first().textContent())!.trim()
  } finally {
    await owner.ctx.close()
  }

  const coach = await freshCtx(browser)
  try {
    await signIn(coach.page, login, temp)
    await completeOnboarding(coach.page, 'NewCoachPass!1')
    // Lands in the COACH app (role routing — elevated scope), not the member portal.
    await expect(coach.page, 'lands in the coach app').toHaveURL(/\/coach(\/|$|\?)/, { timeout: 20_000 })
    await expect(
      coach.page.locator('[data-testid="shell-badge"][data-shell="coach"]:visible').first(),
      'the coach shell (coach role) is active',
    ).toBeVisible({ timeout: 15_000 })
  } finally {
    await coach.ctx.close()
  }
})
