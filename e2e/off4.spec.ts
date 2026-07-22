import { test, expect, type Browser, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { ROLES } from './roles'
import { vis, untilConsistent, untilSettled } from './helpers'

/**
 * OFF-4 — reconciliation & conflict resolution: makes the offline writes
 * TRUSTWORTHY. Closes what OFF-3 left open — a server-rejected money record could
 * only be SEEN, not resolved. Proves: (1) a conflict is RESOLVABLE (discard with an
 * audited reason / re-submit corrected under the same op_id), never silently
 * dropped; (2) a write whose premise changed server-side reconciles to a reviewable
 * conflict, not a bad write; (3) the queue + pending-sync bar survive an offline SW
 * cold-open. Reuses the G2/OFF-3 setOffline harness. Every wait is BOUNDED.
 *
 * Each test issues its OWN throwaway invoice for Karim (on /en — the member dropdown
 * is localized) so the shared seed fixtures stay untouched.
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

async function issueForKarim(page: Page, amountUsd: number): Promise<{ number: string; url: string; id: string }> {
  await page.goto('/en/invoices/new')
  const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
  expect(karim, 'Karim in the member dropdown').toBeTruthy()
  await vis(page, '[data-testid="inv-student"]').selectOption(karim!)
  await vis(page, '[data-testid="inv-type"]').selectOption('membership')
  await vis(page, '[data-testid="inv-amount-usd"]').fill(String(amountUsd))
  await vis(page, '[data-testid="issue-submit"]').click()
  await expect(vis(page, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 })
  const number = (await vis(page, '[data-testid="invoice-number"]').textContent())!.trim()
  const url = page.url()
  const id = url.split('/invoices/')[1].split(/[/?#]/)[0]
  return { number, url, id }
}

async function searchOpenKarim(page: Page, search = 'Karim') {
  await vis(page, '[data-testid="desk-search"]').first().fill(search)
  const res = vis(page, '[data-testid="desk-member-result"]').first()
  await expect(res, 'primed mirror finds the member').toBeVisible({ timeout: 90_000 })
  await res.click()
  await expect(vis(page, '[data-testid="desk-member-basics"]').first()).toBeVisible({ timeout: 15_000 })
}

async function openKarimOnDesk(page: Page, locale: string, search = 'Karim') {
  await page.goto(`/${locale}/desk`)
  await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
  await searchOpenKarim(page, search)
}

async function primeSW(page: Page) {
  await page.reload()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => {})
}

/** White-box: queue a payment intent straight into the Dexie outbox (the desk DB is
 *  already open at v3 once /desk has mounted). Lets us force a precise conflict. */
// FLAKE-HEAL-2R: same open, same two unhandled settle paths as off3b's injectLead
// (`onblocked` on the open, `onabort` on the transaction) — and this one had no retry
// at all, so a blocked open simply hung until the test timeout. `op_id` is the store's
// PRIMARY KEY, so the `put` is idempotent and re-attempting can never double-record.
const inject = (page: Page, invId: string, opId: string, amount: number) =>
  untilSettled(async () => {
    await page.evaluate(({ invId, opId, amount }) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('proline_offline_db')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('pending_payments', 'readwrite')
        tx.objectStore('pending_payments').put({
          op_id: opId, invoice_id: invId, student_id: '', amount_usd: amount, amount_lbp: 0,
          method: 'cash_usd', reference: null, exchange_rate: null,
          payment_date: new Date().toISOString().slice(0, 10),
          client_ts: new Date().toISOString(), status: 'pending',
          invoice_number: '', member_name: 'Karim',
        })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('IDB_TX_ABORTED'))
      }
      open.onerror = () => reject(open.error)
      open.onblocked = () => reject(new Error('IDB_OPEN_BLOCKED'))
    }), { invId, opId, amount })
  })

const paymentRows = (page: Page) => vis(page, '[data-testid="payment-row"]') // :visible — double-shell

