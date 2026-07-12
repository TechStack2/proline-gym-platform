import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis } from './helpers'

/**
 * MJ-5 JOIN-DOOR — the public landing "Request to join" feeds the leads tab.
 *
 * Hermetic own gym (seed_e2e_wl_gym → its own owner + roles, torn down after).
 * Proves, from an ANON non-default gym landing (?gym=<slug>):
 *  1. A "request to join" (name + phone + product interests) lands as a LEAD in
 *     THAT gym's pipeline with source=Landing + the interests as chips.
 *  2. DEDUPE — the same phone within the window updates the lead, never spams a
 *     second row.
 *  3. CONVERT PRE-FILL — the lead's name + normalized phone carry into the
 *     member; the "set up as a family" link opens the wizard pre-filled (family).
 * Owner gate: the public only ever REQUESTS — no account is created.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `join-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const JOIN_NAME = 'Joudy Prospect'
const JOIN_PHONE = `+96176${Date.now().toString().slice(-6)}`
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function svcJson(path: string): Promise<any[]> {
  const r = await svc(path)
  return r.ok ? ((await r.json()) as any[]) : []
}
const w = (page: Page, tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()

async function anonLanding(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto(`/en?gym=${SLUG}`)
  return { ctx, page }
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
async function submitJoin(page: Page, interests: string[]) {
  await w(page, 'join-name').scrollIntoViewIfNeeded()
  await w(page, 'join-name').fill(JOIN_NAME)
  await w(page, 'join-phone').fill(JOIN_PHONE)
  for (const k of interests) await page.locator(`[data-testid="join-interest-chip"][data-value="${k}"]:visible`).first().click()
  await w(page, 'join-submit').click()
  await expect(w(page, 'join-success')).toBeVisible({ timeout: 20_000 })
}
const leadCard = (page: Page) =>
  vis(page, '[data-testid="lead-card"]').filter({ hasText: JOIN_NAME }).first()

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('JOIN-DOOR needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: 'Join Door Gym' }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})
test.afterAll(async () => {
  if (!gymId) return
  const rows = await svcJson(`user_roles?gym_id=eq.${gymId}&select=user_id`)
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('JOIN-DOOR · anon request to join → lead in the gym pipeline with source=Landing + interests', async ({ browser }) => {
  test.setTimeout(150_000)
  const a = await anonLanding(browser)
  try {
    await expect(w(a.page, 'join-capture-form')).toBeVisible({ timeout: 20_000 })
    await a.page.screenshot({ path: 'screenshots/mj5-join-form.png', fullPage: true }).catch(() => {})
    await submitJoin(a.page, ['membership', 'pt'])
    await a.page.screenshot({ path: 'screenshots/mj5-join-thanks.png', fullPage: true }).catch(() => {})
  } finally {
    await a.ctx.close()
  }

  const o = await loginOwner(browser)
  try {
    await o.page.goto('/en/students?tab=prospects')
    const card = leadCard(o.page)
    await expect(card, 'the landing lead reaches the prospects pipeline').toBeVisible({ timeout: 20_000 })
    await expect(card.getByTestId('lead-source'), 'source chip = Landing').toHaveText(/Landing/i)
    await expect(card.locator('[data-testid="lead-interest-chip"]'), 'both product interests captured').toHaveCount(2)
    await expect(card.getByTestId('lead-wa'), 'the wa.me reply bridge picks up the landing phone').toBeVisible()
    await o.page.screenshot({ path: 'screenshots/mj5-lead-card.png', fullPage: true }).catch(() => {})
  } finally {
    await o.ctx.close()
  }
})

test('JOIN-DOOR · same phone within the window updates the lead, never spams a row', async ({ browser }) => {
  test.setTimeout(120_000)
  // A second request from the same phone (different interest set).
  const a = await anonLanding(browser)
  try {
    await submitJoin(a.page, ['classes'])
  } finally {
    await a.ctx.close()
  }
  // Exactly one lead persists for this phone (dedupe refreshed the existing row).
  await expect(async () => {
    const rows = await svcJson(`leads?gym_id=eq.${gymId}&phone=eq.${encodeURIComponent(JOIN_PHONE)}&select=id,source`)
    expect(rows.length, 'one lead row for the phone, not two').toBe(1)
    expect(rows[0].source).toBe('landing')
  }).toPass({ timeout: 20_000 })
})

test('JOIN-DOOR · convert pre-fills name + phone; "set up as family" opens the wizard pre-filled', async ({ browser }) => {
  test.setTimeout(120_000)
  const o = await loginOwner(browser)
  try {
    await o.page.goto('/en/students?tab=prospects')
    const card = leadCard(o.page)
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.getByTestId('convert-open').click()
    await expect(w(o.page, 'convert-modal')).toBeVisible({ timeout: 10_000 })
    // Pre-fill is shown (no retyping): the lead's name + normalized phone.
    await expect(w(o.page, 'convert-prefill')).toContainText(JOIN_NAME)
    await expect(w(o.page, 'convert-prefill')).toContainText(JOIN_PHONE)
    // The family link carries the prefill into the wizard.
    const famLink = w(o.page, 'convert-as-family')
    const href = await famLink.getAttribute('href')
    expect(href).toContain('mode=family')
    expect(href).toContain('prefillPhone=')
    await famLink.click()
    // The wizard opens in family mode with the guardian seeded from the lead.
    // (fam-guardian-name only renders after a search; the always-visible
    // fam-guardian-phone carries the pre-filled, normalized number.)
    await expect(w(o.page, 'add-student-wizard')).toBeVisible({ timeout: 20_000 })
    await w(o.page, 'sw-mode-family').click().catch(() => {})
    await expect(w(o.page, 'sw-mode')).toHaveAttribute('data-mode', 'family', { timeout: 10_000 })
    await expect(w(o.page, 'fam-guardian-phone')).toHaveValue(JOIN_PHONE, { timeout: 10_000 })
  } finally {
    await o.ctx.close()
  }
})
