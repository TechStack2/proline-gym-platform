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
 *
 * OFF-5 (STAFF-OFFLINE) extends this file: the offline desk gets EYES — an offline
 * lookup by normalized phone surfaces membership STATE + balance owed + active class
 * registrations + PT; today's schedule shows coach + capacity vs enrolled; and the
 * login-prime footprint delta (adds only `coaches`) is measured off the real mirror.
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
    // FLAKE-HEAL-2R: a blocked open fires NEITHER onsuccess nor onerror. This reader
    // already degrades to the -1 sentinel on error; blocked must degrade the same way
    // rather than hang the evaluate forever.
    open.onblocked = () => resolve({ students: -1, enrollments: -1 })
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

/** OFF-5: issue a throwaway membership invoice for Karim (on /en — the member
 *  dropdown is localized) so the offline balance-owed read has something to net. */
async function issueForKarim(page: Page, amountUsd: number) {
  await page.goto('/en/invoices/new')
  const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
  expect(karim, 'Karim in the member dropdown').toBeTruthy()
  await vis(page, '[data-testid="inv-student"]').selectOption(karim!)
  await vis(page, '[data-testid="inv-type"]').selectOption('membership')
  await vis(page, '[data-testid="inv-amount-usd"]').fill(String(amountUsd))
  await vis(page, '[data-testid="issue-submit"]').click()
  await expect(vis(page, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 })
}

type Footprint = {
  per: Record<string, { rows: number; bytes: number }>
  off4: { rows: number; bytes: number }; off5: { rows: number; bytes: number }
  delta: { rows: number; bytes: number }
}

/** OFF-5 req-4: measure the REAL primed mirror payload (rows + serialized bytes) per
 *  CORE table, straight off Dexie, comparing the OFF-4 table set to the OFF-5 set
 *  (which adds `coaches`). The delta is exactly the coaches table — the login prime
 *  must stay unnoticeable. */
