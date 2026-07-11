import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * WL-THEME — the AUTHED gym's brand_color becomes the app product's colour. The shells
 * inject a nonce'd `:root{--c-brand-*}` block (BrandThemeStyle) so every primary-*
 * accent follows the gym. Proven on HERMETIC own gyms (the bill-localize pattern): a
 * gym-wide brand can't be asserted on the shared per-worker gym without flipping every
 * concurrent spec's colour, so we seed our own gyms + owners and tear them down.
 *
 * Proves:
 *  1. brand_color = #1d4ed8 → the dashboard :root --c-brand-700 is 29 78 216 AND a
 *     real primary-* element (the active horizon tab, text-primary-700) COMPUTES blue.
 *  2. brand_color NULL → the default red EXACTLY (205 20 25 / rgb(205,20,25)) and NO
 *     brand-theme override is emitted — the byte-identical guarantee.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_BLUE = `wltheme-blue-${BASE}`
const SLUG_RED = `wltheme-red-${BASE}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function seed(slug: string, brand: string | null): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: `WL Theme ${slug}`, p_password: PW }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string
}

async function teardown(gymId: string) {
  if (!gymId) return
  const rows = (await (await fetch(`${URL}/rest/v1/user_roles?gym_id=eq.${gymId}&select=user_id`, { headers: H })).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await fetch(`${URL}/rest/v1/gyms?id=eq.${gymId}`, { method: 'DELETE', headers: H }).catch(() => {})
}

// WL-THEME-R2: the base seed gives its class an explicit per-class colour (#E53E3E), which
// the class-row left-edge bar preserves (categorical, not brand). To exercise the R2 fix —
// an UNCOLOURED class's bar follows the gym BRAND — null the colour so the bar hits the
// `data-chipbg="brand"` → `rgb(var(--c-brand-700))` fallback.
async function nullClassColor(gymId: string) {
  await fetch(`${URL}/rest/v1/classes?gym_id=eq.${gymId}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ color: null }),
  }).catch(() => {})
}

let blueGymId = ''
let redGymId = ''

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-THEME needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  blueGymId = await seed(SLUG_BLUE, '#1d4ed8')
  redGymId = await seed(SLUG_RED, null)
  await nullClassColor(blueGymId)
  await nullClassColor(redGymId)
})
test.afterAll(async () => { await teardown(blueGymId); await teardown(redGymId) })

async function ownerOnToday(browser: Browser, slug: string, opts?: { viewport?: { width: number; height: number } }) {
  const ctx = await browser.newContext({ locale: 'en', ...(opts?.viewport ? { viewport: opts.viewport } : {}) })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${slug}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  await page.goto('/en/today')
  await expect(vis(page, '[data-testid="horizon-today"]').first(), 'the dashboard shell rendered').toBeVisible({ timeout: 20_000 })
  return { ctx, page }
}

const rootBrand = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-brand-700').trim())
const activeTabColor = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="horizon-today"]').first().evaluate((el) => getComputedStyle(el).color)
// R2: the /today class-row left-edge bar for an uncoloured class (data-chipbg="brand").
const classBarColor = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="today-class-row"] span[data-chipbg="brand"]').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
// WL-CHROME: the light <meta name="theme-color"> content (the PWA/status-bar colour).
const lightThemeColor = (page: import('@playwright/test').Page) =>
  page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]').getAttribute('content')
// WL-CHROME: the STAFF shell chrome bg (top-accent stripe / role badge) — only in the
// mobile NativeHeader (the <lg shell), so read it on a mobile viewport.
const bgColor = (page: import('@playwright/test').Page, testid: string) =>
  page.locator(`[data-testid="${testid}"]`).first().evaluate((el) => getComputedStyle(el).backgroundColor)

test('WL-THEME · a branded gym paints the app product with its colour', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerOnToday(browser, SLUG_BLUE)
  try {
    // The nonce'd brand override is present and set the brand channel to the gym blue.
    await expect(page.locator('[data-testid="brand-theme"]'), 'the brand override style is injected').toHaveCount(1)
    expect(await rootBrand(page), '--c-brand-700 is the gym blue (29 78 216)').toBe('29 78 216')
    // A real primary-* utility resolves to it: the active horizon tab is text-primary-700.
    expect(await activeTabColor(page), 'a primary-* accent computes to the gym blue').toBe('rgb(29, 78, 216)')
    // R2: an uncoloured class's left-edge bar follows the gym brand (not a hardcoded crimson).
    expect(await classBarColor(page), 'the class-row indicator fallback computes to the gym blue').toBe('rgb(29, 78, 216)')
    // WL-CHROME: the staff PWA / status-bar theme-color is the gym brand.
    expect(await lightThemeColor(page), 'the light theme-color meta is the gym brand').toBe('#1d4ed8')
  } finally {
    await ctx.close()
  }
})

