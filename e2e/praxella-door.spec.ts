import { test, expect, type Browser } from '@playwright/test'

/**
 * PRAXELLA-DOOR (R2/R3/R4) — the full demo-request loop:
 *   1. an anon prospect submits the Praxella landing's request-demo form → a
 *      platform_leads row lands (via submit_platform_lead, 000100);
 *   2. a platform admin sees it in the (vendor) console Requests inbox and marks
 *      it contacted through the gated server action (service-role write).
 * Hermetic: seeds its OWN platform-admin fixture + a uniquely-tagged lead and
 * tears both down; never touches shared-gym state. /en only.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const RUN = `${process.env.GITHUB_RUN_ID || Date.now()}`.slice(-6)
const ADMIN_EMAIL = `praxella-admin-${BASE}@e2e.local`
const BUSINESS = `Praxella Demo ${RUN}`
const NAME = `Demo Prospect ${RUN}`
const PHONE = `+96170${RUN}`

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let adminId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
}
async function leadByBusiness(): Promise<{ id: string; status: string; activity_type: string | null } | null> {
  const res = await svc(`platform_leads?business_name=eq.${encodeURIComponent(BUSINESS)}&select=id,status,activity_type`)
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string; status: string; activity_type: string | null }>
  return rows[0] ?? null
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
  if (!URL || !KEY) throw new Error('PRAXELLA-DOOR needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: svcHeaders,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: PW, email_confirm: true }),
  })
  if (!res.ok) throw new Error(`createUser failed: ${res.status} ${await res.text()}`)
  adminId = ((await res.json()) as { id: string }).id
  const a = await svc('platform_admins', { method: 'POST', body: JSON.stringify({ user_id: adminId }) })
  if (!a.ok && a.status !== 409) throw new Error(`seed platform_admin failed: ${a.status} ${await a.text()}`)
})

test.afterAll(async () => {
  await svc(`platform_leads?business_name=eq.${encodeURIComponent(BUSINESS)}`, { method: 'DELETE' }).catch(() => {})
  if (adminId) {
    await svc(`platform_admins?user_id=eq.${adminId}`, { method: 'DELETE' }).catch(() => {})
    await fetch(`${URL}/auth/v1/admin/users/${adminId}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {})
  }
})

test('PRAXELLA-DOOR · demo request → platform_leads row → console inbox → mark contacted', async ({ browser }) => {
  test.setTimeout(120_000)

  // ── 1. Anon submits the request-demo form on the Praxella landing ──
  const anon = await browser.newContext({ locale: 'en' })
  const page = await anon.newPage()
  try {
    await page.goto('/en?vendor=1')
    const form = page.getByTestId('vendor-demo-form')
    await expect(form).toBeVisible({ timeout: 15_000 })
    await form.getByTestId('demo-name').fill(NAME)
    await form.getByTestId('demo-business').fill(BUSINESS)
    await form.locator('[data-testid="demo-activity-chip"][data-value="gym"]').click()
    await form.getByTestId('demo-phone').fill(PHONE)
    await form.getByTestId('demo-email').fill(`demo${RUN}@example.com`)
    await form.getByTestId('demo-city').fill('Beirut')
    await form.getByTestId('demo-message').fill('We run three mats and want to move off spreadsheets.')
    await form.getByTestId('demo-submit').click()
    await expect(page.getByTestId('vendor-demo-success'), 'the form confirms').toBeVisible({ timeout: 15_000 })
  } finally {
    await anon.close()
  }

  // ── 2. The lead durably landed (service-role, RLS-free) ──
  await expect.poll(async () => (await leadByBusiness())?.status ?? null, { timeout: 20_000, intervals: [500, 1_000, 2_000] }).toBe('new')
  const lead = await leadByBusiness()
  expect(lead, 'a platform_leads row exists').not.toBeNull()
  expect(lead!.activity_type, 'the activity chip was recorded').toBe('gym')

  // ── 3. The platform admin triages it in the console Requests inbox ──
  const admin = await loginAs(browser, ADMIN_EMAIL)
  try {
    await admin.page.goto('/en/requests')
    const row = admin.page.locator('[data-testid="request-row"]', { hasText: BUSINESS }).first()
    await expect(row, 'the request appears in the inbox').toBeVisible({ timeout: 15_000 })
    await expect(row.locator('[data-testid="request-status"]')).toHaveAttribute('data-status', 'new')
    await admin.page.screenshot({ path: 'screenshots/praxella-console-inbox.png', fullPage: true }).catch(() => {})
    await row.getByTestId('lead-mark-contacted').click()

    // Committed fact first (the write is service-role), then the UI reflects it.
    await expect.poll(async () => (await leadByBusiness())?.status ?? null, { timeout: 20_000, intervals: [500, 1_000, 2_000] }).toBe('contacted')
    await expect(
      admin.page.locator('[data-testid="request-row"]', { hasText: BUSINESS }).first().locator('[data-testid="request-status"]'),
      'the inbox chip shows contacted',
    ).toHaveAttribute('data-status', 'contacted', { timeout: 15_000 })
  } finally {
    await admin.ctx.close()
  }
})
