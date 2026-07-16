import { test, expect } from '@playwright/test'

/**
 * OXY-HOST — the proxy-gated trusted host (R2) + SEO canonicalization (R4).
 *
 * A branded gym is mapped to a PRIMARY custom domain (gym_domains). Requests carry
 * the OXY-HOST proxy channel (X-Praxella-Host + X-Praxella-Proxy-Key), trusted only
 * because CI sets PROXY_HOST_SECRET to the same value. Asserts:
 *   · proxied host + correct key → THAT gym resolves;
 *   · the same X-Praxella-Host WITHOUT the key → IGNORED → the DEFAULT gym (the
 *     security gap is closed — a spoofed host can't select a tenant);
 *   · rel=canonical + hreflang (ar/en/fr + x-default) render on the canonical host;
 *   · robots.txt + sitemap.xml follow the canonical host (per-host);
 *   · an unmapped host (no proxy) stays SITE_URL (byte-identical / demo untouched).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `oxy-${BASE}`
const DOMAIN = `oxy-${BASE}.test`.toLowerCase()
const NAME = 'Oxy Dojo'
const BRAND = '#0e7490'
const PROXY_KEY = process.env.PROXY_HOST_SECRET || ''
const proxied = (domain: string, key: string = PROXY_KEY) => ({ 'x-praxella-host': domain, 'x-praxella-proxy-key': key })

async function seedWl(slug: string, brand: string, name: string): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string
}
async function mapDomain(gymId: string, domain: string) {
  const res = await fetch(`${URL}/rest/v1/gym_domains`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gym_id: gymId, domain, is_primary: true }),
  })
  if (!res.ok && res.status !== 409) throw new Error(`map domain ${domain} failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('OXY-HOST needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  if (!PROXY_KEY) throw new Error('OXY-HOST needs PROXY_HOST_SECRET set in the CI env')
  const gymId = await seedWl(SLUG, BRAND, NAME)
  await mapDomain(gymId, DOMAIN)
})

test('R2 · a proxied custom domain (correct key) resolves THAT gym', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en', extraHTTPHeaders: proxied(DOMAIN) })
  const page = await ctx.newPage()
  try {
    await page.goto('/en')
    await expect(page.getByTestId('hero-gym-name')).toHaveText(NAME, { timeout: 15_000 })
  } finally { await ctx.close() }
})

test('R2 · the SAME X-Praxella-Host WITHOUT the key is IGNORED → the default gym', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en', extraHTTPHeaders: { 'x-praxella-host': DOMAIN } }) // no key
  const page = await ctx.newPage()
  try {
    await page.goto('/en')
    await expect(page.getByTestId('hero-gym-name'), 'a spoofed host without the secret cannot select a tenant')
      .not.toHaveText(NAME)
  } finally { await ctx.close() }
})

test('R2 · a WRONG proxy key is IGNORED → the default gym', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en', extraHTTPHeaders: proxied(DOMAIN, 'wrong-key') })
  const page = await ctx.newPage()
  try {
    await page.goto('/en')
    await expect(page.getByTestId('hero-gym-name')).not.toHaveText(NAME)
  } finally { await ctx.close() }
})

test('R4 · rel=canonical + hreflang render on the canonical (custom) host', async ({ request }) => {
  const html = await (await request.get('/en', { headers: proxied(DOMAIN) })).text()
  // canonical → this gym's custom domain, /en (attribute order-tolerant)
  expect(html, 'canonical points at the custom domain').toMatch(
    new RegExp(`rel="canonical"[^>]*href="https://${DOMAIN}/en"|href="https://${DOMAIN}/en"[^>]*rel="canonical"`))
  // hreflang alternates for every locale + x-default, absolute on the custom host
  for (const loc of ['ar', 'en', 'fr']) {
    expect(html, `hreflang ${loc} on the custom host`).toMatch(
      new RegExp(`hreflang="${loc}"[^>]+href="https://${DOMAIN}/${loc}"|href="https://${DOMAIN}/${loc}"[^>]+hreflang="${loc}"`))
  }
  expect(html, 'x-default present').toMatch(/hreflang="x-default"/)
  // og:url follows the canonical host
  expect(html, 'og:url on the custom host').toMatch(
    new RegExp(`property="og:url"[^>]+content="https://${DOMAIN}/en"`))
})

test('R4 · robots.txt is per-host (sitemap + host = the canonical origin)', async ({ request }) => {
  const body = await (await request.get('/robots.txt', { headers: proxied(DOMAIN) })).text()
  expect(body).toContain(`Sitemap: https://${DOMAIN}/sitemap.xml`)
  expect(body).toMatch(new RegExp(`Host:\\s*https://${DOMAIN}`))
  expect(body, 'app surfaces disallowed').toMatch(/Disallow:.*\/portal|Disallow:\s*\/\*\/portal/)
})

test('R4 · sitemap.xml is per-host (canonical origin locale URLs)', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml', { headers: proxied(DOMAIN) })).text()
  for (const loc of ['ar', 'en', 'fr']) {
    expect(xml, `sitemap lists ${loc} on the custom host`).toContain(`https://${DOMAIN}/${loc}`)
  }
})

test('R4 · an unmapped host (no proxy) keeps SITE_URL robots (byte-identical / demo untouched)', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text() // Host=localhost → unmapped → SITE_URL
  expect(body, 'no tenant custom domain leaks onto the default host').not.toContain(DOMAIN)
  expect(body).toMatch(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/)
})
