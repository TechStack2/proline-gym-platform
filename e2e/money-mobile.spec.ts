import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * MONEY-MOBILE (§5) — the money surfaces work on a phone.
 *
 * Own hermetic gym (seed_e2e_dunning: an owner + a member WITH a phone + one OPEN
 * overdue renewal invoice + WhatsApp active), plus a service-role payment so the
 * Payments tab has a row. Proves the four §5 defects are fixed:
 *   R1 — at 390px both tabs render CARD rows (the desktop table is display:none) and
 *        the page body does NOT scroll horizontally; at ≥768px the table returns.
 *   R2 — the collectible invoice's actions (Collect / Send / Remind) live in the
 *        card's action row, NOT inside the member/identity cell.
 *   R3 — (unit-proven by invoice-id.test.ts; here the number link carries the full id).
 *   R4 — the Payments date filter is the 8-day quick-range chips + a Custom-range
 *        Dialog that still holds the wrapped native from/to inputs.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `money-mobile-${BASE}`
const H = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' })
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }
const today = () => new Date().toISOString().slice(0, 10)

let gymId = ''
let invoiceId = ''
let studentId = ''
let invoiceNumber = ''
let dueDate = ''

/** Mirror of aging.ts / 000110 (date-only, `current_date` basis) for the oracle. */
function bucketOf(due: string): 'current' | 'd1_30' | 'd31_60' | 'd60_plus' {
  const d = Math.floor((new Date(today() + 'T00:00:00Z').getTime() - new Date(due.slice(0, 10) + 'T00:00:00Z').getTime()) / 864e5)
  if (d <= 0) return 'current'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  return 'd60_plus'
}

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H() })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svcPost(path: string, body: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...H(), Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function ownerPage(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ locale: 'en', viewport })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

/** No page-level horizontal scroll — the exact defect (amounts floating past 390px). */
async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('MONEY-MOBILE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_dunning`, {
    method: 'POST', headers: H(), body: JSON.stringify({ p_slug: SLUG, p_opt_in: true, p_password: PW }),
  })
  if (!res.ok) throw new Error(`seed_e2e_dunning failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  // The seed's OPEN overdue renewal invoice (due today-30 → the 1–30-days bucket).
  const inv = await svcGet(`invoices?gym_id=eq.${gymId}&status=eq.overdue&order=created_at.desc&limit=1&select=id,student_id,invoice_number,due_date`)
  invoiceId = inv[0].id
  studentId = inv[0].student_id
  invoiceNumber = inv[0].invoice_number
  dueDate = inv[0].due_date
  // A partial payment TODAY: the invoice stays open (balance > 0 → Collect/WA render)
  // and the Payments tab has a row to card-ify.
  await svcPost('payments', { invoice_id: invoiceId, student_id: studentId, amount_usd: 10, payment_method: 'cash_usd', payment_date: today() })
})

test.afterAll(async () => {
  if (gymId) await fetch(`${URL}/rest/v1/rpc/teardown_e2e_gym`, { method: 'POST', headers: H(), body: JSON.stringify({ p_slug: SLUG }) }).catch(() => {})
})

test('R1/R2/R3 · Invoices at 390 = card rows, no h-scroll, actions out of the identity cell, aging chip', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ownerPage(browser, MOBILE)
  try {
    // Search isolates the seed's overdue invoice so the assertions target IT (the
    // gym's base seed may carry other invoices; .first() alone would be ambiguous).
    await page.goto(`/en/money?tab=invoices&search=${encodeURIComponent(invoiceNumber)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('[data-testid="invoice-row"]:visible').first()
    await expect(row, 'a card invoice-row is visible at 390').toBeVisible({ timeout: 20_000 })

    // R1: the page body must not scroll horizontally (the screenshotted defect).
    expect(await noHorizontalScroll(page), 'no page-level horizontal scroll at 390').toBe(true)

    // R1: the visible row is the CARD (a <li>), not a table <tr> — the table is
    // display:none below md, so exactly one variant is ever visible.
    expect(await row.evaluate((el) => el.tagName.toLowerCase()), 'the visible row is the mobile card').toBe('li')

    // R2: the collectible invoice's actions live in the action row, NOT the member cell.
    const actions = row.getByTestId('invoice-row-actions')
    await expect(actions, 'the card has a dedicated action row').toBeVisible()
    await expect(actions.getByTestId('invoice-row-collect'), 'Collect is in the action row').toBeVisible()
    await expect(actions.getByTestId('invoice-row-wa-send'), 'Send is in the action row').toBeVisible()
    // …and the member/identity link contains no action button.
    const memberActions = await row.getByTestId('invoice-member-link').locator('a,button').count()
    expect(memberActions, 'no action nested inside the member link').toBe(0)

    // R2: Collect is the M360A pre-filled pay door.
    await expect(row.getByTestId('invoice-row-collect')).toHaveAttribute('href', new RegExp(`/students/${studentId}\\?pay=${invoiceId}`))

    // §5: the aging chip renders the ONE bucket truth — byte-matched to 000110 by
    // aging.test.ts; here the rendered bucket equals the independently-computed oracle.
    await expect(row.getByTestId('invoice-aging-chip'), 'aging chip present').toHaveAttribute('data-bucket', bucketOf(dueDate))

    // R3: the number link keeps the FULL id (title/aria) even if the display truncates.
    await expect(row.locator('a[title]').first()).toHaveAttribute('title', invoiceNumber)
  } finally { await ctx.close() }
})

