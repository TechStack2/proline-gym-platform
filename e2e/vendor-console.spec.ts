import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * VENDOR-CONSOLE — the WL provider home. Proves (000082 + 000083):
 *   1. a platform_admin's post-auth HOME is /vendor (not the empty staff dashboard),
 *      and /vendor renders the cross-tenant multi-gym list + the onboard CTA;
 *   2. a regular gym OWNER → /vendor is 404 (notFound) with NO cross-tenant data;
 *   3. anon → login.
 * Hermetic: seeds its OWN platform-admin fixture and tears it down; never mutates
 * shared-gym state (the onboard-wizard pattern). /en only.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const ADMIN_EMAIL = `vc-admin-${BASE}@e2e.local`

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let adminId = ''

async function createAuthUser(email: string): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: svcHeaders,
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
  if (!URL || !KEY) throw new Error('VENDOR-CONSOLE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  // Fixture super-admin: a real auth user seeded into platform_admins (service-role
  // ONLY — a user can never self-grant). No gym role, no gym — a pure vendor.
  adminId = await createAuthUser(ADMIN_EMAIL)
  const res = await svc('platform_admins', { method: 'POST', body: JSON.stringify({ user_id: adminId }) })
  if (!res.ok && res.status !== 409) throw new Error(`seed platform_admin failed: ${res.status} ${await res.text()}`)
})

test.afterAll(async () => {
  if (adminId) {
    await svc(`platform_admins?user_id=eq.${adminId}`, { method: 'DELETE' })
    await deleteAuthUser(adminId)
  }
})

test('VENDOR-CONSOLE · a platform admin lands on /vendor as HOME and sees the multi-gym list + onboard CTA', async ({ browser }) => {
  test.setTimeout(120_000)
  const admin = await loginAs(browser, ADMIN_EMAIL)
  try {
    // (1) Post-auth HOME = /vendor. The login form pushes '/dashboard'; the middleware
    // routes a platform admin to the vendor console instead of the empty dashboard.
    await admin.page.waitForURL(/\/vendor(\/|$|\?)/, { timeout: 20_000 })

    // The entry redirect too: an authed platform admin at the landing root → /vendor.
    await admin.page.goto('/en')
    await expect(admin.page, 'landing root routes the admin to the vendor console').toHaveURL(/\/vendor(\/|$|\?)/, { timeout: 20_000 })

    // (2) The console renders: header + cross-tenant gym list + onboard CTA.
    await expect(admin.page.getByTestId('vendor-console')).toBeVisible({ timeout: 15_000 })
    await expect(admin.page.getByTestId('vendor-title')).toContainText('Vendor Console')
    await expect(admin.page.getByTestId('vendor-onboard-link'), 'the onboard CTA is present').toBeVisible()
    await expect(admin.page.getByTestId('vendor-onboard-link')).toHaveAttribute('href', '/en/onboard')
    // Cross-tenant enumeration: at least the demo gym + a run gym (multi-gym).
    const rows = admin.page.getByTestId('vendor-gym-row')
    expect(await rows.count(), 'the vendor sees multiple gyms across tenants').toBeGreaterThanOrEqual(2)

    // The onboard CTA actually reaches the (admin-gated) onboard form.
    await admin.page.getByTestId('vendor-onboard-link').click()
    await expect(admin.page.getByTestId('onboard-form'), 'onboard is reachable from the console').toBeVisible({ timeout: 15_000 })
  } finally {
    await admin.ctx.close()
  }
})

test('VENDOR-CONSOLE · a regular gym owner gets 404 at /vendor (no cross-tenant data)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/vendor')
    // notFound() → the console never renders; no gym list leaks to a tenant owner.
    await expect(page.getByTestId('vendor-console'), 'no vendor console for a gym owner').toHaveCount(0)
    await expect(page.getByTestId('vendor-gym-row'), 'no cross-tenant gym rows leak').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('VENDOR-CONSOLE · anon is redirected to login', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/vendor')
    await expect(page, 'anon is bounced to login').toHaveURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page.getByTestId('vendor-console')).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
