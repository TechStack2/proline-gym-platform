import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/**
 * OFF-1 — installed-PWA offline FOUNDATION on a desktop viewport (the front-desk
 * laptop). Foundation only — no OFF-2..4 offline reads/writes. Proves:
 *  1. The web-app manifest is LINKED + installable (was never linked → no
 *     installed PWA / no offline engagement anywhere); start_url is locale-
 *     neutral; the install icons resolve.
 *  2. On a DESKTOP viewport, going offline engages the shell offline banner
 *     (previously the offline UX lived only on the mobile shell / a couple of
 *     pages), and the SW serves the cached shell on an offline reload — not a
 *     browser error page. Back online clears it.
 *  3. /ar desktop offline shell is clean (localized).
 *
 * Desktop Chrome project (default desktop viewport) + reuses the G2 offline
 * harness (`context.setOffline`). Owner session.
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test.describe('OFF-1 · installed-PWA offline foundation (desktop viewport)', () => {
  test('the web-app manifest is linked + installable (per-locale start_url, icons resolve)', async ({ browser }) => {
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      // install precondition: the manifest must be discoverable in <head>.
      const href = await page.locator('link[rel="manifest"]').first().getAttribute('href')
      expect(href, 'the web-app manifest is linked in <head> (was missing → not installable)').toBeTruthy()
      // PREMISE UPDATED (W2c §5): the link carries the page's locale and
      // start_url follows it — an installing user's app opens in THEIR language
      // (the OFF-PERF stranding class dies at the root; the old locale-neutral
      // '/' start_url is superseded by the ruled §5 contract).
      expect(href, 'the manifest link carries the page locale').toContain('locale=en')
      const man = await page.request.get(href!)
      expect(man.status(), 'manifest resolves').toBe(200)
      const json = await man.json()
      expect(json.start_url, 'start_url carries the installing locale (§5)').toBe('/en')
      expect(json.display).toBe('standalone')
      // Chrome needs a valid >=192 PNG icon to offer install — they must resolve.
      for (const px of [192, 512]) {
        const res = await page.request.get(`/icons/icon-${px}x${px}.png`)
        expect(res.status(), `icon-${px} resolves`).toBe(200)
      }
    } finally {
      await ctx.close()
    }
  })

  test('desktop offline → shell banner engages on the loaded page; online → clears', async ({ browser }) => {
    test.setTimeout(120_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      await expect(vis(page, '[data-testid="shell-offline-banner"]'),
        'no offline banner while online').toHaveCount(0)

      // ── OFFLINE: the offline UX ENGAGES on the DESKTOP viewport — previously the
      //    banner/use-online lived only on the mobile shell + a couple pages, so
      //    the desk laptop showed nothing. No SW needed: the loaded SPA reacts. ──
      await ctx.setOffline(true)
      const banner = vis(page, '[data-testid="shell-offline-banner"]').first()
      await expect(banner, 'offline banner engages on the desktop front-desk shell').toBeVisible({ timeout: 15_000 })
      await expect(banner).toHaveAttribute('data-online', 'false')

      // ── ONLINE again → the banner clears ──
      await ctx.setOffline(false)
      await expect(vis(page, '[data-testid="shell-offline-banner"]'),
        'banner clears when back online').toHaveCount(0, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('the SW registers + controls, then serves the cached shell on an offline reload', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      // The SW must REGISTER + take CONTROL of the page (worker-src 'self' lets it
      // register under the strict-dynamic CSP; skipWaiting+clientsClaim claim it).
      // A real wait (no silent catch) so a non-registering SW fails here, loudly.
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 40_000 })

      // Prime the page-cache: a navigation the (now-controlling) SW HANDLES is the
      // one that gets cached. The first load happened before control, so reload
      // online once under control → /en/today lands in NetworkFirst page-cache.
      await page.reload()
      await page.waitForLoadState('networkidle').catch(() => {})

      // ── OFFLINE reload: the SW serves the cached shell — not a browser error. The
      //    banner re-rendering proves the React app mounted from cache. ──
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(
          vis(page, '[data-testid="shell-offline-banner"]').first(),
          'SW serves the cached shell offline (app mounted from cache, not an error page)',
        ).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })

  test('/ar desktop offline shell is clean (localized, no missing keys)', async ({ browser }) => {
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      await page.goto('/ar/today')
      await ctx.setOffline(true)
      await expect(vis(page, '[data-testid="shell-offline-banner"]').first(),
        'offline banner shows on /ar').toBeVisible({ timeout: 15_000 })
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar offline shell').toBe(0)
      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })
})
