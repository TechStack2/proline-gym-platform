import { test, expect, type Browser } from '@playwright/test'
import { gymSlug } from './helpers'

/**
 * AX-2 — Landing polish (post-deploy operator feedback). Proofs:
 *  1. Disciplines: the subtitle count == the number of rendered discipline cards
 *     (dynamic, not a hardcoded 6); known disciplines get distinct, non-default
 *     icons (the positional ICONS bug gave MMA a music note).
 *  2. Map: the Facility iframe src is the keyless OpenStreetMap embed (not the
 *     blank Google placeholder) + a "View on Google Maps" link is present.
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

test('AX-2 · facility map is the keyless OSM embed + a Google Maps link', async ({ browser }) => {
  const { ctx, page } = await anon(browser)
  try {
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`)
    const map = page.locator('[data-testid="facility-map"]')
    await expect(map).toHaveCount(1)
    const src = (await map.getAttribute('src')) ?? ''
    expect(src, 'the map is the OpenStreetMap export/embed (never a blank Google box)')
      .toContain('openstreetmap.org/export/embed')
    await expect(page.locator('[data-testid="view-on-google-maps"]').first(), 'View on Google Maps link present')
      .toBeVisible()
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
    await expect(page.locator('[data-testid="facility-map"]')).toHaveCount(1)
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE')
  } finally {
    await ctx.close()
  }
})
