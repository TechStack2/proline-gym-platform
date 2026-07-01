import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * PWA-SESSION — a relaunched INSTALLED PWA (manifest start_url '/') with a valid
 * session must land on the user's HOME, not the public marketing landing.
 *
 * Repro: the session survives a standalone relaunch (Supabase SSR is cookie-backed),
 * but the middleware never redirected an AUTHENTICATED visitor off the landing root,
 * so the installed app reopened on the marketing hero instead of home.
 *
 * The persisted session == a role storageState; re-entering at the landing root
 * ('/' — the exact start_url — or '/{locale}') with that session IS the relaunch.
 * Guard: entry redirects to the role home (member/parent → /portal, staff →
 * /dashboard→/today) and the marketing landing (`pricing-plans`) is NOT rendered.
 */
async function relaunch(browser: Browser, role: keyof typeof ROLES, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test('PWA-SESSION · member relaunch at start_url "/" lands on the portal home (not landing)', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'student')
  try {
    // The exact PWA start_url: bare '/', no locale, session cookie present.
    await page.goto('/')
    await expect(page, 'authenticated entry → portal home, not the landing').toHaveURL(/\/portal(\/|$|\?)/, { timeout: 20_000 })
    await expect(vis(page, '[data-testid="self-view"]').first(), 'the member home rendered').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('PWA-SESSION · staff relaunch at "/{locale}" lands on the staff home (not landing)', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'owner')
  try {
    await page.goto('/en')   // the locale-root landing
    await expect(page, 'authenticated staff entry → /today front desk (via /dashboard)').toHaveURL(/\/(dashboard|today)(\/|$|\?)/, { timeout: 20_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('PWA-SESSION · guardian relaunch lands on the portal (kid-switcher), not landing', async ({ browser }) => {
  const { ctx, page } = await relaunch(browser, 'parent')
  try {
    await page.goto('/')
    await expect(page, 'authenticated guardian entry → portal').toHaveURL(/\/portal(\/|$|\?)/, { timeout: 20_000 })
    await expect(page.locator('[data-testid="pricing-plans"]'), 'the marketing landing is NOT shown').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
