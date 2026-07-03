import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, gymSlug, untilConsistent } from './helpers'

/**
 * STAFF-INVITE — the in-app way to create staff logins (audit P1).
 *   1. Owner invites a RECEPTIONIST from the team page (name + phone + role) →
 *      she logs in BY PHONE with the temp password (must_change_password →
 *      onboarding) → lands on the staff dashboard (receptionist access).
 *   2. A coach WITHOUT a phone shows the inline "add a phone to invite" prompt
 *      (link to edit) instead of dead-ending on no_phone after the click.
 */
const RUN = Date.now().toString().slice(-7)
const RECEP_PHONE = `+96171${RUN}`
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

/** ON1-RESILIENCE pattern: poll the whole sign-in until it settles off the login
 *  page (the just-created account propagates; the redirect fires). */
async function signIn(page: Page, login: string, password: string) {
  await untilConsistent(async () => {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(login)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').click()
    await expect(page, 'sign-in settles off the login page').not.toHaveURL(/\/auth\/login/, { timeout: 8_000 })
  }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000, 5_000] })
}

/** Drive the onboarding wizard to completion (the on1 helper, step-count-agnostic). */
async function completeOnboarding(page: Page, newPassword: string) {
  await expect(page, 'forced to onboarding (must_change_password)').toHaveURL(/\/onboarding/, { timeout: 20_000 })
  const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
  await w('ob-password').fill(newPassword)
  await w('ob-password2').fill(newPassword)
  for (let i = 0; i < 6; i++) {
    const next = page.locator('[data-testid="wizard-next"]:visible')
    if (await next.count() === 0) break
    await next.first().click()
  }
  await w('wizard-submit').click()
}

test('STAFF-INVITE · owner invites a receptionist → phone login → onboarding → staff dashboard', async ({ browser }) => {
  test.setTimeout(240_000)
  const owner = await ownerCtx(browser)
  let temp = ''
  try {
    // ── The team-page staff-invite surface (owner/head_coach-gated) ──
    await owner.page.goto('/en/coaches')
    await vis(owner.page, '[data-testid="invite-staff-btn"]').first().click()
    const form = vis(owner.page, '[data-testid="invite-staff-form"]').first()
    await expect(form).toBeVisible()
    await form.getByTestId('staff-first-name').fill('Rima')
    await form.getByTestId('staff-last-name').fill('Desk')
    await form.getByTestId('staff-phone').fill(RECEP_PHONE)
    await form.locator('[data-testid="staff-role"][data-value="receptionist"]').click()
    await form.getByTestId('staff-invite-submit').click()

    // The shared credential card: phone as the login + a one-time temp password.
    await expect(vis(owner.page, '[data-testid="invite-result"]').first(), 'staff invite returns credentials').toBeVisible({ timeout: 20_000 })
    const login = (await vis(owner.page, '[data-testid="invite-login"]').first().textContent())!.trim()
    temp = (await vis(owner.page, '[data-testid="invite-temp-pw"]').first().textContent())!.trim()
    expect(login, 'the phone is the login').toBe(RECEP_PHONE)
    expect(temp.length).toBeGreaterThan(6)
    const wa = await vis(owner.page, '[data-testid="invite-wa-link"]').first().getAttribute('href')
    expect(wa, 'wa.me share present').toContain('wa.me/')
    expect(decodeURIComponent(wa!), 'message carries the login URL').toContain('/auth/login')
  } finally {
    await owner.ctx.close()
  }

  // ── The receptionist signs in BY PHONE → onboarding → staff dashboard ──
  const ctx = await browser.newContext({ locale: 'en' }) // fresh, no session
  const page = await ctx.newPage()
  try {
    await signIn(page, RECEP_PHONE, temp)
    await completeOnboarding(page, 'NewRecepPass!1')
    // Receptionist role home = the staff dashboard (/dashboard → /today).
    await expect(page, 'lands on the staff dashboard').toHaveURL(/\/(dashboard|today)(\/|$|\?)/, { timeout: 20_000 })
    await expect(page.locator('body'), 'staff surface renders (no missing keys)').not.toContainText('MISSING_MESSAGE')
  } finally {
    await ctx.close()
  }
})

test('STAFF-INVITE · a coach WITHOUT a phone shows the inline add-a-phone prompt (no dead-end)', async ({ browser }) => {
  test.setTimeout(120_000)
  if (!URL || !KEY) throw new Error('needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')

  // Seed a PHONE-LESS coach on this worker's run gym (service role).
  const gymRes = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(gymSlug())}&select=id`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  const gymId = ((await gymRes.json()) as Array<{ id: string }>)[0]?.id
  expect(gymId, 'run gym resolves').toBeTruthy()
  const profRes = await fetch(`${URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ gym_id: gymId, first_name_en: 'NoPhone', first_name_ar: 'بدون', first_name_fr: 'NoPhone', last_name_en: `Coach${RUN}`, last_name_ar: `Coach${RUN}`, last_name_fr: `Coach${RUN}` }),
  })
  const profileId = ((await profRes.json()) as Array<{ id: string }>)[0]?.id
  expect(profileId, 'phone-less profile created').toBeTruthy()
  const coachRes = await fetch(`${URL}/rest/v1/coaches`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: profileId, gym_id: gymId, is_active: true }),
  })
  const coachId = ((await coachRes.json()) as Array<{ id: string }>)[0]?.id
  expect(coachId, 'phone-less coach created').toBeTruthy()

  const owner = await ownerCtx(browser)
  try {
    await owner.page.goto(`/en/coaches/${coachId}`)
    // The inline prompt REPLACES the invite affordance — no dead-end no_phone click.
    await expect(vis(owner.page, '[data-testid="invite-needs-phone"]').first(), 'inline add-a-phone prompt shows').toBeVisible({ timeout: 15_000 })
    await expect(owner.page.locator('[data-testid="coach-admin-bar"] [data-testid="invite-btn"]'), 'no invite button to dead-end on').toHaveCount(0)
    await expect(vis(owner.page, '[data-testid="invite-add-phone"]').first(), 'links to edit (add the phone)').toHaveAttribute('href', new RegExp(`/coaches/${coachId}/edit`))
  } finally {
    await owner.ctx.close()
  }
})
