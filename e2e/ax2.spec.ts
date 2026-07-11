import { test, expect, type Browser } from '@playwright/test'
import { gymSlug } from './helpers'

/**
 * AX-2 — Landing polish (post-deploy operator feedback). Proofs:
 *  1. Disciplines: the subtitle count == the number of rendered discipline cards
 *     (dynamic, not a hardcoded 6); known disciplines get distinct, non-default
 *     icons (the positional ICONS bug gave MMA a music note).
 *  2. Map: on a gym WITH coordinates the Facility iframe src is the keyless
 *     OpenStreetMap embed (not the blank Google placeholder), the page CSP
 *     frame-src allows the OSM origin (AX-3 grey-box guard), and a "View on
 *     Google Maps" link is present. TENANT-CONTENT: on a gym with NO coordinates
 *     the map self-hides (honest empty — never a 0,0 ocean marker, never Proline's
 *     coords via a fallback). The run gym sets no coords → drives the hidden case;
 *     a hermetic gym WITH coords (seeded below) drives the positive render case.
 *  3. Hero: the background is the clean photo (gym-1), NOT the baked-text hero.jpg.
 *  4. Trial form (DEMO-CRITICAL): on the BARE landing (no ?gym= → the prod
 *     default gym) name+phone submit SUCCEEDS (reproduces+fixes the dead-funnel
 *     prod bug); the ?gym=<run slug> path stays green.
 *  5. /ar renders clean (no MISSING_MESSAGE).
 */
async function anon(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  return { ctx, page: await ctx.newPage() }
}

// TENANT-CONTENT: the Facility map now self-hides on a gym with no coordinates
// (the honest tenant-clean behavior; the run gym seeds none). To keep the map
// RENDER coverage — OSM embed src + CSP frame-src (AX-3) + the Google link — seed
// a hermetic gym WITH coordinates + address and drive the positive case at it.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const MAP_SLUG = `ax2map-${BASE}`
const MAP_COORDS = { map_lat: 33.888, map_lng: 35.495 }
const MAP_ADDRESS = 'Champions Arena, Beirut'

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('AX-2 map positive case needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  // Idempotent by slug (seed_e2e_wl_gym upserts) — ax2 may run under >1 project.
  const seed = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: MAP_SLUG, p_brand_color: null, p_name: 'AX2 Map Gym' }),
  })
  if (!seed.ok) throw new Error(`seed_e2e_wl_gym(${MAP_SLUG}) failed: ${seed.status} ${await seed.text()}`)
  const patch = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(MAP_SLUG)}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...MAP_COORDS, address_en: MAP_ADDRESS }),
  })
  if (!patch.ok) throw new Error(`ax2 map coords patch(${MAP_SLUG}) failed: ${patch.status} ${await patch.text()}`)
})

test('AX-2 · disciplines: dynamic count + per-discipline non-default icons', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
    const cards = page.locator('[data-testid="discipline-card"]')
    const n = await cards.count()
    expect(n, 'the run gym has active disciplines').toBeGreaterThan(0)

    // The subtitle count must equal the rendered cards (NOT the old hardcoded 6).
    const subtitle = await page.locator('#disciplines p').first().innerText()
    const m = subtitle.match(/(\d+)/)
    expect(m, 'subtitle states a count').not.toBeNull()
    expect(Number(m![1]), 'subtitle count == rendered discipline cards').toBe(n)

    // Known disciplines resolve to distinct, NON-default icons (the positional-
    // ICONS bug gave MMA a music note). Boxing→boxing, Muay Thai→muaythai — both
    // non-default and distinct from each other. (An unknown discipline legitimately
    // uses the default icon — that's the tenant-clean fallback, not a bug — so we
    // assert the KNOWN ones resolve, not that zero defaults exist.)
    const boxing = page.locator('[data-testid="discipline-card"][data-icon="boxing"]')
    const muay = page.locator('[data-testid="discipline-card"][data-icon="muaythai"]')
    await expect(boxing, 'Boxing card uses the boxing icon (not default)').toHaveCount(1)
    await expect(muay, 'Muay Thai card uses the muay-thai icon (not default)').toHaveCount(1)
  } finally {
    await ctx.close()
  }
})

