import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

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
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(login)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

/** Drive the onboarding wizard to completion (password → lang → avatar → finish). */
async function completeOnboarding(page: Page, newPassword: string) {
  await expect(page, 'forced to onboarding').toHaveURL(/\/onboarding/, { timeout: 20_000 })
  const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
  await w('ob-password').fill(newPassword)
  await w('ob-password2').fill(newPassword)
  await w('wizard-next').click()   // → language
  await w('wizard-next').click()   // → avatar
  await w('wizard-next').click()   // → orientation
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
    expect(login).toContain('@')
    expect(temp.length).toBeGreaterThan(6)
    // wa.me share link present, prefilled with the temp password.
    const wa = await vis(owner.page, '[data-testid="invite-wa-link"]').first().getAttribute('href')
    expect(wa, 'wa.me deep-link present').toContain('wa.me/')
    expect(decodeURIComponent(wa!), 'message carries the temp password').toContain(temp)
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
