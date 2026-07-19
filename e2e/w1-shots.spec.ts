import { test, expect, type Browser } from '@playwright/test'
import { ROLES, type Role } from './roles'

/**
 * W1-FOUNDATION — the §6.3 evidence matrix for the DELIBERATELY changed staff
 * chrome (the ruled TabBar and the PageHeader), plus the fmt-adopted surfaces:
 *   {en, ar} × {light, dark} × {390, 1280}.
 *
 * §6.2 byte-identity is proved separately, by re-shooting the same surfaces on
 * the merge-base — these shots are the "after" half.
 */
const VIEWPORTS = { 390: { width: 390, height: 844 }, 1280: { width: 1280, height: 900 } } as const

type Surface = { role: Role; path: string; ready: string; name: string }
const SURFACES: Surface[] = [
  { role: 'owner', path: '/today', ready: 'shell-content', name: 'staff-today' },
  { role: 'owner', path: '/students', ready: 'shell-content', name: 'staff-members' },
  { role: 'owner', path: '/money', ready: 'money-tabs', name: 'staff-money' },
  { role: 'owner', path: '/inbox', ready: 'inbox-actionable-count', name: 'staff-inbox' },
  { role: 'owner', path: '/students/guardians', ready: 'guardians-view', name: 'staff-guardians' },
]

async function shoot(
  browser: Browser,
  s: Surface,
  locale: 'en' | 'ar',
  scheme: 'light' | 'dark',
  width: keyof typeof VIEWPORTS,
) {
  const ctx = await browser.newContext({
    storageState: ROLES[s.role].storage,
    locale,
    viewport: VIEWPORTS[width],
    colorScheme: scheme,
  })
  const page = await ctx.newPage()
  try {
    await page.goto(`/${locale}${s.path}`)
    await expect(
      page.locator(`[data-testid="${s.ready}"]`).first(),
      `${s.name} rendered`,
    ).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(400)
    await page.screenshot({
      path: `screenshots/w1-${s.name}-${locale}-${scheme}-${width}.png`,
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
        test(`W1 shot · ${s.name} · ${locale}/${scheme}/${width}`, async ({ browser }) => {
          test.setTimeout(60_000)
          await shoot(browser, s, locale, scheme, width)
        })
      }
    }
  }
}