test('AX-2 · facility map renders the keyless OSM embed + Google link + CSP frame-src (gym WITH coordinates)', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    const resp = await page.goto(`/en?gym=${encodeURIComponent(MAP_SLUG)}`)
    const map = page.locator('[data-testid="facility-map"]')
    await expect(map, 'a gym with coordinates renders the facility map').toHaveCount(1)
    const src = (await map.getAttribute('src')) ?? ''
    expect(src, 'the map is the OpenStreetMap export/embed (never a blank Google box)')
      .toContain('openstreetmap.org/export/embed')
    expect(src, 'the marker sits on the gym coordinates').toContain('marker=33.8880')
    // AX-3: the iframe ORIGIN must be allowed by the page CSP — the AX-2 src-only
    // check passed while prod's frame-src 'self' silently refused the embed, so
    // the map rendered as a grey box. Assert frame-src permits the OSM origin.
    const csp = resp?.headers()['content-security-policy'] ?? ''
    expect(csp, 'frame-src must allow the OSM embed origin (else the iframe is blocked → grey box)')
      .toMatch(/frame-src[^;]*\bhttps:\/\/www\.openstreetmap\.org/)
    await expect(page.locator('[data-testid="view-on-google-maps"]').first(), 'View on Google Maps link present')
      .toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('AX-2 · facility map self-hides on a gym with NO coordinates (honest empty — no ocean marker, no Proline fallback)', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    // The run gym sets no map_lat/map_lng. Pre TENANT-CONTENT the map silently fell
    // back to Proline's coordinates (a cross-tenant leak); the honest behavior is to
    // render the facility section WITHOUT a map, never a 0,0 marker in the ocean.
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
    await expect(page.locator('#facility'), 'the facility section still renders').toBeVisible()
    await expect(page.locator('[data-testid="facility-map"]'), 'no map without coordinates').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('AX-2 · hero background is the clean photo (no baked-text hero.jpg)', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
    await expect(page.locator('img[src*="gym-1"]').first(), 'hero uses the clean gym photo')
      .toBeVisible({ timeout: 15_000 })
    await expect(page.locator('img[src*="hero.jpg"]'), 'the baked-text hero.jpg is gone').toHaveCount(0)
    await expect(page.locator('h1').first(), 'the live headline renders').toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('AX-2 · trial form submits on the BARE landing (no ?gym=) — the prod-default gym', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    // No ?gym= param → the page falls back to DEFAULT_GYM_SLUG (the demo gym).
    // Pre-fix this sent p_gym_slug=null → 'invalid' → "please fill in all fields".
    await page.goto('/en')
    await page.locator('#trial-name').fill('AX2 Bare Landing')
    await page.locator('#trial-phone').fill('+9613000000') // fixed → RPC 24h dedup prevents accumulation
    await page.getByTestId('trial-submit').click()
    await expect(page.getByTestId('trial-success'), 'the bare-landing funnel works (default gym resolved)')
      .toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('AX-2 · trial form still submits on the ?gym=<run slug> path', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
    await page.locator('#trial-name').fill(`AX2 Run ${Date.now().toString().slice(-6)}`)
    await page.locator('#trial-phone').fill(`+96176${Date.now().toString().slice(-6)}`)
    await page.getByTestId('trial-submit').click()
    await expect(page.getByTestId('trial-success')).toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }
})

test('AX-2 · /ar landing renders the polished sections clean (no MISSING_MESSAGE)', async ({ browser }) => {
  const { ctx, page } = await anon(browser, 'ar')
  try {
    await page.goto(`/ar?gym=${encodeURIComponent(gymSlug())}`)
    await expect(page.locator('[data-testid="discipline-card"]').first()).toBeVisible({ timeout: 15_000 })
    // TENANT-CONTENT: the run gym has no coordinates → the facility map self-hides.
    // /ar still renders the polished sections (disciplines above) clean, no MISSING_MESSAGE.
    await expect(page.locator('[data-testid="facility-map"]')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE')
  } finally {
    await ctx.close()
  }
})
