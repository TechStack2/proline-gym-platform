import { test, expect, type Browser, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { ROLES } from './roles'
import { vis, untilConsistent, untilSettled, runId } from './helpers'

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
 *  forces an FK rejection on flush (the conflict path).
 *
 *  RETRY-ON-NAVIGATION: the desk/leads route can fire a late Next client-navigation
 *  that tears down the evaluate context mid-write ("Execution context was destroyed"
 *  — the rotating off3b flake, seen at both :97 and :142). `op_id` is the store's
 *  PRIMARY KEY (`pending_leads: 'op_id, …'`), so `put` is idempotent; a torn-down
 *  attempt aborts its IndexedDB tx without committing, and a settled attempt writes
 *  exactly one row — so retrying the whole evaluate until it survives is safe and
 *  never double-records (the idempotency/conflict proofs are unchanged). */
async function injectLead(page: Page, opId: string, first: string, disciplineId: string | null) {
  // FLAKE-HEAL-2R: `untilSettled`, not `toPass`. The retry below existed already and
  // still could not fire, because the attempt it was retrying never SETTLED: an
  // `indexedDB.open()` whose `onblocked` fires (another connection holds the DB at an
  // older version) calls neither `onsuccess` nor `onerror`, so one attempt ate the
  // whole 20s budget. Both unhandled settle paths are now wired — `open.onblocked`
  // and `tx.onabort`, the latter being how a transaction dies on a version change or
  // quota abort (`onerror` does NOT fire for an abort) — and the per-attempt bound
  // catches whatever a browser does that nobody enumerated.
  //
  // OBSERVED (union 29850018502, this same helper): the bound fires repeatedly —
  // "attempt did not settle within 5000ms" four times over — which means the hang is
  // NOT the `onblocked` path hypothesised above (that now rejects instantly). No IDB
  // callback fires at all, which is what a plain versionless `indexedDB.open()` does
  // while another connection sits mid-upgrade: the request simply queues, and
  // `onblocked` is never one of its outcomes. That wedge lives in the PAGE, so
  // re-running the same evaluate against the same document can never clear it — only
  // tearing the document down can. Attempts after the first therefore RE-ANCHOR on a
  // freshly loaded /desk. The first attempt does not (its caller already anchored), so
  // the happy path is unchanged and the total budget stays 20s; only the per-attempt
  // bound grows to cover a navigation.
  let attempt = 0
  await untilSettled(async () => {
    if (attempt++ > 0) {
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 5_000 })
    }
    await page.evaluate(({ opId, first, disciplineId }) => new Promise<void>((resolve, reject) => {
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
        tx.onabort = () => reject(tx.error ?? new Error('IDB_TX_ABORTED'))
      }
      open.onerror = () => reject(open.error)
      open.onblocked = () => reject(new Error('IDB_OPEN_BLOCKED'))
    }), { opId, first, disciplineId })
  }, { attemptMs: 8_000 })
}

const leadCards = (page: Page, fullName: string) =>
  page.locator(`[data-testid="lead-card"][data-lead-name="${fullName}"]:visible`)

async function flushFromDesk(page: Page) {
  await page.goto('/en/desk')
  await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible({ timeout: 15_000 })
  await vis(page, '[data-testid="desk-sync-pending"]').first().click()
}

/** Queue a lead from a MOUNTED /desk, rather than injecting straight after the
 *  /leads verify (below) where a late navigation is likeliest. Belt-and-suspenders
 *  with injectLead's own retry: anchor to a freshly-loaded /desk (where the Dexie DB
 *  is guaranteed open at v4) so the evaluate runs against the most settled page. */
async function injectLeadOnDesk(page: Page, opId: string, first: string, disciplineId: string | null) {
  await page.goto('/en/desk')
  await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
  await injectLead(page, opId, first, disciplineId)
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
      // First push (injected from a mounted /desk — see injectLeadOnDesk).
      await injectLeadOnDesk(page, opId, first, null)
      await flushFromDesk(page)
      await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 30_000 })
      await untilConsistent(async () => {
        await page.goto('/en/leads')
        await expect(leadCards(page, full)).toHaveCount(1, { timeout: 5_000 })
      }, { timeout: 40_000 })

      // Re-push the SAME op_id → addLead de-dups → still exactly one. Inject again
      // from a mounted /desk (NOT the /leads page just read above — that raced a late
      // navigation and destroyed the evaluate context).
      await injectLeadOnDesk(page, opId, first, null)
      await flushFromDesk(page)
      await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 30_000 })
      // Reload-consistent read (still EXACTLY one — the idempotency proof is intact;
      // toHaveCount(1) fails on 0 or 2): a single-shot /leads read can observe a stale
      // replica snapshot, so re-goto per attempt instead of polling one stale DOM.
      await untilConsistent(async () => {
        await page.goto('/en/leads')
        await expect(leadCards(page, full), 're-push of the same op_id did not duplicate').toHaveCount(1, { timeout: 5_000 })
      }, { timeout: 40_000 })
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
