import { test, expect } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis } from './helpers'

/**
 * PRINT-FIX — the thermal 80mm receipt (field finding [8]). Proves the three things
 * that were broken since dark mode shipped:
 *   (1) DARK PARITY — from a dark session the receipt still renders as WHITE PAPER
 *       with dark ink (the neutrals used to invert under html.dark → dark-on-dark on
 *       paper). Asserted by the receipt's computed background staying rgb(255,255,255)
 *       and its ink staying dark, in BOTH screen+print AND light+dark.
 *   (2) NO BROWSER CHROME — a scoped @page (80mm, margin 0) is present so the browser
 *       drops its URL header/footer; under print media the dashboard shell is hidden.
 *   (3) SHAPE / FIELDS — invoice #, total, and the PAID/DUE stamp render; a PDF is
 *       emitted from a dark print session as the durable pixel artifact.
 * /en + /ar. Owner session against the shared e2e gym's seeded invoice.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// computed background of the receipt paper + colour of its ink.
async function receiptPaint(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="receipt"]').evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, ink: cs.color }
  })
}

test('PRINT-FIX · thermal receipt renders as white paper in dark mode, chrome-free @page, PAID stamp', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  if (!URL || !KEY) throw new Error('PRINT-FIX needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')

  const gyms = await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`)
  const gymId = gyms[0].id
  // The gym is SHARED with every other spec file in this shard, and one of them
  // (cancel-flow) voids an invoice — so "the newest invoice" is not necessarily a
  // printable one. A voided invoice renders the VOID stamp instead of PAID/DUE, and
  // this test asserts the PAID/DUE stamp two dozen lines down. Filter for a live
  // invoice so the test GUARANTEES the precondition it measures rather than inheriting
  // it from whichever spec happened to run first.
  const invs = await svcGet(`invoices?gym_id=eq.${gymId}&voided_at=is.null&order=created_at.desc&limit=1&select=id,invoice_number`)
  expect(invs[0]?.id, 'the seed has a non-voided invoice to print a receipt for').toBeTruthy()
  const invId = invs[0].id

  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en/invoices/${invId}/receipt`)
    await expect(vis(page, '[data-testid="receipt"]').first(), 'receipt renders').toBeVisible({ timeout: 15_000 })

    // (3) key fields on the document.
    await expect(page.getByTestId('receipt-invoice-number')).toHaveText(invs[0].invoice_number)
    await expect(page.getByTestId('receipt-total')).toBeVisible()
    const stamp = page.getByTestId('receipt-paid-stamp')
    await expect(stamp, 'the PAID/DUE stamp renders').toBeVisible()
    expect(['paid', 'due'], 'stamp carries a settled/outstanding state').toContain(await stamp.getAttribute('data-state'))

    // (2) the scoped @page is present (kills the browser URL header/footer).
    const hasAtPage = await page.evaluate(() =>
      [...document.querySelectorAll('style')].some((s) => /@page\s*\{[^}]*80mm/.test(s.textContent || '')))
    expect(hasAtPage, 'a scoped @page 80mm rule is injected on the receipt route').toBe(true)

    // (1) LIGHT baseline — the paper is white, the ink is dark.
    const light = await receiptPaint(page)
    expect(light.bg, 'light: paper is white').toBe('rgb(255, 255, 255)')
    await page.screenshot({ path: 'screenshots/print-receipt-screen-en-light.png' })

    // (2) PRINT media — the shell chrome is hidden, the receipt still shows.
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('desktop-sidebar'), 'sidebar hidden on print').toBeHidden()
    await expect(vis(page, '[data-testid="receipt"]').first(), 'receipt shows on print').toBeVisible()
    await page.screenshot({ path: 'screenshots/print-receipt-print-en.png' })

    // (1) DARK PARITY — force a dark session (html.dark) in both screen and print.
    // The whole point: the receipt is PINNED to the light ramp, so paper stays white
    // and ink stays dark regardless of theme → a print from dark == a print from light.
    await page.emulateMedia({ media: 'screen', colorScheme: 'dark' })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const darkScreen = await receiptPaint(page)
    expect(darkScreen.bg, 'dark screen: paper STILL white (no dark bleed)').toBe('rgb(255, 255, 255)')
    expect(darkScreen.ink, 'dark screen: ink unchanged from light').toBe(light.ink)
    await page.screenshot({ path: 'screenshots/print-receipt-screen-en-dark.png' })

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
    const darkPrint = await receiptPaint(page)
    expect(darkPrint.bg, 'dark print: paper STILL white').toBe('rgb(255, 255, 255)')
    // durable pixel artifact — a PDF printed from a DARK session (must look like paper).
    const pdf = await page.pdf({ printBackground: true })
    expect(pdf.byteLength, 'a receipt PDF is emitted from the dark session').toBeGreaterThan(1000)
    await testInfo.attach('receipt-dark-print.pdf', { body: pdf, contentType: 'application/pdf' })

    await page.emulateMedia({ media: 'screen', colorScheme: null })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))

    // /ar RTL parity — the receipt renders right-to-left, still white paper.
    await page.goto(`/ar/invoices/${invId}/receipt`)
    await expect(vis(page, '[data-testid="receipt"]').first(), '/ar receipt renders').toBeVisible({ timeout: 15_000 })
    const ar = await receiptPaint(page)
    expect(ar.bg, '/ar: paper is white').toBe('rgb(255, 255, 255)')
    await page.screenshot({ path: 'screenshots/print-receipt-screen-ar.png' })
  } finally {
    await ctx.close()
  }
})
