import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis } from './helpers'

/**
 * PWA-INSTALL — the admin-side, platform-aware "Install the app" card on the
 * front-desk hub (Today). Proves: a non-standalone staff context sees the card +
 * platform manual steps (macOS Safari / Mac-Win Chrome-Edge); where
 * beforeinstallprompt is captured, the button triggers the native prompt; an
 * already-installed (standalone) context nags nothing; dismiss is remembered; /ar
 * clean. The card consolidates the old Chrome/Edge-only bottom-bar prompt (no
 * double-up). Every wait is bounded.
 */
async function ownerPage(browser: Browser, locale = 'en', initScript?: string) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  if (initScript) await ctx.addInitScript(initScript)
  return { ctx, page: await ctx.newPage() }
}

const card = (p: import('@playwright/test').Page) => vis(p, '[data-testid="install-app-card"]')

test.describe('PWA-INSTALL · desktop install + admin affordance', () => {
  test('non-standalone: the card renders with platform steps (or native button) + dismiss is remembered', async ({ browser }) => {
    test.setTimeout(90_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      // Ensure a clean (un-dismissed) state, then re-render.
      await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
      await page.reload()
      await expect(card(page).first(), 'install affordance renders on the front-desk hub').toBeVisible({ timeout: 15_000 })

      // Either the native button (beforeinstallprompt captured) OR the manual steps.
      const hasBtn = await vis(page, '[data-testid="install-app-btn"]').count()
      if (hasBtn === 0) {
        await expect(vis(page, '[data-testid="install-app-instructions"]').first(), 'platform manual steps shown when no native prompt').toBeVisible()
      }

      // Dismiss → no nag + remembered.
      await vis(page, '[data-testid="install-app-dismiss"]').first().click()
      await expect(card(page), 'dismissed → no card').toHaveCount(0, { timeout: 10_000 })
      expect(await page.evaluate(() => localStorage.getItem('pwa_install_dismissed')), 'dismiss remembered').toBe('true')
    } finally {
      await ctx.close()
    }
  })

  // W2c §5: the manual steps are chosen by PLATFORM (UA) — iOS Safari gets
  // Share→Add-to-Home-Screen, Android Chrome gets the install-icon/⋮ steps,
  // never the desktop address-bar copy.
  for (const [label, ua, expectStep] of [
    [
      'iOS Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'iosSafari',
    ],
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'androidChrome',
    ],
  ] as const) {
    test(`platform steps by UA — ${label}`, async ({ browser }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({
        storageState: ROLES.owner.storage,
        locale: 'en',
        userAgent: ua,
        viewport: { width: 390, height: 844 },
      })
      const page = await ctx.newPage()
      try {
        await page.goto('/en/today')
        await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
        await page.reload()
        await expect(card(page).first(), `${label}: the card renders`).toBeVisible({ timeout: 15_000 })
        const steps = vis(page, '[data-testid="install-app-instructions"]').first()
        await expect(steps, `${label}: manual steps shown (no native prompt on this UA)`).toBeVisible()
        // The rendered title is the platform's own step set (i18n text varies —
        // assert via the platform-specific keyword the other platforms lack).
        if (expectStep === 'iosSafari') {
          await expect(steps, 'iOS steps mention Share / Add to Home Screen').toContainText(/share|home screen/i)
        } else {
          await expect(steps, 'Android steps mention the install icon / menu').toContainText(/install/i)
          await expect(steps, 'Android steps are not the desktop address-bar copy').not.toContainText(/dock/i)
        }
      } finally {
        await ctx.close()
      }
    })
  }

  test('captured beforeinstallprompt → the button triggers the native prompt', async ({ browser }) => {
    test.setTimeout(90_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      await page.goto('/en/today')
      await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
      await page.reload()
      await expect(card(page).first()).toBeVisible({ timeout: 15_000 })

      // Mock a captured native prompt (Chromium fires this; headless usually doesn't).
      await page.evaluate(() => {
        const e = new Event('beforeinstallprompt') as Event & { prompt?: () => Promise<void>; userChoice?: Promise<unknown> }
        e.prompt = async () => { (window as unknown as { __pwaPromptCalled?: boolean }).__pwaPromptCalled = true }
        e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
        window.dispatchEvent(e)
      })

      const btn = vis(page, '[data-testid="install-app-btn"]').first()
      await expect(btn, 'native install button appears once a prompt is captured').toBeVisible({ timeout: 10_000 })
      await btn.click()
      expect(await page.evaluate(() => (window as unknown as { __pwaPromptCalled?: boolean }).__pwaPromptCalled === true), 'clicking triggered the native prompt').toBe(true)
      await expect(card(page), 'accepted → card hides').toHaveCount(0, { timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('standalone/installed: nothing nags', async ({ browser }) => {
    test.setTimeout(90_000)
    // Emulate an installed PWA: matchMedia('(display-mode: standalone)') → matches.
    const initScript = `(() => {
      const orig = window.matchMedia ? window.matchMedia.bind(window) : null;
      window.matchMedia = (q) => (String(q).includes('display-mode: standalone'))
        ? { matches: true, media: q, onchange: null, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){return false} }
        : (orig ? orig(q) : { matches: false, media: q, onchange: null, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){return false} });
    })();`
    const { ctx, page } = await ownerPage(browser, 'en', initScript)
    try {
      await page.goto('/en/today')
      await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
      await page.reload()
      await expect(vis(page, '[data-testid="horizon-switcher"]').first(), 'Today rendered').toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-testid="install-app-card"]'), 'no install nag when already installed').toHaveCount(0, { timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })

  test('/ar: the install card is localized (RTL, no missing keys)', async ({ browser }) => {
    test.setTimeout(90_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      await page.goto('/ar/today')
      await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
      await page.reload()
      await expect(card(page).first(), 'card renders on /ar').toBeVisible({ timeout: 15_000 })
      const hasBtn = await vis(page, '[data-testid="install-app-btn"]').count()
      if (hasBtn === 0) {
        await expect(vis(page, '[data-testid="install-app-instructions"]').first()).toBeVisible()
      }
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
      expect(await page.locator('text=pwa.').count(), 'no unresolved pwa.* key').toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
