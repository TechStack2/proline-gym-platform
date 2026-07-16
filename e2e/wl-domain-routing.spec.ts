import { test, expect, type Browser } from '@playwright/test'

/**
 * WL-DOMAIN-ROUTING — the app resolves which gym a request is for by its DOMAIN.
 *
 * A branded gym (seed_e2e_wl_gym) is mapped to a custom domain (gym_domains). The
 * proxied host is mocked via the OXY-HOST proxy channel — X-Praxella-Host +
 * X-Praxella-Proxy-Key (the CF Worker's identity headers), trusted only because CI
 * sets PROXY_HOST_SECRET. (x-forwarded-host is no longer trusted — R1/R2.) Asserts:
 *   · mapped domain (no ?gym) → THAT gym's branded landing renders
 *   · ?gym=slug still works (regression)
 *   · an unmapped host (vendor/Railway domain) → the DEFAULT gym (no regression)
 * The domain drives LANDING + branding ONLY — no auth coupling (scope guard).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `wl-dom-${BASE}`
const DOMAIN = `wl-dom-${BASE}.test`.toLowerCase()
const BRAND = '#22aa33'
const NAME = 'Domain Dojo'
const DEFAULT_BRAND = '#cd1419'
// OXY-HOST: the proxy identity headers (mimic the CF Worker). Trusted because CI
// sets PROXY_HOST_SECRET to this same value.
const PROXY_KEY = process.env.PROXY_HOST_SECRET || ''
const proxyHeaders = (domain: string) => ({ 'x-praxella-host': domain, 'x-praxella-proxy-key': PROXY_KEY })

async function seedWl(slug: string, brand: string, name: string): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string // the gym UUID
}

async function mapDomain(gymId: string, domain: string) {
  const res = await fetch(`${URL}/rest/v1/gym_domains`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gym_id: gymId, domain, is_primary: true }),
  })
  // 409 = the domain is already mapped (a local rerun) → fine (CI resets fresh).
  if (!res.ok && res.status !== 409) throw new Error(`map domain ${domain} failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-DOMAIN-ROUTING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const gymId = await seedWl(SLUG, BRAND, NAME)
  await mapDomain(gymId, DOMAIN)
})

test('WL-DOMAIN-ROUTING · a mapped custom domain renders THAT gym\'s branded landing (no ?gym)', async ({ browser }) => {
  // Mock the proxied Host to the mapped domain (via the OXY-HOST proxy channel).
  const ctx = await browser.newContext({ locale: 'en', extraHTTPHeaders: proxyHeaders(DOMAIN) })
  const page = await ctx.newPage()
  try {
    await page.goto('/en') // NO ?gym — resolution is by domain
    await expect(page.getByTestId('hero-gym-name'), 'the domain resolves to its gym').toHaveText(NAME, { timeout: 15_000 })
    await expect(page.locator('[data-testid="hero-brand-glow"]'), 'and renders its brand color')
      .toHaveAttribute('data-brand-color', BRAND)
  } finally {
    await ctx.close()
  }
})

test('WL-DOMAIN-ROUTING · ?gym=slug still resolves the gym (regression)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // no host override → localhost
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG)}`)
    await expect(page.getByTestId('hero-gym-name'), '?gym= keeps working').toHaveText(NAME, { timeout: 15_000 })
    await expect(page.locator('[data-testid="hero-brand-glow"]')).toHaveAttribute('data-brand-color', BRAND)
  } finally {
    await ctx.close()
  }
})

test('WL-DOMAIN-ROUTING · an unmapped host (vendor/Railway domain) falls back to the default gym', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // Host = localhost → unmapped
  const page = await ctx.newPage()
  try {
    await page.goto('/en') // no ?gym, unmapped host → DEFAULT_GYM_SLUG
    const glow = page.locator('[data-testid="hero-brand-glow"]')
    await expect(glow, 'the default gym renders').toBeVisible({ timeout: 15_000 })
    await expect(glow, 'default crimson (not the mapped gym color)').toHaveAttribute('data-brand-color', DEFAULT_BRAND)
    await expect(page.getByTestId('hero-gym-name'), 'the mapped gym did not leak to the vendor domain').not.toHaveText(NAME)
  } finally {
    await ctx.close()
  }
})
