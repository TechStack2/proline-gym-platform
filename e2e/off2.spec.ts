import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

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
    test.setTimeout(240_000) // headroom for the re-prime gate (per-test cap; not the global config timeout)
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
      // The offline read path needs the member + today's schedule + THIS class's
      // roster all mirrored. The roster (class_enrollments for the Muay Thai class)
      // is the table that lags/stalls the prime under the shared project's latency —
      // the :94 flake. The desk's on-mount prime runs ONCE; if it stalls on that
      // (late) table there is no re-attempt while staying online, so a plain poll
      // can't recover. RE-PRIME each iteration (reload → fresh on-mount pullAll) and
      // drill the ACTUAL roster — a generic "enrollments count > 0" is too loose
      // (another class's enrollments satisfy it). Online and offline read the same
      // persistent Dexie mirror (the prime bulkPuts, never clears), so once the
      // online roster lands the offline read is guaranteed.
      await untilConsistent(async () => {
        await page.reload()
        await page.waitForLoadState('networkidle').catch(() => {})
        await expect(vis(page, '[data-testid="offline-desk"]').first(), 'desk re-mounted').toBeVisible({ timeout: 10_000 })
        await vis(page, '[data-testid="desk-search"]').first().fill('Karim')
        await expect(
          vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first(),
          'member mirrored',
        ).toBeVisible({ timeout: 8_000 })
        const sched = vis(page, '[data-testid="desk-schedule-row"]').filter({ hasText: 'Muay Thai' }).first()
        await expect(sched, 'today\'s schedule mirrored').toBeVisible({ timeout: 8_000 })
        await sched.click()
        await expect(
          vis(page, '[data-testid="desk-roster-row"]').first(),
          'this class\'s roster (class_enrollments) mirrored',
        ).toBeVisible({ timeout: 8_000 })
      }, { timeout: 150_000, intervals: [2_000, 4_000, 6_000, 8_000] })

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

      // ── Today's schedule → roster, FROM THE DEXIE CACHE ──
      const schedRow = vis(page, '[data-testid="desk-schedule-row"]').filter({ hasText: 'Muay Thai' }).first()
      await expect(schedRow, "today's seeded class from cache").toBeVisible({ timeout: 15_000 })
      await schedRow.click()
      await expect(vis(page, '[data-testid="desk-roster-row"]').first(), 'roster from cache').toBeVisible({ timeout: 15_000 })

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
