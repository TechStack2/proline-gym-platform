import { test, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * SETTINGS-SHOTS (M2-A MANAGE-INDEX) — visual evidence, not a functional assertion.
 * Full-page screenshots of the /settings card INDEX + each opened section (en) plus the
 * index in ar (an RTL sample), into screenshots/ — the `e2e-screenshots` CI artifact the
 * auditor reviews BEFORE decree. Every capture is best-effort (.catch): a worker gym
 * missing a surface still yields a shot of whatever renders rather than failing the run.
 *
 * The section ids match settings-client.tsx: gym / disciplines→Programs / offers /
 * documents / messaging. Bare /settings is the card index (no ?tab).
 */
const VIEWS: Array<{ name: string; path: string }> = [
  { name: 'index', path: '/en/settings' },
  { name: 'gym', path: '/en/settings?tab=gym' },
  { name: 'programs', path: '/en/settings?tab=disciplines' },
  { name: 'offers', path: '/en/settings?tab=offers' },
  { name: 'documents', path: '/en/settings?tab=documents' },
  { name: 'messaging', path: '/en/settings?tab=messaging' },
]

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {})
  // The card index (settings-index) or a section's back button (settings-back) anchors
  // the load; then a short settle lets the client content paint before the capture.
  await page.locator('[data-testid="settings-index"], [data-testid="settings-back"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true }).catch(() => {})
}

test('SETTINGS-SHOTS · Manage index + every section (en) + index (ar, RTL)', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000)

  // ── the card index + every section, English ──
  const en = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const enPage = await en.newPage()
  try {
    for (const v of VIEWS) {
      await enPage.goto(v.path)
      // M2-C GALLERY: the gym section now hosts the "Public page photos" manager
      // (loads its rows async) — let it paint so the shot captures it, not a spinner.
      if (v.name === 'gym') {
        await enPage.getByTestId('landing-photos-manager').first().waitFor({ timeout: 10_000 }).catch(() => {})
      }
      await shot(enPage, `settings-${v.name}-en`)
    }
  } finally {
    await en.close()
  }

  // ── RTL sample: the Manage index in Arabic ──
  const ar = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'ar' })
  const arPage = await ar.newPage()
  try {
    await arPage.goto('/ar/settings')
    await shot(arPage, 'settings-index-ar')
  } finally {
    await ar.close()
  }
})