test('WL-THEME · an unset brand_color renders the Proline red EXACTLY (byte-identical)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerOnToday(browser, SLUG_RED)
  try {
    await expect(page.locator('[data-testid="brand-theme"]'), 'no override emitted when brand_color is null').toHaveCount(0)
    expect(await rootBrand(page), '--c-brand-700 is the default crimson (205 20 25)').toBe('205 20 25')
    expect(await activeTabColor(page), 'a primary-* accent computes to the default crimson').toBe('rgb(205, 20, 25)')
    // R2: the class-row indicator fallback is byte-identical to the old hardcoded #cd1419.
    expect(await classBarColor(page), 'the class-row indicator fallback is the default crimson').toBe('rgb(205, 20, 25)')
    // WL-CHROME: the theme-color meta is the exact former static #cd1419 (byte-identical).
    expect(await lightThemeColor(page), 'the light theme-color meta is the default crimson').toBe('#cd1419')
  } finally {
    await ctx.close()
  }
})

test('WL-CHROME · the staff shell chrome (accent stripe + role badge) follows the gym brand', async ({ browser }) => {
  test.setTimeout(120_000)
  // The stripe + badge live in the mobile NativeHeader (the <lg shell) → a mobile viewport.
  const MOBILE = { width: 390, height: 844 }
  // Branded gym → the crimson role chrome becomes the gym blue.
  const blue = await ownerOnToday(browser, SLUG_BLUE, { viewport: MOBILE })
  try {
    expect(await bgColor(blue.page, 'shell-accent-stripe'), 'the staff accent stripe is the gym blue').toBe('rgb(29, 78, 216)')
    expect(await bgColor(blue.page, 'shell-badge'), 'the STAFF badge sits on the gym blue').toBe('rgb(29, 78, 216)')
  } finally {
    await blue.ctx.close()
  }
  // Unset gym → the exact former crimson role chrome (byte-identical).
  const red = await ownerOnToday(browser, SLUG_RED, { viewport: MOBILE })
  try {
    expect(await bgColor(red.page, 'shell-accent-stripe'), 'the staff accent stripe stays the default crimson').toBe('rgb(205, 20, 25)')
    expect(await bgColor(red.page, 'shell-badge'), 'the STAFF badge stays the default crimson').toBe('rgb(205, 20, 25)')
  } finally {
    await red.ctx.close()
  }
})

test('WL-THEME · dark mode keeps the brand + visual evidence (branded dashboard light + dark)', async ({ browser }) => {
  test.setTimeout(120_000)
  // Light.
  const { ctx, page } = await ownerOnToday(browser, SLUG_BLUE)
  try {
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'screenshots/wl-theme-dashboard-blue-light.png', fullPage: true }).catch(() => {})
  } finally {
    await ctx.close()
  }
  // Dark: brand is a saturated accent → NOT flipped on html.dark; it stays the gym blue
  // and brand-on-brand text keeps the computed --c-brand-fg. Prove the channel holds.
  const darkCtx = await browser.newContext({ locale: 'en', colorScheme: 'dark' })
  const dark = await darkCtx.newPage()
  try {
    await dark.goto('/en/auth/login')
    await dark.locator('#email').fill(`owner+${SLUG_BLUE}@e2e.local`)
    await dark.locator('#password').fill(PW)
    await dark.locator('button[type="submit"]').click()
    await dark.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
    await dark.goto('/en/today')
    await expect(vis(dark, '[data-testid="horizon-today"]').first()).toBeVisible({ timeout: 20_000 })
    await dark.waitForTimeout(500)
    expect(await rootBrand(dark), 'brand channel is unflipped on dark (still gym blue)').toBe('29 78 216')
    await dark.screenshot({ path: 'screenshots/wl-theme-dashboard-blue-dark.png', fullPage: true }).catch(() => {})
  } finally {
    await darkCtx.close()
  }
})
