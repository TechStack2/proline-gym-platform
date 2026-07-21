import { test, expect, type Browser, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { ROLES } from './roles'
import { vis, untilConsistent, untilSettled } from './helpers'

/**
 * OFF-3 — the front desk RECORDS offline. Generalizes G2's queue→flush→idempotent-
 * writer loop to the money path: a payment recorded offline is queued in Dexie
 * (provisional, dual-currency) and pushed through the EXISTING record_payment
 * writer on reconnect, with a client op_id as the idempotency key so a re-push
 * settles EXACTLY ONCE. Proves: the money loop (pending → confirmed), the
 * idempotency key (re-push no-ops), conflict surfacing (never drop a money
 * record), and /ar localization. Reuses the G2 `setOffline` harness.
 *
 * Each test issues its OWN throwaway invoice for Karim (via /invoices/new) so it
 * never mutates the shared seed fixtures (the serial suite's $50 seed invoice and
 * Karim's membership stay untouched).
 */
async function ownerPage(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

/** Issue a fresh invoice for Karim; returns its number + detail URL + id. */
async function issueForKarim(page: Page, amountUsd: number, locale = 'en'): Promise<{ number: string; url: string; id: string }> {
  await page.goto(`/${locale}/invoices/new`)
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
  await expect(res, 'the primed mirror finds the member').toBeVisible({ timeout: 90_000 })
  await res.click()
  await expect(vis(page, '[data-testid="desk-member-basics"]').first()).toBeVisible({ timeout: 15_000 })
}

async function openKarimOnDesk(page: Page, locale: string, search = 'Karim') {
  await page.goto(`/${locale}/desk`)
  await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
  await searchOpenKarim(page, search)
}

/** Reload online so the SW page-caches /desk, then take control before offline. */
async function primeSW(page: Page) {
  await page.reload()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 }).catch(() => {})
}

// :visible — the (dashboard) layout double-renders content (one shell hidden).
const paymentRows = (page: Page) => vis(page, '[data-testid="payment-row"]')