test('R1 · Invoices at 1280 = the table path (unchanged), still no h-scroll', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ownerPage(browser, DESKTOP)
  try {
    await page.goto(`/en/money?tab=invoices&search=${encodeURIComponent(invoiceNumber)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('[data-testid="invoice-row"]:visible').first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    // The visible row is a table <tr> at desktop (the card is display:none).
    expect(await row.evaluate((el) => el.tagName.toLowerCase()), 'the visible row is a table row').toBe('tr')
    // b3 contract preserved: the FIRST anchor in the row is the invoice-number link.
    await expect(row.locator('a').first()).toHaveAttribute('href', new RegExp(`/invoices/${invoiceId}`))
    expect(await noHorizontalScroll(page), 'no page-level horizontal scroll at 1280').toBe(true)
  } finally { await ctx.close() }
})

test('R1/R4 · Payments at 390 = card rows + quick-range chips + a Custom-range Dialog holding the natives', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await ownerPage(browser, MOBILE)
  try {
    await page.goto('/en/money?tab=payments', { waitUntil: 'domcontentloaded' })
    const row = page.locator('[data-testid="payment-row"]:visible').first()
    await expect(row, 'a card payment-row is visible at 390').toBeVisible({ timeout: 20_000 })
    expect(await row.evaluate((el) => el.tagName.toLowerCase()), 'the visible payment row is a card').toBe('li')
    expect(await noHorizontalScroll(page), 'no page-level horizontal scroll at 390').toBe(true)

    // R4: the date filter is the 8-day quick-range chip row (native inputs gone from
    // the surface); tapping the Today chip filters to today.
    await expect(page.getByTestId('pay-filter-range'), 'the quick-range chip row').toBeVisible()
    const chips = page.locator('[data-testid="pay-range-chip"]')
    expect(await chips.count(), 'eight day chips').toBe(8)
    await chips.first().click() // Today
    await page.waitForURL(/from=/, { timeout: 10_000 })
    await expect(page.locator('[data-testid="pay-range-chip"][data-active]').first(), 'Today chip is active').toBeVisible()

    // R4: the Custom-range Dialog holds the WRAPPED native from/to (testids preserved).
    await page.getByTestId('pay-range-custom').click()
    const dialog = page.getByTestId('pay-range-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('pay-filter-from')).toBeVisible()
    await expect(dialog.getByTestId('pay-filter-to')).toBeVisible()
    await expect(dialog.locator('input[type="date"]'), 'the natives stay native, just wrapped').toHaveCount(2)
  } finally { await ctx.close() }
})

test('§2 · Prospects funnel stage tiles at 390 wrap fully-readable, no right-edge clip / h-scroll', async ({ browser }) => {
  // 120s + a 45s pipeline-visible budget: the /students?tab=prospects leads-pipeline
  // SSR renders slowly on a loaded CI runner (same surface g1 gives 180s) — domcontentloaded
  // returns before hydration and the locator below waits it out, so a slow-but-completing
  // render never gets cut off.
  test.setTimeout(120_000)
  const { ctx, page } = await ownerPage(browser, MOBILE)
  try {
    await page.goto('/en/students?tab=prospects', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('leads-pipeline'), 'the pipeline renders').toBeVisible({ timeout: 45_000 })

    // All five stage tiles are present (the row wraps; none are dropped).
    const KEYS = ['all', 'new', 'contacted', 'trial_scheduled', 'converted']
    for (const k of KEYS) {
      await expect(page.getByTestId(`prospect-chip-${k}`), `${k} tile is visible`).toBeVisible()
    }

    // The fix: at 390 the stage row WRAPS to two columns instead of the old fixed
    // five-across that squeezed each track below its content and clipped off the
    // right edge. The computed grid-template-columns is a pure CSS media query —
    // deterministic at this width, independent of hydration/layout timing (the
    // boundingBox geometry was not; it flashed the desktop layout on hydration).
    const trackCount = await page.getByTestId('prospect-chip-all').evaluate(
      (el) => getComputedStyle(el.parentElement as HTMLElement).gridTemplateColumns.split(' ').length,
    )
    expect(trackCount, 'the stage row wraps to 2 columns at 390 (was a clipping 5-across)').toBe(2)

    // …and the page body never scrolls horizontally (poll rides out the hydration flash).
    await expect.poll(async () => noHorizontalScroll(page), { timeout: 10_000, message: 'no page h-scroll at 390' }).toBe(true)
  } finally { await ctx.close() }
})
