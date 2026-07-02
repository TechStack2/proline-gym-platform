import { test, expect, type Browser } from '@playwright/test'

/**
 * WL-LANDING — the public landing renders the RESOLVED gym's branding, not the
 * hardcoded Proline demo. One template, each gym's own name + brand color +
 * (logo/hero/tagline). A gym with brand_color/name SET renders it; UNSET → the
 * built-in Proline default (no regression).
 *
 * Two isolated gyms (service-role seed seed_e2e_wl_gym): one with a set brand
 * color + name, one left unset. Loaded anon via ?gym=<slug>.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_SET = `wl-set-${BASE}`
const SLUG_DEF = `wl-def-${BASE}`
const BRAND = '#0055ff'
const NAME_SET = 'Blue Belt Academy'
const NAME_DEF = 'Plain Combat Gym'
const DEFAULT_BRAND = '#cd1419'

async function seedWl(slug: string, brand: string | null, name: string) {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-LANDING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  await seedWl(SLUG_SET, BRAND, NAME_SET)
  await seedWl(SLUG_DEF, null, NAME_DEF)
})

test('WL-LANDING · a gym with brand_color + name set renders ITS branding on the landing', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // anon — the landing is public
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_SET)}`)
    // The resolved gym's NAME renders (not "PRO LINE Gym").
    await expect(page.getByTestId('hero-gym-name'), 'the gym name renders in the hero').toHaveText(NAME_SET, { timeout: 15_000 })
    // The hero brand glow uses the gym's brand color (SVG stop-color — CSP-safe).
    const glow = page.locator('[data-testid="hero-brand-glow"]')
    await expect(glow).toHaveAttribute('data-brand-color', BRAND)
    const stopColor = await page.locator('#wl-hero-glow stop').first().getAttribute('stop-color')
    expect(stopColor, 'the SVG glow renders in the gym brand color').toBe(BRAND)
  } finally {
    await ctx.close()
  }
})

test('WL-LANDING · a gym with brand_color UNSET falls back to the default look (no regression)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_DEF)}`)
    await expect(page.getByTestId('hero-gym-name')).toHaveText(NAME_DEF, { timeout: 15_000 })
    // Unset brand_color → the template default crimson.
    await expect(page.locator('[data-testid="hero-brand-glow"]')).toHaveAttribute('data-brand-color', DEFAULT_BRAND)
    const stopColor = await page.locator('#wl-hero-glow stop').first().getAttribute('stop-color')
    expect(stopColor, 'unset brand_color renders the default crimson').toBe(DEFAULT_BRAND)
  } finally {
    await ctx.close()
  }
})
