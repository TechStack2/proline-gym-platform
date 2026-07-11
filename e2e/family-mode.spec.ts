import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis } from './helpers'

/**
 * MJ-1 FAMILY-DOOR — the family account model end-to-end (guardian-first).
 *
 * Proves, on a HERMETIC own gym (the coach-unify pattern — its own gym + owner,
 * torn down after):
 *  1. FAMILY MODE, guardian-first: name + phone entered ONCE creates the guardian +
 *     TWO kids linked under them (no per-kid phone), and the DUAL-HAT toggle gives
 *     the guardian their OWN student record — the household panel shows both kids.
 *  2. ELIGIBILITY: a minor's Member-360 gates the Invite behind "guardian holds
 *     access"; flipping the staff override to "can log in" reveals the invite.
 *  3. INVITE-GUARDIAN issues parent credentials; the CREDENTIAL INVARIANT then
 *     blocks a second login on the same phone (a duplicate-phone member can't invite).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `fam-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
// One guardian phone shared across the file — the invariant test reuses it.
const GUARDIAN_PHONE = `+96179${Date.now().toString().slice(-6)}`
const GUARDIAN_NAME = 'Nabil Family'
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function loginOwner(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
const w = (page: Page, tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('FAMILY-MODE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})
test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('FAMILY-MODE · guardian-first: one phone → guardian + 2 kids + dual-hat, household shows both', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    await page.goto('/en/students/add')
    await expect(w(page, 'add-student-wizard')).toBeVisible({ timeout: 20_000 })

    // Switch to the family path.
    await w(page, 'sw-mode-family').click()

    // (a) GUARDIAN once — search finds nothing → name a new guardian.
    await w(page, 'fam-guardian-phone').fill(GUARDIAN_PHONE)
    await w(page, 'fam-guardian-search').click()
    await expect(w(page, 'fam-guardian-name'), 'no match → name a new guardian').toBeVisible({ timeout: 10_000 })
    await w(page, 'fam-guardian-name').fill(GUARDIAN_NAME)
    await page.screenshot({ path: 'screenshots/family-wizard-guardian.png', fullPage: true }).catch(() => {})
    await w(page, 'wizard-next').click()

    // (b) KIDS — two, phone-free.
    await expect(w(page, 'wizard-step-kids')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-testid="fam-kid-name-en"]:visible').nth(0).fill('Kid One')
    await page.locator('[data-testid="fam-kid-dob"]:visible').nth(0).fill('2016-03-03')
    await w(page, 'fam-add-kid').click()
    await page.locator('[data-testid="fam-kid-name-en"]:visible').nth(1).fill('Kid Two')
    await page.locator('[data-testid="fam-kid-dob"]:visible').nth(1).fill('2018-04-04')
    await page.screenshot({ path: 'screenshots/family-wizard-kids.png', fullPage: true }).catch(() => {})
    await w(page, 'wizard-next').click()

    // (c) DUAL-HAT — the parent trains too.
    await w(page, 'fam-parent-trains').check()
    await w(page, 'wizard-next').click()

    // (d) REVIEW — family on one screen; do NOT send the invite here.
    await expect(w(page, 'fam-review')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="fam-review-kid"]:visible')).toHaveCount(2)
    await expect(w(page, 'fam-review-dualhat')).toBeVisible()
    await page.screenshot({ path: 'screenshots/family-wizard-review.png', fullPage: true }).catch(() => {})
    await w(page, 'wizard-submit').click()

    // Lands on the first kid's Member-360 with the guardian linked.
    await page.waitForURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await expect(vis(page, '[data-testid="guardian-row"]').filter({ hasText: GUARDIAN_NAME }).first()).toBeVisible({ timeout: 20_000 })

    // Both kids AND the dual-hat guardian are now students.
    await page.goto('/en/students')
    for (const nm of ['Kid One', 'Kid Two', GUARDIAN_NAME]) {
      await expect(page.locator('[data-testid="student-card"]:visible').filter({ hasText: nm }).first(), `${nm} is a member`).toBeVisible({ timeout: 15_000 })
    }

    // The guardian's Member-360 household lists BOTH kids — one phone, one identity.
    await page.locator('[data-testid="student-card"]:visible').filter({ hasText: GUARDIAN_NAME }).first().click()
    await expect(w(page, 'panel-household')).toBeVisible({ timeout: 20_000 })
    await expect(w(page, 'panel-household')).toContainText('Kid One')
    await expect(w(page, 'panel-household')).toContainText('Kid Two')
  } finally {
    await ctx.close()
  }
})

test('FAMILY-MODE · a minor gates the invite behind the guardian; the staff override reveals it', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    // Reach a kid's Member-360 (a minor with the age-derived default → not eligible).
    await page.goto('/en/students')
    await page.locator('[data-testid="student-card"]:visible').filter({ hasText: 'Kid One' }).first().click()
    await expect(w(page, 'portal-access')).toBeVisible({ timeout: 20_000 })
    // The invite is gated — the guardian is the family's door. Scope to portal-access:
    // the guardian panel on this kid's page also renders an invite-btn (the parent invite).
    await expect(w(page, 'invite-blocked-guardian')).toBeVisible()
    await expect(w(page, 'portal-access').locator('[data-testid="invite-btn"]'), 'the member invite is gated').toHaveCount(0)
    await page.screenshot({ path: 'screenshots/member-eligibility-gated.png', fullPage: true }).catch(() => {})
    // Staff override → "can log in" LIFTS the guardian block. Kid One is phone-free, so
    // the honest revealed state is the "add a phone to invite" prompt (a phone-free member
    // still can't be invited without a number) — either way the guardian gate is gone.
    await w(page, 'portal-eligibility-yes').click()
    await expect(w(page, 'portal-access').locator('[data-testid="invite-blocked-guardian"]'), 'the guardian gate lifts').toHaveCount(0, { timeout: 15_000 })
    await expect(w(page, 'portal-access').locator('[data-testid="invite-needs-phone"]'), 'eligible but phone-free → add-a-phone prompt').toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('FAMILY-MODE · inviting the guardian issues credentials; a duplicate phone is refused', async ({ browser }) => {
  test.setTimeout(150_000)
  const { ctx, page } = await loginOwner(browser)
  try {
    // (a) Invite the guardian from a kid's guardian panel → credentials issued once.
    await page.goto('/en/students')
    await page.locator('[data-testid="student-card"]:visible').filter({ hasText: 'Kid One' }).first().click()
    const guardianRow = vis(page, '[data-testid="guardian-row"]').filter({ hasText: GUARDIAN_NAME }).first()
    await expect(guardianRow).toBeVisible({ timeout: 20_000 })
    await guardianRow.locator('[data-testid="invite-btn"]').click()
    await expect(w(page, 'invite-result'), 'the guardian gets a portal login').toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: 'screenshots/family-guardian-invite.png', fullPage: true }).catch(() => {})

    // (b) A NEW member on the guardian's phone — creating is fine (phones may repeat)…
    await page.goto('/en/students/add')
    await w(page, 'sw-name-en').fill('Dup Phone Adult')
    await w(page, 'sw-phone').fill(GUARDIAN_PHONE)
    // Adult (no DOB) → no guardian step; advance to submit.
    for (let i = 0; i < 4; i++) {
      const next = page.locator('[data-testid="wizard-next"]:visible')
      if ((await next.count()) === 0) break
      await next.first().click()
    }
    await w(page, 'wizard-submit').click()
    await page.waitForURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 })

    // …but INVITING them is refused — the phone already backs the guardian's login.
    await expect(w(page, 'portal-access')).toBeVisible({ timeout: 20_000 })
    await w(page, 'portal-access').locator('[data-testid="invite-btn"]').click()
    await expect(w(page, 'invite-error'), 'the credential invariant blocks the duplicate').toBeVisible({ timeout: 20_000 })
    // eslint-disable-next-line no-console
    console.log('MJ1_INVITE_ERROR:', JSON.stringify(await w(page, 'invite-error').textContent()))
    await expect(w(page, 'invite-error')).toContainText(GUARDIAN_NAME)
  } finally {
    await ctx.close()
  }
})
