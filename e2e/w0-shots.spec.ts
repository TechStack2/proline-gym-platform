import { test, expect, type Browser } from '@playwright/test'
import { ROLES, type Role } from './roles'

/**
 * W0 QUICK-WINS — visual evidence for the Wave-0 correctness fixes:
 *   staff/today, staff/inbox, staff/manage (setup), portal/home, coach/pt
 *   × {en, ar} × {light, dark} @ 390.
 * Proves the dark-mode title fix (DA-1), the Manage card fit (DA-10), the inbox
 * summary (DA-6), the /setup title = "Manage" not "Today" (DA-35) and the Members
 * mobile title (DA-35). Read-only — logs in via the seeded role storageState.
 */
const MOBILE = { width: 390, height: 844 }

type Surface = { role: Role; path: string; ready: string; name: string }
const SURFACES: Surface[] = [
  { role: 'owner', path: '/today', ready: 'horizon-today', name: 'staff-today' },
  { role: 'owner', path: '/inbox', ready: 'inbox-actionable-count', name: 'staff-inbox' },
  { role: 'owner', path: '/setup', ready: 'setup-hub-progress', name: 'staff-manage' },
  { role: 'student', path: '/portal', ready: 'self-view', name: 'portal-home' },
  { role: 'coach', path: '/coach/pt', ready: 'native-large-title', name: 'coach-pt' },
]

async function shoot(
  browser: Browser,
  s: Surface,
  locale: 'en' | 'ar',
  scheme: 'light' | 'dark',
) {
  const ctx = await browser.newContext({
    storageState: ROLES[s.role].storage,
    locale,
    viewport: MOBILE,
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
      path: `screenshots/w0-${s.name}-${locale}-${scheme}-390.png`,
      fullPage: true,
    })
  } finally {
    await ctx.close()
  }
}

for (const s of SURFACES) {
  for (const locale of ['en', 'ar'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`W0 shot · ${s.name} · ${locale}/${scheme}`, async ({ browser }) => {
        test.setTimeout(60_000)
        await shoot(browser, s, locale, scheme)
      })
    }
  }
}
