import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/** Click today's schedule rows until one reveals a cached roster. In the FULL
 *  suite the e2e gym accumulates several Muay-Thai-named classes (two "Muay Thai
 *  Beginner" + a "Muay Thai Pro"), only some with enrollments — a blind
 *  `.filter('Muay Thai').first()` lands on a roster-less one. This drills whatever
 *  scheduled class actually has a roster (the offline-read assertion is unchanged:
 *  a class roster renders from the Dexie cache). */
async function openRosteredClass(page: Page): Promise<boolean> {
  const rows = vis(page, '[data-testid="desk-schedule-row"]')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click().catch(() => {})
    if (await vis(page, '[data-testid="desk-roster-row"]').first().isVisible({ timeout: 2_500 }).catch(() => false)) return true
  }
  return false
}

/**
 * OFF-2 — offline front-desk READS from the primed Dexie mirror. The front-desk
 * server pages can't render offline, so /desk is a CLIENT surface that reads the
 * mirror (primed via SyncEngine.pullAll on login/online). Proves: prime online →
 * go offline → the SW serves the cached desk shell + the client finds a seeded
 * member by search and shows basics + today's schedule + a roster FROM CACHE (not
 * a network-error page); the full-file/edit affordance is gated offline; /ar clean.
 * Reuses the G2 `setOffline` harness. Karim's phone (70000001) is locale-agnostic.
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

test.describe('OFF-2 · offline front-desk reads (Dexie mirror)', () => {
  test('prime online → offline → find member + basics + schedule + roster from cache; edit gated', async ({ browser }) => {
    test.setTimeout(240_000) // headroom for the deterministic prime gate (per-test cap; not the global config timeout)
    const { ctx, page } = await ownerPage(browser)
    try {
      // ── ONLINE: open the desk; opening it primes the gym-scoped Dexie mirror ──
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
      await vis(page, '[data-testid="desk-search"]').first().fill('Karim')
      await expect(
        vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first(),
        'the primed mirror finds the seeded member online',
      ).toBeVisible({ timeout: 90_000 })
      await expect(vis(page, '[data-testid="desk-cached-at"]').first(),
        'the mirror is stamped "cached as of …"').toContainText(/Cached as of/i)

      // Reload ONLINE so the SW page-caches /desk, then take control before offline.
      await page.reload()
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => {})

      // ── DETERMINISTIC PRIME GATE (STABILIZE-3) ──
      // The on-mount prime is async + sequential; class_enrollments is a LATE table,
      // so under full-suite latency it can lag setOffline → the offline roster (:66)
      // is empty. (The SW REST cache that USED to poison this is now NetworkOnly, so
      // the prime fetches fresh — but the read-after-prime race remains.) Drive a
      // COMPLETE re-prime via "Sync now" and wait for it to settle (button re-enables
      // when syncing=false — never reload mid-prime, which aborts it), then confirm
      // THIS class's roster is mirrored ONLINE before going offline. Online + offline
      // read the same persistent Dexie mirror (bulkPut, never clears), so once the
      // online roster lands the offline read is guaranteed.
      const syncBtn = vis(page, '[data-testid="desk-sync-now"]').first()
      await untilConsistent(async () => {
        await expect(syncBtn, 'sync-now ready (online, idle)').toBeEnabled({ timeout: 10_000 })
        await syncBtn.click()
        await expect(syncBtn, 'prime running').toBeDisabled({ timeout: 4_000 }).catch(() => {})
        await expect(syncBtn, 'prime settled (a full pullAll completed)').toBeEnabled({ timeout: 45_000 })
        await vis(page, '[data-testid="desk-search"]').first().fill('Karim')
        await expect(
          vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first(),
          'member mirrored',
        ).toBeVisible({ timeout: 6_000 })
        expect(await openRosteredClass(page), 'a today-class roster (class_enrollments) is mirrored online').toBe(true)
      }, { timeout: 180_000, intervals: [1_000, 2_000, 3_000] })

      // ── OFFLINE: the SW serves the cached desk shell (not a net-error page) ──
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first(),
          'desk renders offline from the SW-cached shell').toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })

      // ── Member find → basics, FROM THE DEXIE CACHE ──
      await vis(page, '[data-testid="desk-search"]').first().fill('Karim')
      await vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first().click()
      const basics = vis(page, '[data-testid="desk-member-basics"]').first()
      await expect(basics, 'member basics offline').toBeVisible({ timeout: 15_000 })
      await expect(basics.getByTestId('desk-basic-name')).toContainText('Karim')
      await expect(basics.getByTestId('desk-basic-membership'), 'membership status from cache').toBeVisible()
      await expect(basics.getByTestId('desk-basic-pt'), 'PT remaining from cache').toBeVisible()
      await expect(basics.getByTestId('desk-basic-belt'), 'belt from cache').toBeVisible()

      // ── No write leakage: full-file/edit affordance is gated offline ──
      await expect(basics.getByTestId('needs-connection'), 'edit/full-file needs a connection offline').toBeVisible()
      await expect(page.locator('[data-testid="desk-open-file"]'), 'no live file link offline').toHaveCount(0)

      // ── Today's schedule → roster, FROM THE DEXIE CACHE (drill a class that has
      //    a roster — the full-suite gym carries several Muay-Thai classes, only
      //    some enrolled, so don't blind-.first() onto a roster-less one). ──
      await expect(vis(page, '[data-testid="desk-schedule-row"]').first(), "today's schedule from cache").toBeVisible({ timeout: 15_000 })
      expect(await openRosteredClass(page), 'a class roster renders from the cache offline').toBe(true)

      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })

  test('/ar offline desk renders + reads localized (no missing keys)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      await page.goto('/ar/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
      // Search by phone fragment (locale-agnostic — the Arabic name differs).
      await vis(page, '[data-testid="desk-search"]').first().fill('70000001')
      await expect(vis(page, '[data-testid="desk-member-result"]').first(),
        'the primed mirror finds the member on /ar').toBeVisible({ timeout: 90_000 })

      await ctx.setOffline(true)
      await vis(page, '[data-testid="desk-member-result"]').first().click()
      await expect(vis(page, '[data-testid="desk-member-basics"]').first(), 'basics render offline on /ar').toBeVisible({ timeout: 15_000 })
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
      expect(await page.locator('text=desk.').count(), 'no unresolved desk.* key').toBe(0)
      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })
})
