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
  test('the web-app manifest is linked + installable (locale-neutral start_url, icons resolve)', async ({ browser }) => {
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      // install precondition: the manifest must be discoverable in <head>.
      const href = await page.locator('link[rel="manifest"]').first().getAttribute('href')
      expect(href, 'the web-app manifest is linked in <head> (was missing → not installable)').toBeTruthy()
      const man = await page.request.get(href!)
      expect(man.status(), 'manifest resolves').toBe(200)
      const json = await man.json()
      expect(json.start_url, 'start_url is locale-neutral (was hard-coded /en)').toBe('/')
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

  test('desktop offline → shell banner engages + SW-cached shell loads; online → clears', async ({ browser }) => {
    test.setTimeout(120_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      // Load online so the SW registers + page-caches the front-desk shell. A
      // second online load lets the (now-active) SW control + cache this shell.
      await page.goto('/en/today')
      await expect(vis(page, '[data-testid="shell-offline-banner"]'),
        'no offline banner while online').toHaveCount(0)
      await page.reload()
      await page.waitForLoadState('networkidle').catch(() => {})
      // Bounded wait for the SW to CONTROL the page (skipWaiting w/o clientsClaim
      // → control lands after a post-activation navigation). NB never await
      // `serviceWorker.ready` here — it can hang with no internal timeout.
      await page
        .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
        .catch(() => {})

      // ── OFFLINE: the banner engages on the DESKTOP viewport (was mobile/page-only) ──
      await ctx.setOffline(true)
      const banner = vis(page, '[data-testid="shell-offline-banner"]').first()
      await expect(banner, 'offline banner engages on the desktop front-desk shell').toBeVisible({ timeout: 15_000 })
      await expect(banner).toHaveAttribute('data-online', 'false')

      // ── The cached SHELL still loads on an offline reload (SW-served, not a
      //    browser error). The banner re-rendering after the reload proves the
      //    React app mounted from cache. Retry the reload — the SW may serve on a
      //    later attempt (NetworkFirst falls back to cache after its timeout). ──
      await untilConsistent(async () => {
        await page.reload()
        await expect(
          vis(page, '[data-testid="shell-offline-banner"]').first(),
          'SW serves the cached shell offline (app mounted, not an error page)',
        ).toBeVisible({ timeout: 8_000 })
      }, { timeout: 45_000 })

      // ── ONLINE again → the banner clears ──
      await ctx.setOffline(false)
      await expect(vis(page, '[data-testid="shell-offline-banner"]'),
        'banner clears when back online').toHaveCount(0, { timeout: 15_000 })
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