test.describe('OFF-4 · reconciliation & conflict resolution', () => {
  test('reconnect reconciliation → conflict → resolve by DISCARD (audited, no silent drop)', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 30)
      const invRow = () => vis(page, `[data-testid="desk-invoice-row"][data-invoice-id="${inv.id}"]`).first()
      await openKarimOnDesk(page, 'en')
      await expect(invRow()).toBeVisible({ timeout: 90_000 })
      await primeSW(page)

      // OFFLINE: record the full balance TWICE — on reconnect the 2nd's premise
      // (an open balance) no longer holds → it reconciles to a conflict.
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      // OFF-RESILIENCE: force the app to COMMIT offline before the offline record. A
      // SW-served reload can mount with navigator.onLine reading TRUE under ctx.setOffline,
      // and useOnline() only flips on the 'offline' EVENT (missed before mount) → `online`
      // stays true and the recorder (offline-desk passes online={online}) would write THROUGH
      // instead of queuing (no pay-saved-offline). Re-fire the offline event until online
      // commits false (sync-now disabled ⟺ !online, syncing idle). Idempotent → deterministic
      // (reconnect's own 'online' event restores online=true later).
      await untilConsistent(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('offline')))
        await expect(vis(page, '[data-testid="desk-sync-now"]').first(),
          'offline committed (sync-now disabled) before the offline record path').toBeDisabled({ timeout: 2_000 })
      }, { timeout: 30_000, intervals: [500, 1_000, 2_000] })
      await searchOpenKarim(page, 'Karim')
      for (let i = 0; i < 2; i++) {
        await invRow().getByTestId('desk-record-payment').click()
        await invRow().getByTestId('pay-submit').click()
        await expect(invRow().getByTestId('pay-saved-offline')).toBeVisible({ timeout: 10_000 })
        await expect(invRow().getByTestId('desk-record-payment')).toBeVisible({ timeout: 5_000 })
      }

      // RECONNECT → flush → one settles, the other becomes a reviewable conflict.
      await ctx.setOffline(false)
      await untilConsistent(async () => {
        // OFF-RESILIENCE: re-fire 'online' so useOnline restores online=true after the
        // SW-served page missed ctx.setOffline(false)'s event — else desk-sync-pending
        // stays disabled and the flush never runs (the off4:82 reconnect flake). Idempotent.
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-conflict-row"]').first()).toBeVisible({ timeout: 5_000 })
      }, { timeout: 90_000 })

      // RESOLVE by discard-with-reason (audited server-side, then the row is dropped).
      const row = vis(page, '[data-testid="desk-conflict-row"]').first()
      await row.getByTestId('desk-conflict-resolve').click()
      await expect(row.getByTestId('desk-conflict-server-state'), 'reconciled server truth shown').toBeVisible({ timeout: 15_000 })
      await row.getByTestId('desk-discard-reason').fill('duplicate cash entry — already settled')
      await row.getByTestId('desk-discard-btn').click()
      await untilConsistent(async () => {
        await expect(vis(page, '[data-testid="desk-conflict-row"]'), 'conflict cleared after discard').toHaveCount(0, { timeout: 5_000 })
      }, { timeout: 30_000 })

      // The discard did NOT record a payment and did NOT drop the canonical one.
      await page.goto(inv.url)
      await expect(vis(page, '[data-testid="invoice-status"]').first()).toHaveText(/Paid/i, { timeout: 15_000 })
      await expect(paymentRows(page), 'exactly one canonical payment').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('conflict → resolve by RE-SUBMIT corrected (same op_id) → exactly one canonical', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 25)
      await openKarimOnDesk(page, 'en')
      await expect(vis(page, `[data-testid="desk-invoice-row"][data-invoice-id="${inv.id}"]`).first(),
        'invoice primed (desk DB open at v3)').toBeVisible({ timeout: 90_000 })

      // Force a conflict: queue an OVERPAY ($999 vs $25 balance) → flush → rejected.
      const opId = randomUUID()
      await inject(page, inv.id, opId, 999)
      await page.goto('/en/desk')
      await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible({ timeout: 15_000 })
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-conflict-row"]').first()).toBeVisible({ timeout: 5_000 })
      }, { timeout: 60_000 })

      // RESOLVE by re-submitting under the SAME op_id. Expanding fetches the
      // server's authoritative balance and AUTO-FILLS the corrected amount (the
      // real TVA-inclusive balance) — don't hardcode it. Wait for that server state
      // to land before re-submitting.
      const row = vis(page, '[data-testid="desk-conflict-row"]').first()
      await row.getByTestId('desk-conflict-resolve').click()
      await expect(row.getByTestId('desk-conflict-server-state'), 'reconciled balance auto-filled').toBeVisible({ timeout: 15_000 })
      await row.getByTestId('desk-resubmit-btn').click()

      // The corrected re-submit records exactly one canonical payment → settled.
      // (Re-navigate until the async flush lands.)
      await untilConsistent(async () => {
        await page.goto(inv.url)
        await expect(vis(page, '[data-testid="invoice-status"]').first()).toHaveText(/Paid/i, { timeout: 5_000 })
      }, { timeout: 45_000 })
      await expect(paymentRows(page), 'corrected re-submit records exactly one').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('SW cold-open offline → the queue + pending-sync bar hydrate from a fresh page', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 20)
      const invRow = (p: Page) => vis(p, `[data-testid="desk-invoice-row"][data-invoice-id="${inv.id}"]`).first()
      await openKarimOnDesk(page, 'en')
      await expect(invRow(page)).toBeVisible({ timeout: 90_000 })
      await primeSW(page)

      // OFFLINE: queue a payment.
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      // OFF-RESILIENCE: force the app to COMMIT offline before the offline record. A
      // SW-served reload can mount with navigator.onLine reading TRUE under ctx.setOffline,
      // and useOnline() only flips on the 'offline' EVENT (missed before mount) → `online`
      // stays true and the recorder (offline-desk passes online={online}) would write THROUGH
      // instead of queuing (no pay-saved-offline). Re-fire the offline event until online
      // commits false (sync-now disabled ⟺ !online, syncing idle). Idempotent → deterministic
      // (reconnect's own 'online' event restores online=true later).
      await untilConsistent(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('offline')))
        await expect(vis(page, '[data-testid="desk-sync-now"]').first(),
          'offline committed (sync-now disabled) before the offline record path').toBeDisabled({ timeout: 2_000 })
      }, { timeout: 30_000, intervals: [500, 1_000, 2_000] })
      await searchOpenKarim(page, 'Karim')
      await invRow(page).getByTestId('desk-record-payment').click()
      await invRow(page).getByTestId('pay-submit').click()
      await expect(invRow(page).getByTestId('pay-saved-offline')).toBeVisible({ timeout: 10_000 })

      // COLD OPEN: a brand-new page (cold SW start) loaded OFFLINE — the SW serves the
      // cached shell and the desk hydrates the persisted Dexie queue.
      const page2 = await ctx.newPage()
      await page2.goto('/en/desk')
      await expect(vis(page2, '[data-testid="offline-desk"]').first(), 'desk hydrates on a cold offline open').toBeVisible({ timeout: 20_000 })
      await expect(vis(page2, '[data-testid="desk-pending-bar"]').first(), 'pending bar survives cold-open').toBeVisible({ timeout: 15_000 })
      await expect(vis(page2, '[data-testid="desk-pending-count"]').first()).toContainText('1')

      // Reconnect on the cold page → flush → settles.
      await ctx.setOffline(false)
      await untilConsistent(async () => {
        // OFF-RESILIENCE: re-fire 'online' so useOnline restores online=true on the cold
        // page after reconnect (the SW-served page can miss the event) — else the flush
        // never runs. Idempotent.
        await page2.evaluate(() => window.dispatchEvent(new Event('online')))
        const btn = vis(page2, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page2, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 5_000 })
      }, { timeout: 90_000 })
      await page2.goto(inv.url)
      await expect(vis(page2, '[data-testid="invoice-status"]').first()).toHaveText(/Paid/i, { timeout: 15_000 })
      await expect(paymentRows(page2), 'cold-open queue flushed to exactly one').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('/ar conflict-resolution UI renders localized (no missing keys)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      const inv = await issueForKarim(page, 18) // issued on /en inside the helper
      await openKarimOnDesk(page, 'ar', '70000001')
      await expect(vis(page, `[data-testid="desk-invoice-row"][data-invoice-id="${inv.id}"]`).first()).toBeVisible({ timeout: 90_000 })

      // Force a conflict, online, via an overpay inject → flush.
      const opId = randomUUID()
      await inject(page, inv.id, opId, 999)
      await page.goto('/ar/desk')
      await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible({ timeout: 15_000 })
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-conflict-row"]').first()).toBeVisible({ timeout: 5_000 })
      }, { timeout: 60_000 })

      const row = vis(page, '[data-testid="desk-conflict-row"]').first()
      await row.getByTestId('desk-conflict-resolve').click()
      await expect(row.getByTestId('desk-discard-btn'), 'localized resolution actions render').toBeVisible({ timeout: 15_000 })
      await expect(row.getByTestId('desk-resubmit-btn')).toBeVisible()
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
      expect(await page.locator('text=desk.').count(), 'no unresolved desk.* key').toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
