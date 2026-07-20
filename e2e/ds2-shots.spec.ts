import { test, expect, type Browser } from '@playwright/test'
import { ROLES, type Role } from './roles'

/**
 * DS2-TOKENS — the §6.3 evidence matrix: {en, ar} × {light, dark} × {390, 1280}.
 *
 * Two kinds of surface, deliberately mixed, because the claim being evidenced is a
 * claim about BOTH:
 *   · CHANGED  — staff /schedule (DA-31: the alarm-red timetable becomes a category
 *     tint) and the landing (the DA-27 Affiliations band stops flipping in dark).
 *   · CONTROL  — staff /today and /invoices, which this slice must leave alone. A
 *     token refactor that moved a control surface would be a regression, and the
 *     §6.2 byte-identity claim is only worth as much as the controls that back it.
 *
 * Dark is forced through localStorage AND colorScheme: the app applies dark as a
 * class from its own pre-paint init script, so emulating the media query alone would
 * silently shoot a light page and call it dark.
 */
const VIEWPORTS = { 390: { width: 390, height: 844 }, 1280: { width: 1280, height: 900 } } as const

type Surface = { role: Role | null; path: string; ready: string; name: string; changed: boolean }
const SURFACES: Surface[] = [
  { role: 'owner', path: '/schedule', ready: 'week-grid', name: 'staff-schedule', changed: true },
  { role: null, path: '', ready: 'hero-gym-name', name: 'landing', changed: true },
  { role: 'owner', path: '/today', ready: 'shell-content', name: 'staff-today', changed: false },
  { role: 'owner', path: '/invoices', ready: 'shell-content', name: 'staff-invoices', changed: false },
]

async function shoot(
  browser: Browser,
  s: Surface,
  locale: 'en' | 'ar',
  scheme: 'light' | 'dark',
  width: keyof typeof VIEWPORTS,
) {
  const ctx = await browser.newContext({
    ...(s.role ? { storageState: ROLES[s.role].storage } : {}),
    locale,
    viewport: VIEWPORTS[width],
    colorScheme: scheme,
  })
  if (scheme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const page = await ctx.newPage()
  try {
    await page.goto(`/${locale}${s.path}`)
    await expect(
      page.locator(`[data-testid="${s.ready}"], main`).first(),
      `${s.name} rendered`,
    ).toBeVisible({ timeout: 25_000 })
    // The shot is worthless as dark evidence if the class never landed.
    if (scheme === 'dark') {
      expect(
        await page.locator('html').evaluate((el) => el.classList.contains('dark')),
        `${s.name}: html.dark actually applied`,
      ).toBe(true)
    }
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `screenshots/ds2-${s.name}-${locale}-${scheme}-${width}.png`,
      fullPage: true,
    })
  } finally {
    await ctx.close()
  }
}

for (const s of SURFACES) {
  for (const locale of ['en', 'ar'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const width of [390, 1280] as const) {
        const tag = s.changed ? 'CHANGED' : 'control'
        test(`DS2 shot · ${s.name} (${tag}) · ${locale}/${scheme}/${width}`, async ({ browser }) => {
          test.setTimeout(90_000)
          await shoot(browser, s, locale, scheme, width)
        })
      }
    }
  }
}
