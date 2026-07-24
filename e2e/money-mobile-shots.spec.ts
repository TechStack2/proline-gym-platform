import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * MONEY-MOBILE — the §6.3 evidence matrix: the two money tabs (Invoices + Payments)
 * PLUS the Prospects funnel strip across {en, ar} × {light, dark} × {390, 768, 1280}.
 *
 *   · 390  — the AFTER of the owner's screenshotted defects: money card rows (amounts
 *            in view, actions in their own row) AND the leads stage tiles wrapping
 *            fully-readable instead of clipping off the right edge; no h-scroll.
 *   · 768/1280 — the table / desktop path this slice must leave working (each table
 *            inside its own overflow-x container; the page body never scrolls
 *            horizontally; the funnel keeps its 5-across at ≥lg).
 *
 * Uses the shared owner storage (its gym carries seeded invoices + payments + leads).
 * Dark is forced through localStorage AND colorScheme so the app's pre-paint init
 * actually lands the class (emulating the media query alone would shoot a light page).
 */
const VIEWPORTS = { 390: { width: 390, height: 844 }, 768: { width: 768, height: 1024 }, 1280: { width: 1280, height: 900 } } as const

const SURFACES = [
  { path: '/money?tab=invoices', name: 'money-invoices', ready: '[data-testid="shell-content"], main' },
  { path: '/money?tab=payments', name: 'money-payments', ready: '[data-testid="shell-content"], main' },
  { path: '/students?tab=prospects', name: 'leads-funnel', ready: '[data-testid="leads-pipeline"]' },
] as const

async function shoot(
  browser: Browser,
  surface: { path: string; name: string; ready: string },
  locale: 'en' | 'ar',
  scheme: 'light' | 'dark',
  width: keyof typeof VIEWPORTS,
) {
  const ctx = await browser.newContext({
    storageState: ROLES.owner.storage,
    locale,
    viewport: VIEWPORTS[width],
    colorScheme: scheme,
  })
  if (scheme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const page = await ctx.newPage()
  try {
    await page.goto(`/${locale}${surface.path}`)
    await expect(page.locator(surface.ready).first(), `${surface.name} rendered`).toBeVisible({ timeout: 25_000 })
    if (scheme === 'dark') {
      expect(await page.locator('html').evaluate((el) => el.classList.contains('dark')), `${surface.name}: html.dark applied`).toBe(true)
    }
    await page.waitForTimeout(400)
    await page.screenshot({ path: `screenshots/money-mobile-${surface.name}-${locale}-${scheme}-${width}.png`, fullPage: true })
  } finally {
    await ctx.close()
  }
}

for (const s of SURFACES) {
  for (const locale of ['en', 'ar'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const width of [390, 768, 1280] as const) {
        test(`MONEY-MOBILE shot · ${s.name} · ${locale}/${scheme}/${width}`, async ({ browser }) => {
          test.setTimeout(90_000)
          await shoot(browser, s, locale, scheme, width)
        })
      }
    }
  }
}
