import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * PORTAL-BRAND — the MEMBER portal follows the gym's brand, same as the staff shells.
 *
 * The portal shell mounts BrandThemeStyle (a nonce'd `:root{--c-brand-*}` block) so
 * every primary-* accent follows the gym's brand_color. The catch that made a branded
 * gym render a RED member portal: a MEMBER is not `is_staff()`, so the plain gyms RLS
 * read (`gyms_staff_read`) returned null and the shell fell back to the crimson default.
 * The fix resolves brand_color via the user's own gym_id through a server-only helper
 * (getUserBrandColor → service-role), so a member of a branded gym now sees their brand.
 *
 * Proven on HERMETIC own gyms (the wl-theme pattern): a gym-wide brand can't be asserted
 * on the shared per-worker gym without flipping every concurrent spec, so we seed our own
 * teal + unbranded gyms + tear them down. We log in as the seeded MEMBER (student+slug).
 *
 * Proves:
 *  1. brand_color = #0d9488 (teal) → the portal :root --c-brand-700 is 13 148 136 AND a
 *     real primary-* accent (the billing "view" link, text-primary-700) COMPUTES teal.
 *  2. brand_color NULL → the default crimson EXACTLY (205 20 25 / rgb(205,20,25)) and NO
 *     brand-theme override is emitted — the byte-identical guarantee, unchanged.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_TEAL = `portalbrand-teal-${BASE}`
const SLUG_RED = `portalbrand-red-${BASE}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function seed(slug: string, brand: string | null): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: `Portal Brand ${slug}`, p_password: PW }),
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

let tealGymId = ''
let redGymId = ''

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('PORTAL-BRAND needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  tealGymId = await seed(SLUG_TEAL, '#0d9488')
  redGymId = await seed(SLUG_RED, null)
})
test.afterAll(async () => { await teardown(tealGymId); await teardown(redGymId) })

// Log in as the seeded MEMBER (student+slug) and land on their portal home.
async function memberOnPortal(browser: Browser, slug: string, opts?: { locale?: string; viewport?: { width: number; height: number }; colorScheme?: 'light' | 'dark' }) {
  const locale = opts?.locale ?? 'en'
  const ctx = await browser.newContext({
    locale,
    ...(opts?.viewport ? { viewport: opts.viewport } : {}),
    ...(opts?.colorScheme ? { colorScheme: opts.colorScheme } : {}),
  })
  const page = await ctx.newPage()
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(`student+${slug}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  await page.goto(`/${locale}/portal`)
  await expect(vis(page, '[data-testid="self-view"]').first(), 'the member portal home rendered').toBeVisible({ timeout: 20_000 })
  return { ctx, page }
}

const rootBrand = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-brand-700').trim())
// A real primary-* accent in the portal: the billing card's "view" link (text-primary-700),
// unconditionally rendered on the member home.
const accentColor = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="billing-open"]').first().evaluate((el) => getComputedStyle(el).color)

test('PORTAL-BRAND · a branded gym paints the MEMBER portal with its colour', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await memberOnPortal(browser, SLUG_TEAL)
  try {
    // The nonce'd brand override reached the portal shell (the member-RLS gap is closed).
    await expect(page.locator('[data-testid="brand-theme"]'), 'the brand override style is injected in the portal').toHaveCount(1)
    expect(await rootBrand(page), '--c-brand-700 is the gym teal (13 148 136)').toBe('13 148 136')
    // A real primary-* accent resolves to it: the billing "view" link is text-primary-700.
    expect(await accentColor(page), 'a portal primary-* accent computes to the gym teal').toBe('rgb(13, 148, 136)')
  } finally {
    await ctx.close()
  }
})

test('PORTAL-BRAND · an unset brand_color leaves the MEMBER portal Proline red (byte-identical)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await memberOnPortal(browser, SLUG_RED)
  try {
    await expect(page.locator('[data-testid="brand-theme"]'), 'no override emitted when brand_color is null').toHaveCount(0)
    expect(await rootBrand(page), '--c-brand-700 is the default crimson (205 20 25)').toBe('205 20 25')
    expect(await accentColor(page), 'a portal primary-* accent stays the default crimson').toBe('rgb(205, 20, 25)')
  } finally {
    await ctx.close()
  }
})

test('PORTAL-BRAND · visual evidence — branded member portal en/ar, light/dark, mobile 390', async ({ browser }) => {
  test.setTimeout(180_000)
  const MOBILE = { width: 390, height: 844 }
  for (const locale of ['en', 'ar'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const { ctx, page } = await memberOnPortal(browser, SLUG_TEAL, { locale, viewport: MOBILE, colorScheme: scheme })
      try {
        // Brand is a saturated accent → unflipped on dark; the teal channel holds either way.
        expect(await rootBrand(page), `brand channel holds on ${locale}/${scheme}`).toBe('13 148 136')
        await page.waitForTimeout(400)
        await page.screenshot({ path: `screenshots/portal-brand-teal-${locale}-${scheme}-390.png`, fullPage: true }).catch(() => {})
      } finally {
        await ctx.close()
      }
    }
  }
})