async function deskFootprint(page: Page): Promise<Footprint> {
  const OFF4 = ['profiles', 'students', 'classes', 'class_schedules', 'class_enrollments', 'student_memberships', 'pt_assignments', 'invoices', 'payments']
  const OFF5 = [...OFF4, 'coaches']
  return page.evaluate((sets) => new Promise<Footprint>((resolve) => {
    const open = indexedDB.open('proline_offline_db')
    // FLAKE-HEAL-2R: as above — blocked degrades to the empty footprint, never a hang.
    open.onblocked = () => resolve({ per: {}, off4: { rows: 0, bytes: 0 }, off5: { rows: 0, bytes: 0 }, delta: { rows: 0, bytes: 0 } })
    open.onsuccess = () => {
      const db = open.result
      const all = Array.from(new Set([...sets.off4, ...sets.off5]))
      const per: Record<string, { rows: number; bytes: number }> = {}
      let done = 0
      const finish = () => {
        if (++done < all.length) return
        const sum = (list: string[]) => list.reduce((a, t) => ({ rows: a.rows + (per[t]?.rows || 0), bytes: a.bytes + (per[t]?.bytes || 0) }), { rows: 0, bytes: 0 })
        const off4 = sum(sets.off4), off5 = sum(sets.off5)
        db.close()
        resolve({ per, off4, off5, delta: { rows: off5.rows - off4.rows, bytes: off5.bytes - off4.bytes } })
      }
      for (const t of all) {
        try {
          const req = db.transaction(t, 'readonly').objectStore(t).getAll()
          req.onsuccess = () => { const rows = req.result || []; per[t] = { rows: rows.length, bytes: JSON.stringify(rows).length }; finish() }
          req.onerror = () => { per[t] = { rows: -1, bytes: 0 }; finish() }
        } catch { per[t] = { rows: -1, bytes: 0 }; finish() }
      }
    }
    open.onerror = () => resolve({ per: {}, off4: { rows: -1, bytes: 0 }, off5: { rows: -1, bytes: 0 }, delta: { rows: 0, bytes: 0 } })
  }), { off4: OFF4, off5: OFF5 })
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

  test('OFF-PERF (finding 9) · offline recovery reaches the WARMED desk even when the served locale differs — a discarded-PWA relaunch does NOT dead-end on "offline"', async ({ browser }) => {
    test.setTimeout(180_000)
    // Field finding 9: an Arabic-first owner, offline, whose installed PWA the OS
    // discarded and relaunched at manifest start_url "/" (no locale). The offline door
    // derives locale 'en' from the requested path and, pre-fix, probed ONLY /en/desk —
    // MISSING the warmed /ar/desk → stranded on "You're offline". This proves the door
    // now forwards to the warmed desk regardless of the served locale.
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      await takeControl(page, '/ar/today')
      await waitDeskShellWarmed(page, '/ar/desk')

      await ctx.setOffline(true)

      // The mismatch is real: the owner-locale desk is warmed; the en desk is NOT — so
      // the pre-fix, path-locale-only probe under an 'en' path would have missed.
      const cached = await page.evaluate(async () => ({
        ar: !!(await caches.match('/ar/desk', { ignoreSearch: true })),
        en: !!(await caches.match('/en/desk', { ignoreSearch: true })),
      }))
      expect(cached.ar, 'the owner-locale desk is warmed').toBe(true)
      expect(cached.en, 'the other-locale desk is NOT warmed (the pre-fix probe would miss)').toBe(false)

      // Navigate to an uncached route under a DIFFERENT locale — the faithful stand-in
      // for the start_url "/" relaunch whose offline-door locale ≠ the warmed desk.
      const t0 = Date.now()
      await untilConsistent(async () => {
        await page.goto('/en/__offline_probe__')
        await expect(page, 'recovered to the warmed desk instead of dead-ending on the offline page')
          .toHaveURL(/\/ar\/desk(\/|$|\?)/, { timeout: 10_000 })
      }, { timeout: 60_000 })
      await expect(vis(page, '[data-testid="offline-desk"]').first(),
        'the warmed front desk hydrated offline').toBeVisible({ timeout: 20_000 })
      // Timing evidence (R3): recovery latency to the working desk.
      console.log('[OFF-PERF] offline cross-locale recovery to warmed desk: ' + (Date.now() - t0) + 'ms')
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
        const basics = vis(cold, '[data-testid="desk-member-basics"]').first()
        await expect(basics).toBeVisible({ timeout: 15_000 })
        // OFF-5: the offline lookup shows the staff-floor essentials from the mirror —
        // membership STATE, balance owed, active class registrations, PT.
        await expect(basics.getByTestId('desk-basic-membership'), 'membership state from mirror').toBeVisible()
        await expect(basics.getByTestId('desk-basic-balance'), 'balance owed from the reconcile lib over the mirror').toBeVisible()
        await expect(basics.getByTestId('desk-basic-classes'), 'active class registrations from the mirror').toBeVisible()
        await expect(basics.getByTestId('desk-basic-pt'), 'PT remaining from the mirror').toBeVisible()
        // OFF-5: today's schedule carries coach + capacity vs enrolled, from the mirror.
        const row = vis(cold, '[data-testid="desk-schedule-row"]').first()
        await expect(row, "today's schedule renders offline").toBeVisible({ timeout: 15_000 })
        await expect(row.getByTestId('desk-schedule-capacity'), 'capacity vs enrolled from the mirror').toBeVisible()
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

  // ── OFF-5 STAFF-OFFLINE: the offline desk gets eyes ──
  test('OFF-5 · offline lookup by phone → status + balance + classes; schedule shows coach + capacity; prime footprint measured', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      // Give Karim an open balance to net offline.
      await issueForKarim(page, 40)

      // Prime the mirror deterministically via the desk's own "Sync now" (a full
      // pullAll), and confirm Karim (found BY NORMALIZED PHONE) + his invoice mirrored
      // ONLINE before going offline.
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 45_000 }).catch(() => {})
      const syncBtn = vis(page, '[data-testid="desk-sync-now"]').first()
      await untilConsistent(async () => {
        await expect(syncBtn, 'sync-now ready').toBeEnabled({ timeout: 10_000 })
        await syncBtn.click()
        await expect(syncBtn, 'prime running').toBeDisabled({ timeout: 4_000 }).catch(() => {})
        await expect(syncBtn, 'prime settled').toBeEnabled({ timeout: 20_000 })
        // phone search (normalized) finds Karim from the mirror
        await vis(page, '[data-testid="desk-search"]').first().fill('70000001')
        await expect(vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first(),
          'normalized-phone search finds Karim from the mirror').toBeVisible({ timeout: 5_000 })
      }, { timeout: 90_000 })

      // REQ-4 FOOTPRINT: measure the real primed payload (rows + bytes) per table.
      const fp = await deskFootprint(page)
      console.log('[OFF-5 FOOTPRINT] ' + JSON.stringify({ off4: fp.off4, off5: fp.off5, delta: fp.delta, coaches: fp.per.coaches, per: fp.per }))
      expect(fp.per.coaches?.rows ?? -1, 'coaches mirrored by the login prime').toBeGreaterThan(0)
      expect(fp.delta.rows, 'the OFF-5 prime delta is EXACTLY the coaches table').toBe(fp.per.coaches.rows)
      expect(fp.off5.bytes, 'the full primed mirror stays bounded (< 2 MB on a seeded gym)').toBeLessThan(2_000_000)

      // Page-cache the desk under control, then go OFFLINE and commit it.
      await page.reload()
      await page.waitForLoadState('networkidle').catch(() => {})
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      await untilConsistent(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('offline')))
        await expect(vis(page, '[data-testid="desk-sync-now"]').first(), 'offline committed').toBeDisabled({ timeout: 2_000 })
      }, { timeout: 30_000, intervals: [500, 1_000, 2_000] })

      // OFFLINE LOOKUP by normalized phone → the staff-floor essentials from the mirror.
      await vis(page, '[data-testid="desk-search"]').first().fill('70000001')
      await vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first().click()
      const basics = vis(page, '[data-testid="desk-member-basics"]').first()
      await expect(basics).toBeVisible({ timeout: 15_000 })
      await expect(basics.getByTestId('desk-basic-membership'), 'membership STATE offline').toBeVisible()
      const balance = basics.getByTestId('desk-basic-balance')
      await expect(balance, 'balance owed offline (reconcile over mirror)').toBeVisible()
      await expect(balance, 'shows a $ balance owed (the invoice we just issued)').toContainText(/\$\d/)
      await expect(basics.getByTestId('desk-balance-hint'), 'honest "verify online for billing" hint').toBeVisible()
      await expect(basics.getByTestId('desk-basic-classes'), 'active class registrations offline').toBeVisible()
      await expect(basics.getByTestId('desk-basic-pt'), 'PT remaining offline').toBeVisible()
      // Screenshots land in screenshots/ — the e2e.yml "Upload screenshots" step (if:always)
      // uploads that dir as the `e2e-screenshots` artifact for the visual review.
      await page.screenshot({ path: 'screenshots/off5-lookup.png', fullPage: true })

      // Today's schedule: coach + capacity vs enrolled from the mirror.
      const row = vis(page, '[data-testid="desk-schedule-row"]').first()
      await expect(row, "today's schedule offline").toBeVisible({ timeout: 15_000 })
      await expect(row.getByTestId('desk-schedule-capacity'), 'capacity vs enrolled offline').toBeVisible()
      await row.click()
      await page.screenshot({ path: 'screenshots/off5-schedule.png', fullPage: true })
    } finally {
      await ctx.setOffline(false)
      await ctx.close()
    }
  })
})
