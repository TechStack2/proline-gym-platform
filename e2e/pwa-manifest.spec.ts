import { test, expect } from '@playwright/test'

/**
 * PWA-IDENTITY — the installed app says the GYM's name, not "PRO LINE" for every
 * tenant. The web-app manifest is served from a DYNAMIC route
 * (/manifest.webmanifest) that resolves the gym by request Host (gym_domains, the
 * WL-DOMAIN resolver) else the default. Asserts:
 *   · a mapped custom domain (mocked via x-forwarded-host) → THAT gym's
 *     name/short_name/theme_color + its logo as the icon
 *   · an unmapped/vendor host → today's default manifest, byte-equivalent (no
 *     regression to the demo install)
 * Anon route — no auth. Seeds its OWN isolated gym + domain (service role).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `pwa-${BASE}`
const DOMAIN = `pwa-${BASE}.test`.toLowerCase()
const BRAND = '#3366cc'
const NAME = 'Manifest Muay Thai'
const LOGO = '/landing/gym-2.jpg' // a committed asset → a stable per-gym icon src

async function seedWl(slug: string, brand: string, name: string): Promise<string> {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as string // the gym UUID
}

async function setLogo(slug: string) {
  const res = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ logo_url: LOGO }),
  })
  if (!res.ok) throw new Error(`logo patch(${slug}) failed: ${res.status} ${await res.text()}`)
}

async function mapDomain(gymId: string, domain: string) {
  const res = await fetch(`${URL}/rest/v1/gym_domains`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gym_id: gymId, domain, is_primary: true }),
  })
  // 409 = already mapped (a local rerun) → fine (CI resets fresh).
  if (!res.ok && res.status !== 409) throw new Error(`map domain ${domain} failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('PWA-IDENTITY needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const gymId = await seedWl(SLUG, BRAND, NAME)
  await setLogo(SLUG)
  await mapDomain(gymId, DOMAIN)
})

test('PWA-IDENTITY · a mapped domain manifest carries THAT gym name/color/icon', async ({ request }) => {
  // OXY-HOST: proxied host via the Worker identity channel (not x-forwarded-host).
  const res = await request.get('/manifest.webmanifest', {
    headers: { 'x-praxella-host': DOMAIN, 'x-praxella-proxy-key': process.env.PROXY_HOST_SECRET || '' },
  })
  expect(res.status(), 'the dynamic manifest route responds').toBe(200)
  expect(res.headers()['content-type'], 'served as a web manifest').toContain('application/manifest+json')
  const m = await res.json()
  expect(m.name, 'name is the mapped gym').toBe(NAME)
  expect(m.short_name, 'short_name is the mapped gym').toBe(NAME)
  expect(m.theme_color, 'theme_color is the gym brand color').toBe(BRAND)
  // W2c §5 (premise updated, DA-16): the gym's raw logo is still the identity
  // icon for a LEGACY logo (no processed maskable set uploaded) — but the sizes
  // STOP LYING: a rectangle is declared `sizes:'any'`, never a fake 192/512
  // maskable square. (Real squares appear only when the upload-time set exists —
  // covered by the identity unit tests.)
  expect(m.icons?.[0]?.src, 'icon resolves the gym logo, not the default').toBe(LOGO)
  expect(m.icons?.[0]?.sizes, 'legacy logo sizes stop lying').toBe('any')
  expect(m.icons?.[0]?.purpose, 'legacy logo never claims maskable').toBe('any')
  // Structural fields stay put.
  expect(m.display).toBe('standalone')
  // W2c §5: start_url carries the requested locale (default en when absent).
  expect(m.start_url).toBe('/en')
})

test('PWA-IDENTITY · W2c §5: the manifest varies per locale + stored theme', async ({ request }) => {
  // Arabic install → Arabic app: start_url/lang/dir follow ?locale=ar.
  const ar = await (await request.get('/manifest.webmanifest?locale=ar')).json()
  expect(ar.start_url, 'an Arabic install opens in Arabic').toBe('/ar')
  expect(ar.lang).toBe('ar')
  expect(ar.dir).toBe('rtl')
  // Dark-theme install → dark splash ground; light default is the light ground.
  const dark = await (await request.get('/manifest.webmanifest?locale=en&theme=dark')).json()
  expect(dark.background_color, 'dark install gets the dark splash ground').toBe('#131317')
  expect(dark.start_url).toBe('/en')
  // The description is the gym identity, never the vendor pitch (DA-16).
  const en = await (await request.get('/manifest.webmanifest?locale=en')).json()
  expect(en.description).not.toContain('Management Platform')
  expect(en.description, 'description carries the gym name').toContain('PRO LINE')
})

test('PWA-IDENTITY · an unmapped/vendor host manifest is today\'s default (no regression)', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest') // Host = localhost → unmapped → default
  expect(res.status()).toBe(200)
  const m = await res.json()
  expect(m.name, 'default name unchanged').toBe('PRO LINE Gym')
  expect(m.short_name, 'default short_name unchanged').toBe('PRO LINE')
  expect(m.theme_color, 'default theme_color unchanged').toBe('#cd1419')
  // W2c §5 (premise updated): the splash ground is the LIGHT app ground by
  // default (#ffffff; a dark-theme install gets #131317 via ?theme=dark) — the
  // old #252525 was neither theme's real ground.
  expect(m.background_color).toBe('#ffffff')
  // Default icons = the committed /icons set, not a gym logo.
  expect(m.icons?.[0]?.src, 'default icon is the committed asset').toBe('/icons/icon-72x72.png')
  expect(m.icons.length, 'all 8 default sizes present').toBe(8)
  expect(m.icons.every((i: { src: string }) => i.src.startsWith('/icons/')), 'no gym logo leaked into the default').toBe(true)
})
