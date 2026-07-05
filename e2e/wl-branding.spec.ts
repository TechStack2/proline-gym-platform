import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * WL-BRANDING-DATA — the marketing landing renders the RESOLVED gym's brand color,
 * CSP-safely. The page injects `:root{--brand:<gym.brand_color ?? #cd1419>}` in a
 * NONCE'D <style> (prod style-src is nonce + strict-dynamic, no 'unsafe-inline'),
 * and the marketing components use var(--brand). Asserts:
 *   1. a gym with brand_color UNSET (null) → red (#cd1419) — the default guarantee;
 *   2. a gym with a DISTINCT brand_color (#0000ff) → THAT color;
 *   3. the real apex (/en, no ?gym → the demo) → red + NO CSP violation (the nonce'd
 *      <style> applied → the browser did not refuse it).
 * A brand element (the PT CTA, bg-[color:var(--brand)]) is asserted by computed
 * color, plus the :root --brand var. Seeds its OWN gyms + a landing PT package
 * (so the PT section renders) — never mutates shared-gym state. /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_RED = `wlb-red-${BASE}` // brand_color NULL → falls back to Proline red
const SLUG_BLUE = `wlb-blue-${BASE}` // brand_color #0000ff → its own color
const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function seedWl(slug: string, brand: string | null): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: svcHeaders,
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: `WL Brand ${slug}` }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string
}

async function seedLandingPt(id: string, gymId: string) {
  const res = await fetch(`${URL}/rest/v1/pt_packages`, {
    method: 'POST',
    headers: { ...svcHeaders, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      id, gym_id: gymId, name_ar: 'حصص خاصة', name_en: 'Private Sessions', name_fr: 'Séances',
      session_count: 5, price_usd: 100, validity_days: 30, is_active: true, show_on_landing: true,
    }),
  })
  if (!res.ok) throw new Error(`seed pt(${gymId}) failed: ${res.status} ${await res.text()}`)
}

let redGymId = ''
let blueGymId = ''

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-BRANDING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  redGymId = await seedWl(SLUG_RED, null)
  blueGymId = await seedWl(SLUG_BLUE, '#0000ff')
  await seedLandingPt('e0000000-0000-4000-8000-0000000000f1', redGymId)
  await seedLandingPt('e0000000-0000-4000-8000-0000000000f2', blueGymId)
})

async function loadLanding(browser: Browser, query: string): Promise<{ page: Page; ctx: Awaited<ReturnType<Browser['newContext']>>; cspErrors: string[] }> {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  const cspErrors: string[] = []
  page.on('console', (m) => {
    // Scope to STYLE violations — this slice's risk is the brand <style> being
    // refused (a blocked style → 'Refused to apply … style' / a style-src report).
    // (Unrelated img/connect CSP reports must not false-fail this test.)
    if (m.type() === 'error' && /refused to apply.*style|style-src/i.test(m.text())) cspErrors.push(m.text())
  })
  await page.goto(`/en${query}`)
  return { page, ctx, cspErrors }
}

const rootBrand = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())
const ctaColor = (page: Page) =>
  page.locator('[data-testid="landing-pt-cta"]').evaluate((el) => getComputedStyle(el).backgroundColor)

test('WL-BRANDING · an UNSET brand_color falls back to Proline red (default guarantee)', async ({ browser }) => {
  const { page, ctx } = await loadLanding(browser, `?gym=${encodeURIComponent(SLUG_RED)}`)
  try {
    await expect(page.getByTestId('landing-pt-cta'), 'the PT brand element renders').toBeVisible({ timeout: 15_000 })
    expect(await rootBrand(page), 'the --brand var is the red default').toBe('#cd1419')
    expect(await ctaColor(page), 'a brand element computes to red rgb(205,20,25)').toBe('rgb(205, 20, 25)')
  } finally {
    await ctx.close()
  }
})

test('WL-BRANDING · a DISTINCT brand_color renders THAT color', async ({ browser }) => {
  const { page, ctx } = await loadLanding(browser, `?gym=${encodeURIComponent(SLUG_BLUE)}`)
  try {
    await expect(page.getByTestId('landing-pt-cta')).toBeVisible({ timeout: 15_000 })
    expect(await rootBrand(page), 'the --brand var is the gym color').toBe('#0000ff')
    expect(await ctaColor(page), 'a brand element computes to the gym blue').toBe('rgb(0, 0, 255)')
  } finally {
    await ctx.close()
  }
})

test('WL-BRANDING · the apex default renders red with NO CSP violation', async ({ browser }) => {
  const { page, ctx, cspErrors } = await loadLanding(browser, '') // /en, no ?gym → the demo gym
  try {
    // The --brand var being READABLE proves the nonce'd <style> was allowed by the
    // prod CSP (a blocked style → the var would be unset).
    await expect(page.getByTestId('brand-vars'), 'the brand <style> is present').toHaveCount(1)
    expect(await rootBrand(page), 'the apex default is red').toBe('#cd1419')
    expect(cspErrors, 'no CSP violation (the nonce matched)').toEqual([])
  } finally {
    await ctx.close()
  }
})
