import { test, expect, type Browser, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { ROLES } from './roles'
import { vis, untilConsistent, runId } from './helpers'

/**
 * OFF-3b — offline lead capture: the front desk captures a walk-in lead OFFLINE,
 * queued in the unified outbox (3rd path), pushed idempotently through addLead on
 * reconnect = EXACTLY ONE canonical lead. Conflicts reuse OFF-4's resolution loop
 * (re-submit / discard-with-audit). Reuses the G2/OFF-3 setOffline harness; every
 * wait is BOUNDED. Each test uses a unique lead name so it never collides with the
 * seed or other specs.
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

/** White-box: queue a lead intent straight into the Dexie outbox (the desk DB is
 *  open at v4 once /desk has mounted). disciplineId set to a bogus-but-valid UUID
 *  forces an FK rejection on flush (the conflict path). */
const injectLead = (page: Page, opId: string, first: string, disciplineId: string | null) =>
  page.evaluate(({ opId, first, disciplineId }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('proline_offline_db')
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('pending_leads', 'readwrite')
      tx.objectStore('pending_leads').put({
        op_id: opId, first_name: first, last_name: 'Walkin', phone: '70999050', email: null,
        source: 'walk_in', source_detail: null, discipline_id: disciplineId, notes: null,
        client_ts: new Date().toISOString(), status: 'pending',
      })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
    open.onerror = () => reject(open.error)
  }), { opId, first, disciplineId })

const leadCards = (page: Page, fullName: string) =>
  page.locator(`[data-testid="lead-card"][data-lead-name="${fullName}"]:visible`)

async function flushFromDesk(page: Page) {
  await page.goto('/en/desk')
  await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible({ timeout: 15_000 })
  await vis(page, '[data-testid="desk-sync-pending"]').first().click()
}

test.describe('OFF-3b · offline lead capture (3rd outbox path)', () => {
  test('capture a lead offline → pending → reconnect → exactly one canonical lead', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    const first = `OFF3B-${runId()}-${Math.random().toString(16).slice(2, 6)}`
    const full = `${first} Walkin`
    try {
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })

      // OFFLINE (in place) — the desk is already loaded; capturing a lead is a client
      // action that needs no page reload (the SW-served offline reload is covered by
      // off2/off4 cold-open). Wait for the offline state to settle before the write.
      await ctx.setOffline(true)
      await page.waitForFunction(() => !navigator.onLine, null, { timeout: 10_000 })
      await vis(page, '[data-testid="desk-capture-lead"]').first().click()
      await vis(page, '[data-testid="lead-first-name"]').first().fill(first)
      await vis(page, '[data-testid="lead-last-name"]').first().fill('Walkin')
      await vis(page, '[data-testid="lead-phone"]').first().fill('70999050')
      await vis(page, '[data-testid="lead-submit"]').first().click()
      await expect(vis(page, '[data-testid="lead-saved-offline"]').first(), 'saved offline · will sync').toBeVisible({ timeout: 10_000 })
      await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible()
      await expect(vis(page, '[data-testid="desk-pending-count"]').first()).toContainText('1')

      // RECONNECT → flush. STABILIZE-3: the in-place 'online' DOM event is sometimes
      // missed under CI, leaving the desk's React `online` state false → the Sync-now
      // button stays disabled + flushPendingNow no-ops → the pending bar never clears
      // (:77 flake). Wait for the browser to register online, then RELOAD /desk fresh
      // so `online` reads true (the reliable pattern the sibling tests use via
      // flushFromDesk), then poll-until the queue drains.
      await ctx.setOffline(false)
      await page.waitForFunction(() => navigator.onLine, null, { timeout: 15_000 })
      await page.goto('/en/desk')
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if ((await btn.count()) && (await btn.isEnabled().catch(() => false))) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 5_000 })
      }, { timeout: 90_000 })

      // EXACTLY ONE canonical lead on the server.
      await untilConsistent(async () => {
        await page.goto('/en/leads')
        await expect(leadCards(page, full), 'exactly one canonical lead').toHaveCount(1, { timeout: 5_000 })
      }, { timeout: 40_000 })
    } finally {
      await ctx.close()
    }
  })

  test('a re-push of the same op_id does NOT double-record (idempotency key)', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await ownerPage(browser)
    const first = `OFF3BIDEM-${runId()}-${Math.random().toString(16).slice(2, 6)}`
    const full = `${first} Walkin`
    const opId = randomUUID()
    try {
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })

      // First push.
      await injectLead(page, opId, first, null)
      await flushFromDesk(page)
      await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 30_000 })
      await untilConsistent(async () => {
        await page.goto('/en/leads')
        await expect(leadCards(page, full)).toHaveCount(1, { timeout: 5_000 })
      }, { timeout: 40_000 })

      // Re-push the SAME op_id → addLead de-dups → still exactly one.
      await injectLead(page, opId, first, null)
      await flushFromDesk(page)
      await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 30_000 })
      await page.goto('/en/leads')
      await expect(leadCards(page, full), 're-push of the same op_id did not duplicate').toHaveCount(1, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('a lead the writer rejects is surfaced as a conflict → resolve by discard (audited)', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await ownerPage(browser)
    const first = `OFF3BCONF-${runId()}-${Math.random().toString(16).slice(2, 6)}`
    const full = `${first} Walkin`
    const opId = randomUUID()
    try {
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })

      // Bogus (valid-format, non-existent) discipline → FK rejection on flush → conflict.
      await injectLead(page, opId, first, '00000000-0000-4000-8000-0000000000ff')
      await flushFromDesk(page)
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-lead-conflict-row"]').first(), 'rejected lead surfaced').toBeVisible({ timeout: 5_000 })
      }, { timeout: 60_000 })

      // RESOLVE by discard-with-reason (audited; the lead was never created).
      const row = vis(page, '[data-testid="desk-lead-conflict-row"]').first()
      await row.getByTestId('desk-lead-conflict-resolve').click()
      await row.getByTestId('desk-lead-discard-reason').fill('bad interest — re-capture manually')
      await row.getByTestId('desk-lead-discard-btn').click()
      await untilConsistent(async () => {
        await expect(vis(page, '[data-testid="desk-lead-conflict-row"]'), 'conflict cleared after discard').toHaveCount(0, { timeout: 5_000 })
      }, { timeout: 30_000 })

      // The rejected lead was NOT created (no silent write).
      await page.goto('/en/leads')
      await expect(leadCards(page, full), 'discarded lead never created').toHaveCount(0, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('/ar lead-capture UI renders localized (no missing keys)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    const first = `OFF3BAR-${runId()}-${Math.random().toString(16).slice(2, 6)}`
    try {
      await page.goto('/ar/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
      await ctx.setOffline(true)
      await page.waitForFunction(() => !navigator.onLine, null, { timeout: 10_000 })
      await vis(page, '[data-testid="desk-capture-lead"]').first().click()
      await vis(page, '[data-testid="lead-first-name"]').first().fill(first)
      await vis(page, '[data-testid="lead-last-name"]').first().fill('Walkin')
      await vis(page, '[data-testid="lead-phone"]').first().fill('70999051')
      await vis(page, '[data-testid="lead-submit"]').first().click()
      await expect(vis(page, '[data-testid="lead-saved-offline"]').first(), 'localized "saved offline" on /ar').toBeVisible({ timeout: 10_000 })
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
      expect(await page.locator('text=desk.').count(), 'no unresolved desk.* key').toBe(0)
      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })
})
