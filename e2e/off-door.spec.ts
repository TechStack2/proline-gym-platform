import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'
import { vis, untilConsistent } from './helpers'

/**
 * OFF-4 (OFFLINE-DOOR) — make the shipped offline layer REACHABLE, PRIMED and
 * HONEST. Extends the off2/off3 family. Proves the three things that were dead
 * before this slice:
 *
 *   1. FRONT DOOR — an offline navigation to an UNcached route serves the branded
 *      /offline.html fallback (next-pwa fallbacks.document), which states the offline
 *      scope and deep-links to /desk (not the browser's native error page).
 *   2. AUTO-FORWARD — when the /desk shell is warmed (cached), the offline door
 *      forwards straight to the working front desk.
 *   3. COLD LAUNCH — a front-desk user who logs in and NEVER opens /desk can still
 *      cold-launch /desk offline (in a fresh page) and get a working, PRIMED roster,
 *      because the (dashboard) layer warms the desk shell + primes the Dexie mirror
 *      after login while online.
 *
 * SW e2e per the established rules — real controller waits, no page.route hacks; the
 * offline door + warm are proven via the actual caches. Reuses the G2 setOffline
 * harness; isolated owner contexts. Every wait is BOUNDED.
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

/** Register + take SW control, then reload so the now-controlling SW handles (and
 *  caches) the navigation — the same prime the off1/off2 specs use. */
async function takeControl(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 45_000 })
  await page.reload()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => {})
}

/** Wait until the login-level warm (warmDeskShell) has fully populated the SW caches
 *  for a cold offline launch: the /desk DOCUMENT is cached, every /_next asset it
 *  references is cached, AND the desk's route-specific PAGE CHUNK is cached (warmed
 *  by router.prefetch or a script tag). No prod test-hook — verified straight off the
 *  real caches. */
async function waitDeskShellWarmed(page: Page, deskUrl: string, timeout = 90_000) {
  await page.waitForFunction(async (u) => {
    if (!('caches' in window)) return false
    const doc = await caches.match(u, { ignoreSearch: true })
    if (!doc) return false
    const html = await doc.text()
    const urls = [...html.matchAll(/(?:src|href)="(\/_next\/[^"?]+\.(?:js|css))"/g)].map((m) => m[1])
    if (urls.length === 0) return false
    for (const cu of urls) if (!(await caches.match(cu, { ignoreSearch: true }))) return false
    // The desk-specific page chunk must be cached too (it is what hydrates the
    // client desk offline). Scan every cache key; match the decoded route path.
    let hasPageChunk = false
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) {
        if (/\/_next\/static\/chunks\/app\/.*desk\/page-.*\.js$/.test(decodeURIComponent(req.url))) { hasPageChunk = true; break }
      }
      if (hasPageChunk) break
    }
    return hasPageChunk
  }, deskUrl, { timeout })
}

/** White-box: the front-desk core is mirrored into Dexie (proves the login-level
 *  prime ran, WITHOUT ever opening /desk). */
async function mirrorCounts(page: Page): Promise<{ students: number; enrollments: number }> {
  return page.evaluate(() => new Promise<{ students: number; enrollments: number }>((resolve) => {
    const open = indexedDB.open('proline_offline_db')
    open.onsuccess = () => {
      const db = open.result
      const out = { students: -1, enrollments: -1 }
      const stores: [keyof typeof out, string][] = [['students', 'students'], ['enrollments', 'class_enrollments']]
      let done = 0
      const finish = () => { if (++done === stores.length) { db.close(); resolve(out) } }
      for (const [key, name] of stores) {
        try {
          const req = db.transaction(name, 'readonly').objectStore(name).count()
          req.onsuccess = () => { out[key] = req.result; finish() }
          req.onerror = () => finish()
        } catch { finish() }
      }
    }
    open.onerror = () => resolve({ students: -1, enrollments: -1 })
  }))
}

/** Remove the /desk shell from every cache so the offline door does NOT auto-forward
 *  to it (lets us assert the fallback page itself). Run while OFFLINE so the warm
 *  can't re-cache it behind us. */
async function evictDesk(page: Page) {
  await page.evaluate(async () => {
    if (!('caches' in window)) return
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      for (const req of await c.keys()) if (req.url.includes('/desk')) await c.delete(req)
    }
  })
}

/** off2's roster drill — click scheduled classes until one reveals a cached roster. */
async function openRosteredClass(page: Page): Promise<boolean> {
  const rows = vis(page, '[data-testid="desk-schedule-row"]')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click().catch(() => {})
    if (await vis(page, '[data-testid="desk-roster-row"]').first().isVisible({ timeout: 2_500 }).catch(() => false)) return true
  }
  return false
}

