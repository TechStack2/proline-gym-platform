import { test, expect, type Browser, type Page } from '@playwright/test'
import { vis } from './helpers'

/**
 * PUSH-1 — web push, all roles.
 *  1. SUBSCRIPTION LIFECYCLE (UI): the profile push toggle subscribes (a
 *     push_subscriptions row appears) → per-category toggles write the profile
 *     prefs → unsubscribing deletes the row. The browser Push API is MOCKED in the
 *     page (no real push service).
 *  2. SENDER TARGETS: a notifications row + a subscription → the /api/cron/push
 *     drain reports the right target (test-sink transport — asserted via the JSON
 *     summary + the push_sent_at stamp, NOT real delivery) and stamps exactly-once.
 *  3. NO-KEYS NO-OP: the drain with no transport does nothing and does not stamp.
 * Hermetic own gym (owner login); service-role REST for seeding + assertions.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const CRON = process.env.CRON_SECRET || ''
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `push-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

let gymId = ''
let ownerId = ''

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svc(method: string, path: string, body?: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}
async function login(browser: Browser, email: string, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await installPushMock(page, 'granted')
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}
const ownerEmail = () => `owner+${SLUG}@e2e.local`

// Mock the browser Push API so subscribe/unsubscribe run deterministically without
// a real push service or an OS permission dialog.
async function installPushMock(page: Page, permission: 'granted' | 'default' | 'denied') {
  await page.addInitScript((perm) => {
    // Inject the public VAPID key at runtime so the push UI renders in THIS spec
    // only (the suite build bakes no key — see e2e.yml). Prod uses NEXT_PUBLIC_.
    ;(window as any).__PUSH_VAPID_PUBLIC_KEY__ = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBO9pt5jXk3l7EWv-lLQ2ZmY'
    const endpoint = 'https://mock.push.example/e2e-' + Math.random().toString(36).slice(2)
    let sub: any = null
    const makeSub = () => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'mock-p256dh-key', auth: 'mock-auth-key' } }),
      unsubscribe: async () => { sub = null; return true },
    })
    const pushManager = {
      getSubscription: async () => sub,
      subscribe: async () => { sub = makeSub(); return sub },
      permissionState: async () => perm,
    }
    // A registration complete enough that the real ServiceWorkerRegister doesn't throw.
    const registration: any = {
      pushManager, addEventListener() {}, installing: null, waiting: null, active: {},
      update: async () => {}, unregister: async () => true,
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve(registration),
        register: async () => registration,
        getRegistration: async () => registration,
        addEventListener() {}, controller: {},
      },
    })
    ;(window as any).PushManager = (window as any).PushManager || function () {}
    const N: any = function () {}
    N.permission = perm
    N.requestPermission = async () => perm
    Object.defineProperty(window, 'Notification', { configurable: true, value: N })
  }, permission)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('PUSH-1 needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: 'Push Dojo' }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  ownerId = (await svcGet(`user_roles?gym_id=eq.${gymId}&role=eq.owner&select=user_id&limit=1`))[0].user_id
})

test.afterAll(async () => {
  if (!gymId) return
  await svc('DELETE', `push_subscriptions?user_id=eq.${ownerId}`).catch(() => {})
  const rows = (await svcGet(`user_roles?gym_id=eq.${gymId}&select=user_id`).catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc('DELETE', `gyms?id=eq.${gymId}`).catch(() => {})
})

test('1 · subscription lifecycle — toggle on creates a row, category prefs write, toggle off deletes it', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await login(browser, ownerEmail())
  try {
    await page.goto('/en/profile')
    await expect(vis(page, '[data-testid="push-toggle"]'), 'the push toggle renders (VAPID configured)').toBeVisible({ timeout: 20_000 })

    // Subscribe.
    await vis(page, '[data-testid="push-master"]').click()
    await expect.poll(async () => (await svcGet(`push_subscriptions?user_id=eq.${ownerId}&select=endpoint`)).length,
      { timeout: 15_000 }).toBe(1)
    // Category toggles now show; turning one OFF writes the profile pref.
    await expect(vis(page, '[data-testid="push-categories"]')).toBeVisible({ timeout: 10_000 })
    await vis(page, '[data-testid="push-cat-operational"]').click()
    await expect.poll(async () => (await svcGet(`profiles?id=eq.${ownerId}&select=push_operational`))[0]?.push_operational,
      { timeout: 15_000 }).toBe(false)

    // Unsubscribe deletes the row.
    await vis(page, '[data-testid="push-master"]').click()
    await expect.poll(async () => (await svcGet(`push_subscriptions?user_id=eq.${ownerId}&select=endpoint`)).length,
      { timeout: 15_000 }).toBe(0)
  } finally { await ctx.close() }
})

test('2 · sender targets — the drain pushes a pending notification to the subscription (sink) + stamps once', async () => {
  test.setTimeout(60_000)
  test.skip(!CRON, 'needs CRON_SECRET')
  // Seed a subscription + a pending notification for the owner.
  const endpoint = `https://mock.push.example/target-${Date.now()}`
  await svc('POST', 'push_subscriptions', { user_id: ownerId, endpoint, p256dh: 'k', auth: 'a', user_agent: 'e2e' })
  const [notif] = await svc('POST', 'notifications', {
    user_id: ownerId, gym_id: gymId, type: 'payment_received', title_key: 'messages.payment_received.title',
    body_key: 'messages.payment_received.body', action_url: '/invoices',
  })

  const dispatch = await postCron({})
  expect(dispatch.transport, 'test-sink transport in CI').toBe('sink')
  expect(dispatch.dispatched.some((d: any) => d.endpoint === endpoint && d.category === 'operational'),
    'the pending notification targeted the owner subscription').toBeTruthy()
  // Exactly-once: push_sent_at is now stamped, and a re-run finds nothing.
  await expect.poll(async () => (await svcGet(`notifications?id=eq.${notif.id}&select=push_sent_at`))[0]?.push_sent_at,
    { timeout: 10_000 }).not.toBeNull()
  const again = await postCron({})
  expect(again.dispatched.some((d: any) => d.endpoint === endpoint), 're-run does not re-send (idempotent)').toBeFalsy()
  await svc('DELETE', `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`)
})

test('3 · no-keys no-op — the drain with no transport does nothing and never stamps', async () => {
  test.setTimeout(60_000)
  test.skip(!CRON, 'needs CRON_SECRET')
  const [notif] = await svc('POST', 'notifications', {
    user_id: ownerId, gym_id: gymId, type: 'invoice_issued', title_key: 'messages.invoice_issued.title',
    body_key: 'messages.invoice_issued.body', action_url: '/invoices',
  })
  const res = await postCron({ simulateNoKeys: true })
  expect(res.transport).toBe('none')
  expect(res.dispatched).toEqual([])
  expect(res.stamped).toBe(0)
  const row = (await svcGet(`notifications?id=eq.${notif.id}&select=push_sent_at`))[0]
  expect(row?.push_sent_at, 'a no-op drain leaves the row unsent (deliverable once keys land)').toBeNull()
})

for (const locale of ['en', 'ar'] as const) {
  test(`shots · ${locale} push toggle + enable prompt`, async ({ browser }) => {
    test.setTimeout(120_000)
    // Toggle (subscribed → shows the category switches).
    const g = await login(browser, ownerEmail(), locale)
    try {
      await g.page.goto(`/${locale}/profile`)
      await expect(vis(g.page, '[data-testid="push-toggle"]')).toBeVisible({ timeout: 20_000 })
      await vis(g.page, '[data-testid="push-master"]').click()
      await expect(vis(g.page, '[data-testid="push-categories"]')).toBeVisible({ timeout: 10_000 })
      await g.page.waitForTimeout(300)
      await vis(g.page, '[data-testid="push-toggle"]').screenshot({ path: `screenshots/push-toggle-${locale}.png` }).catch(() => {})
    } finally { await g.ctx.close() }

    // Enable prompt (permission 'default' + not subscribed → the one-time prompt).
    const ctx = await browser.newContext({ locale })
    const page = await ctx.newPage()
    await installPushMock(page, 'default')
    try {
      await page.goto(`/${locale}/auth/login`)
      await page.locator('#email').fill(ownerEmail())
      await page.locator('#password').fill(PW)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
      await page.goto(`/${locale}/today`)
      await expect(vis(page, '[data-testid="push-prompt"]')).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(300)
      await vis(page, '[data-testid="push-prompt"]').screenshot({ path: `screenshots/push-prompt-${locale}.png` }).catch(() => {})
    } finally { await ctx.close() }
  })
}

async function postCron(body: any): Promise<any> {
  const appBase = (process.env.E2E_APP_URL || 'http://localhost:3000')
  const res = await fetch(`${appBase}/api/cron/push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST /api/cron/push → ${res.status} ${await res.text()}`)
  return res.json()
}
