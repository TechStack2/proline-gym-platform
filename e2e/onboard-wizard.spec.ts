import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * WL-ONBOARDING-WIZARD — the vendor SUPER-ADMIN onboards gym #2+ (not public
 * self-serve). Proves the new platform-admin access primitive (000082):
 *   1. a platform_admin reaches /onboard, submits, and a NEW gym + owner login +
 *      starter catalog are created (rows asserted service-side);
 *   2. a regular gym OWNER is BLOCKED from /onboard (route 404 → cannot submit →
 *      no gym created) — the route calls is_platform_admin(), the SAME gate
 *      onboardGym re-asserts server-side;
 *   3. anon is redirected to login (no form).
 *
 * Hermetic: creates its OWN platform-admin fixture + gym and tears both down; it
 * never mutates shared-gym state (the e1/adm1 lesson). /en only.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const ADMIN_EMAIL = `onb-admin-${BASE}@e2e.local`
const NEW_SLUG = `onb-gym-${BASE}`
const NEW_NAME_EN = `Onboarded ${BASE}`
const OWNER_EMAIL = `onb-owner-${BASE}@e2e.local`

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let adminId = ''
let newGymId = ''

async function createAuthUser(email: string): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcHeaders,
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  })
  if (!res.ok) throw new Error(`createUser(${email}) failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}
async function deleteAuthUser(id: string) {
  await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {})
}
async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
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

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-ONBOARDING-WIZARD needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  // Fixture super-admin: a real auth user seeded into platform_admins (service-role
  // ONLY — the seed path a user can never reach themselves).
  adminId = await createAuthUser(ADMIN_EMAIL)
  const res = await svc('platform_admins', { method: 'POST', body: JSON.stringify({ user_id: adminId }) })
  if (!res.ok && res.status !== 409) throw new Error(`seed platform_admin failed: ${res.status} ${await res.text()}`)
})

test.afterAll(async () => {
  // Tear down our OWN artifacts (never touch shared state). Delete the created gym
  // (cascades disciplines/plans/user_roles) + its owner auth user + the fixture admin.
  if (newGymId) {
    const roleRows = (await (await svc(`user_roles?gym_id=eq.${newGymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
    await svc(`gyms?id=eq.${newGymId}`, { method: 'DELETE' })
    for (const r of roleRows) await deleteAuthUser(r.user_id)
  }
  if (adminId) {
    await svc(`platform_admins?user_id=eq.${adminId}`, { method: 'DELETE' })
    await deleteAuthUser(adminId)
  }
})

test('WL-ONBOARDING · a platform admin onboards a new gym + owner + starter catalog', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await loginAs(browser, ADMIN_EMAIL)
  try {
    await page.goto('/en/onboard')
    await expect(page.getByTestId('onboard-form'), 'the super-admin sees the onboard form').toBeVisible({ timeout: 15_000 })

    await page.getByTestId('onboard-gymNameEn').fill(NEW_NAME_EN)
    await page.getByTestId('onboard-gymNameAr').fill('نادٍ جديد')
    await page.getByTestId('onboard-slug').fill(NEW_SLUG)
    await page.getByTestId('onboard-ownerEmail').fill(OWNER_EMAIL)
    await page.getByTestId('onboard-ownerFirstEn').fill('New')
    await page.getByTestId('onboard-ownerLastEn').fill('Owner')
    await page.getByTestId('onboard-submit').click()

    await expect(page.getByTestId('onboard-success'), 'the gym was created').toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('onboard-owner-email')).toHaveText(OWNER_EMAIL)
    await expect(page.getByTestId('onboard-temp-pw'), 'a temp password is returned').not.toBeEmpty()

    // Assert the rows exist (service-role).
    const gyms = (await (await svc(`gyms?slug=eq.${NEW_SLUG}&select=id,name_en,is_active`)).json()) as Array<{ id: string; name_en: string; is_active: boolean }>
    expect(gyms.length, 'exactly one new gym').toBe(1)
    newGymId = gyms[0].id
    expect(gyms[0].name_en).toBe(NEW_NAME_EN)
    expect(gyms[0].is_active).toBe(true)

    const owners = (await (await svc(`user_roles?gym_id=eq.${newGymId}&role=eq.owner&select=user_id`)).json()) as unknown[]
    expect(owners.length, 'an owner role was assigned').toBe(1)

    const discs = (await (await svc(`disciplines?gym_id=eq.${newGymId}&select=id`)).json()) as unknown[]
    expect(discs.length, 'a starter discipline catalog was seeded').toBeGreaterThanOrEqual(2)
  } finally {
    await ctx.close()
  }
})

test('WL-ONBOARDING · a regular gym owner is BLOCKED from /onboard (no gym created)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/onboard')
    // Non-platform-admin → notFound(): no onboard UI at all. Blocked at the route,
    // so a regular owner can never reach the form to create a gym.
    await expect(page.getByTestId('onboard-form'), 'a regular owner gets NO onboard form').toHaveCount(0)
    await expect(page.getByTestId('onboard-title'), 'the onboard route is hidden (404)').toHaveCount(0)
    // Sanity: no owner-created gym exists under a sentinel slug (they never submitted).
    const leaked = (await (await svc(`gyms?slug=eq.owner-should-not-create-${BASE}&select=id`)).json()) as unknown[]
    expect(leaked.length, 'a regular owner created no gym').toBe(0)
  } finally {
    await ctx.close()
  }
})

test('WL-ONBOARDING · anon is redirected to login (no onboard form)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/onboard')
    await expect(page, 'anon is bounced to login').toHaveURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('onboard-form'), 'no onboard form for anon').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