test.describe('OFF-4 · offline door (reachable, primed, honest)', () => {
  test('offline navigation to an uncached route serves the branded fallback + deep-links to /desk', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      await takeControl(page, '/en/today')

      // Go offline, then evict the (possibly-warmed) desk shell so the door stays put
      // on the fallback instead of auto-forwarding to a cached desk.
      await ctx.setOffline(true)
      await evictDesk(page)

      // Navigate to a route that was NEVER cached → NetworkFirst fails offline →
      // the SW serves the precached, branded /offline.html (NOT a browser error page).
      await untilConsistent(async () => {
        await page.goto('/en/__offline_probe__')
        await expect(vis(page, '[data-testid="offline-scope"]').first(),
          'the branded offline door renders (not the native error page)').toBeVisible({ timeout: 8_000 })
      }, { timeout: 60_000 })

      // It honestly states the offline scope and deep-links to the front desk.
      await expect(page.locator('[data-testid="offline-scope"]')).toContainText(/attendance/i)
      const deskLink = vis(page, '[data-testid="offline-desk-link"]').first()
      await expect(deskLink).toBeVisible()
      await expect(deskLink).toHaveAttribute('href', '/en/desk')
    } finally {
      await ctx.setOffline(false)
      await ctx.close()
    }
  })

  test('when the desk shell is warmed, the offline door forwards straight to the front desk', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      // Login lands on /today; the (dashboard) layer warms the desk shell WITHOUT
      // ever opening /desk. Wait until it is fully cached.
      await takeControl(page, '/en/today')
      await waitDeskShellWarmed(page, '/en/desk')

      // Offline: navigating to an uncached route hits the fallback, which detects the
      // cached desk and forwards to it → the working front desk renders offline.
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.goto('/en/__offline_probe__')
        await expect(page, 'the door auto-forwarded to the warmed desk').toHaveURL(/\/en\/desk(\/|$|\?)/, { timeout: 8_000 })
      }, { timeout: 60_000 })
      await expect(vis(page, '[data-testid="offline-desk"]').first(),
        'the front desk hydrated from the warmed cache').toBeVisible({ timeout: 20_000 })
    } finally {
      await ctx.setOffline(false)
      await ctx.close()
    }
  })

  test('cold offline launch of /desk (never visited) → hydrated shell + primed roster', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      // Login → /today. NEVER open /desk. The layer both warms the desk shell and
      // primes the Dexie mirror after login while online.
      await takeControl(page, '/en/today')
      await waitDeskShellWarmed(page, '/en/desk')
      await untilConsistent(async () => {
        const c = await mirrorCounts(page)
        expect(c.students, 'students mirrored by the login-level prime').toBeGreaterThan(0)
        expect(c.enrollments, 'enrollments mirrored (roster source)').toBeGreaterThan(0)
      }, { timeout: 120_000 })

      // COLD LAUNCH: a brand-new page opened OFFLINE, navigating straight to /desk.
      // Nothing on this page ever fetched the desk — the SW serves the warmed shell.
      await ctx.setOffline(true)
      const cold = await ctx.newPage()
      try {
        await cold.goto('/en/desk')
        await expect(vis(cold, '[data-testid="offline-desk"]').first(),
          'the desk cold-launches offline from the warmed shell').toBeVisible({ timeout: 25_000 })

        // The roster is PRIMED: find the seeded member + drill a class roster from cache.
        await vis(cold, '[data-testid="desk-search"]').first().fill('Karim')
        await expect(vis(cold, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first(),
          'the primed mirror finds the member offline').toBeVisible({ timeout: 20_000 })
        await vis(cold, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first().click()
        await expect(vis(cold, '[data-testid="desk-member-basics"]').first()).toBeVisible({ timeout: 15_000 })
        expect(await openRosteredClass(cold), 'a class roster renders from the primed cache offline').toBe(true)
      } finally {
        await cold.close()
      }
    } finally {
      await ctx.setOffline(false)
      await ctx.close()
    }
  })

  test('/ar offline door renders localized (RTL, no raw strings)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      await takeControl(page, '/ar/today')
      await ctx.setOffline(true)
      await evictDesk(page)
      await untilConsistent(async () => {
        await page.goto('/ar/__offline_probe__')
        await expect(vis(page, '[data-testid="offline-scope"]').first(),
          'the /ar offline door renders').toBeVisible({ timeout: 8_000 })
      }, { timeout: 60_000 })

      // Localized (Arabic) + RTL + deep-link to the /ar desk.
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      const deskLink = vis(page, '[data-testid="offline-desk-link"]').first()
      await expect(deskLink).toHaveAttribute('href', '/ar/desk')
      await expect(deskLink, 'the CTA is Arabic, not a raw key').toContainText('الاستقبال')
    } finally {
      await ctx.setOffline(false)
      await ctx.close()
    }
  })
})
