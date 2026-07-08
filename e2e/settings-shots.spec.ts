import { test, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * SETTINGS-SHOTS (J5b SETTINGS-IA) — visual evidence, not a functional assertion.
 * Signs in as owner and captures a full-page screenshot of EACH settings tab (en) plus
 * Gym Profile in ar (an RTL sample) into screenshots/ — the `e2e-screenshots` CI
 * artifact the auditor reviews BEFORE decree. Every capture is best-effort (.catch): a
 * worker gym missing a given surface (e.g. no-membership → plans falls back) still
 * yields a shot of whatever renders rather than failing the evidence run.
 *
 * The six tab ids match settings-client.tsx (gym/rates/plans/disciplines/ptpackages +
 * the new comms). Deep-linking `?tab=<id>` opens each directly.
 */
const TABS = ['gym', 'rates', 'plans', 'disciplines', 'ptpackages', 'comms'] as const

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // The tab bar (all tabs render in it) is the load anchor; then a short settle lets
  // the active tab's client-mounted content paint before the full-page capture.
  await page.locator('[data-testid="settings-tab-gym"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {})
}

test('SETTINGS-SHOTS · every settings tab (en) + Gym Profile (ar, RTL)', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000)

  // ── all six tabs, English ──
  const en = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const enPage = await en.newPage()
  try {
    for (const tab of TABS) {
      await enPage.goto(`/en/settings?tab=${tab}`)
      await shot(enPage, `settings-${tab}-en`)
    }
  } finally {
    await en.close()
  }

  // ── RTL sample: Gym Profile in Arabic ──
  const ar = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar' })
  const arPage = await ar.newPage()
  try {
    await arPage.goto('/ar/settings?tab=gym')
    await shot(arPage, 'settings-gym-ar')
  } finally {
    await ar.close()
  }
})