test.describe('OFF-3 · offline front-desk writes (money path + idempotency)', () => {
  test('desk records a payment offline → pending → reconnect → exactly one canonical payment', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 40)
      const invRow = () => vis(page, '[data-testid="desk-invoice-row"]').filter({ hasText: inv.number }).first()

      // ── ONLINE: open the desk (primes the mirror → the new invoice appears) + SW-cache it.
      await openKarimOnDesk(page, 'en')
      await expect(invRow(), 'issued invoice primed into the desk mirror').toBeVisible({ timeout: 90_000 })
      await primeSW(page)

      // ── OFFLINE: record the payment from the desk → provisional/pending.
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      await searchOpenKarim(page, 'Karim')
      await invRow().getByTestId('desk-record-payment').click()
      await invRow().getByTestId('pay-submit').click()           // amount defaults to the balance
      await expect(invRow().getByTestId('pay-saved-offline'), 'shows "saved offline · will sync"').toBeVisible({ timeout: 10_000 })
      await expect(vis(page, '[data-testid="desk-pending-bar"]').first(), 'pending-queue indicator').toBeVisible()
      await expect(vis(page, '[data-testid="desk-pending-count"]').first()).toContainText('1')

      // ── RECONNECT → flush → pending flips to confirmed (the bar clears).
      await ctx.setOffline(false)
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 5_000 })
      }, { timeout: 90_000 })

      // ── EXACTLY ONE canonical payment on the server; the invoice is settled.
      await page.goto(inv.url)
      await expect(vis(page, '[data-testid="invoice-status"]').first()).toHaveText(/Paid/i, { timeout: 15_000 })
      await expect(paymentRows(page), 'exactly one canonical payment').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('a re-push of the same op_id does NOT double-record (idempotency key)', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 25)
      await openKarimOnDesk(page, 'en')
      await expect(vis(page, '[data-testid="desk-invoice-row"]').filter({ hasText: inv.number }).first(),
        'invoice primed (so the desk DB is open at v3)').toBeVisible({ timeout: 90_000 })

      // White-box: inject a queued intent with a per-run op_id (the idempotency
      // key), so we can re-push the SAME key and prove record_payment no-ops the
      // second time. Per-run (not hardcoded) so retries / parallel projects on the
      // shared gym never collide on the global-unique client_uuid.
      const opId = randomUUID()
      // FLAKE-HEAL-2R: bounded + both unhandled settle paths wired (see off3b's
      // injectLead). Re-attempting is safe — op_id is the store's PRIMARY KEY, which
      // is the very idempotency this test then proves against record_payment.
      const inject = () => untilSettled(async () => {
        await page.evaluate(({ opId, invId }) => new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('proline_offline_db')
          open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction('pending_payments', 'readwrite')
            tx.objectStore('pending_payments').put({
              op_id: opId, invoice_id: invId, student_id: '', amount_usd: 25, amount_lbp: 0,
              method: 'cash_usd', reference: null, exchange_rate: null,
              payment_date: new Date().toISOString().slice(0, 10),
              client_ts: new Date().toISOString(), status: 'pending',
            })
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error ?? new Error('IDB_TX_ABORTED'))
          }
          open.onerror = () => reject(open.error)
          open.onblocked = () => reject(new Error('IDB_OPEN_BLOCKED'))
        }), { opId, invId: inv.id })
      })

      const flushFromDesk = async () => {
        await page.goto('/en/desk')
        await expect(vis(page, '[data-testid="desk-pending-bar"]').first()).toBeVisible({ timeout: 15_000 })
        await vis(page, '[data-testid="desk-sync-pending"]').first().click()
        // :visible — a manual flush updates only the clicked shell's instance; the
        // hidden shell keeps its own pending state (double-shell), so count the
        // visible bar only.
        await expect(vis(page, '[data-testid="desk-pending-bar"]')).toHaveCount(0, { timeout: 30_000 })
      }

      // First push → records the payment.
      await inject()
      await flushFromDesk()
      await page.goto(inv.url)
      await expect(paymentRows(page), 'first push records exactly one').toHaveCount(1, { timeout: 15_000 })

      // Re-push the SAME op_id → record_payment short-circuits → still exactly one.
      await inject()
      await flushFromDesk()
      await page.goto(inv.url)
      await expect(paymentRows(page), 're-push of the same op_id did not double-record').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('a write that cannot reconcile is surfaced for review, not dropped (conflict)', async ({ browser }) => {
    test.setTimeout(240_000)
    const { ctx, page } = await ownerPage(browser)
    try {
      const inv = await issueForKarim(page, 30)
      const invRow = () => vis(page, '[data-testid="desk-invoice-row"]').filter({ hasText: inv.number }).first()
      await openKarimOnDesk(page, 'en')
      await expect(invRow()).toBeVisible({ timeout: 90_000 })
      await primeSW(page)

      // ── OFFLINE: record the full balance TWICE (the 2nd can't reconcile).
      await ctx.setOffline(true)
      await untilConsistent(async () => {
        await page.reload()
        await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 10_000 })
      }, { timeout: 60_000 })
      await searchOpenKarim(page, 'Karim')
      for (let i = 0; i < 2; i++) {
        await invRow().getByTestId('desk-record-payment').click()
        await invRow().getByTestId('pay-submit').click()
        await expect(invRow().getByTestId('pay-saved-offline')).toBeVisible({ timeout: 10_000 })
        await expect(invRow().getByTestId('desk-record-payment'), 'form resets for the next record').toBeVisible({ timeout: 5_000 })
      }
      await expect(vis(page, '[data-testid="desk-pending-count"]').first()).toContainText('2')

      // ── RECONNECT → flush: first settles, second is surfaced as a conflict (kept).
      await ctx.setOffline(false)
      await untilConsistent(async () => {
        const btn = vis(page, '[data-testid="desk-sync-pending"]').first()
        if (await btn.isEnabled().catch(() => false)) await btn.click().catch(() => {})
        await expect(vis(page, '[data-testid="desk-conflict-row"]').first(), 'the unreconcilable write is surfaced').toBeVisible({ timeout: 5_000 })
      }, { timeout: 90_000 })
      await expect(vis(page, '[data-testid="desk-conflict-count"]').first()).toBeVisible()

      // ── EXACTLY ONE canonical payment — the conflict was NOT recorded, NOT dropped.
      await page.goto(inv.url)
      await expect(vis(page, '[data-testid="invoice-status"]').first()).toHaveText(/Paid/i, { timeout: 15_000 })
      await expect(paymentRows(page), 'only the reconcilable payment is canonical').toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('/ar offline payment UI renders localized (no missing keys)', async ({ browser }) => {
    test.setTimeout(150_000)
    const { ctx, page } = await ownerPage(browser, 'ar')
    try {
      // Issue on /en — the /invoices/new student dropdown shows localized names, so
      // the 'Karim'-by-text lookup only resolves on /en. The invoice itself is
      // locale-independent; the desk part below runs on /ar.
      const inv = await issueForKarim(page, 15, 'en')
      // Target the row by id (locale-proof — the rendered number can pick up bidi marks on /ar).
      const invRow = () => vis(page, `[data-testid="desk-invoice-row"][data-invoice-id="${inv.id}"]`).first()
      await openKarimOnDesk(page, 'ar', '70000001') // Karim by phone (locale-agnostic)
      await expect(invRow(), 'issued invoice primed into the /ar desk mirror').toBeVisible({ timeout: 90_000 })

      // Go offline IN PLACE — the desk is already mounted + the mirror primed, so
      // no SW reload is needed here (off2 + the /en money loop cover the offline
      // reload). Wait for the offline state to settle before the write.
      await ctx.setOffline(true)
      await page.waitForFunction(() => !navigator.onLine, null, { timeout: 10_000 })
      await invRow().getByTestId('desk-record-payment').click()
      await invRow().getByTestId('pay-submit').click()
      await expect(invRow().getByTestId('pay-saved-offline'), 'localized "saved offline" on /ar').toBeVisible({ timeout: 10_000 })
      await expect(vis(page, '[data-testid="desk-pending-bar"]').first(), 'localized pending bar on /ar').toBeVisible()
      expect(await page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE on /ar').toBe(0)
      expect(await page.locator('text=desk.').count(), 'no unresolved desk.* key').toBe(0)
      await ctx.setOffline(false)
    } finally {
      await ctx.close()
    }
  })
})
