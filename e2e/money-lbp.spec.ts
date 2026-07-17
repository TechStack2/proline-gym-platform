import { test, expect, type Browser } from '@playwright/test'

/**
 * MONEY-LBP — the money dashboard tells the WHOLE truth: every aggregation shows
 * Σ amount_usd AND Σ amount_lbp AS RECORDED (never cross-converted), laid out by the
 * gym's currency_preference. Hermetic OWN gym (seed_e2e_wl_gym) seeded with mixed-
 * currency payments at different rates + a refund (negative both columns) + a
 * discounted payment, so the dual totals are DETERMINISTIC:
 *   collected  Σ USD = 150.00 · Σ LBP = 4,450,000    (cash_usd 100/0 ; cash_lbp 50/4,450,000)
 *   outstanding    USD = 110.00 · LBP = 9,790,000
 * Then the same numbers are re-rendered under BOTH / LBP / USD preference.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `moneylbp-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const RATE = 89000

let gymId = ''
let studentId = ''
let invSeq = 0

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function setPref(pref: 'USD' | 'LBP' | 'BOTH') {
  const r = await svc(`gyms?id=eq.${gymId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ currency_preference: pref }) })
  if (!r.ok) throw new Error(`set pref ${pref} → ${r.status} ${await r.text()}`)
}
/** A pending, tax-free invoice whose LBP total is the USD at RATE (so total_lbp is real). */
async function newInvoice(amountUsd: number): Promise<string> {
  const r = await svc('invoices', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      gym_id: gymId, student_id: studentId, invoice_type: 'other',
      invoice_number: `MLBP-${Date.now().toString(36)}-${++invSeq}`,
      amount_usd: amountUsd, amount_lbp: Math.round(amountUsd * RATE), tax_rate: 0, exchange_rate: RATE,
      status: 'pending', due_date: new Date().toISOString().slice(0, 10),
    }),
  })
  if (!r.ok) throw new Error(`invoice insert → ${r.status} ${await r.text()}`)
  return ((await r.json()) as Array<{ id: string }>)[0].id
}
async function ownerToken(): Promise<string> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `owner+${SLUG}@e2e.local`, password: PW }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}
async function record(bearer: string, body: Record<string, unknown>) {
  const r = await fetch(`${URL}/rest/v1/rpc/record_payment`, {
    method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`record_payment → ${r.status} ${await r.text()}`)
}
async function ownerLogin(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('MONEY-LBP needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) → ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  studentId = ((await (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as Array<{ id: string }>)[0].id
  const tok = await ownerToken()

  // ── PAID invoices (feed collections + revenue) ──
  const i1 = await newInvoice(100) // pure USD collection
  await record(tok, { p_invoice_id: i1, p_amount_usd: 100, p_amount_lbp: 0, p_method: 'cash_usd' })

  const i2 = await newInvoice(60) // pure LBP collection at RATE …
  await record(tok, { p_invoice_id: i2, p_amount_usd: 60, p_amount_lbp: 60 * RATE, p_method: 'cash_lbp' })
  // … then REFUNDED (negative BOTH columns — the CANCEL-FLOW shape) → nets to zero.
  const refund = await svc('payments', {
    method: 'POST',
    body: JSON.stringify({ invoice_id: i2, student_id: studentId, amount_usd: -60, amount_lbp: -60 * RATE, payment_method: 'cash_lbp', payment_date: new Date().toISOString() }),
  })
  if (!refund.ok) throw new Error(`refund insert → ${refund.status} ${await refund.text()}`)

  const i3 = await newInvoice(40) // DISCOUNTED $10 → net $30 collected in LBP
  await record(tok, { p_invoice_id: i3, p_amount_usd: 30, p_amount_lbp: 30 * RATE, p_method: 'cash_lbp', p_discount_usd: 10 })

  // ── OPEN invoices (feed outstanding: 80 + (50−20)=30 → 110 USD / 9,790,000 LBP) ──
  await newInvoice(80) // untouched → owes 80 / 7,120,000
  const i5 = await newInvoice(50)
  await record(tok, { p_invoice_id: i5, p_amount_usd: 20, p_amount_lbp: 20 * RATE, p_method: 'cash_lbp' }) // partial → owes 30 / 2,670,000
})

test('1 · BOTH preference — every aggregation shows both totals as recorded (refund + discount netted)', async ({ browser }) => {
  test.setTimeout(120_000)
  await setPref('BOTH')
  const { ctx, page } = await ownerLogin(browser, 'en')
  try {
    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })

    // Outstanding — both columns.
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toBeVisible({ timeout: 15_000 })
    await expect(outstanding).toHaveText('$110.00')
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText('9,790,000 LBP')

    // Daily drawer tally — the cash_lbp chip carries both (net of the refund).
    const tallyLbp = page.locator('[data-testid="money-tally-method"][data-method="cash_lbp"]')
    await expect(tallyLbp).toContainText('$50.00')
    await expect(tallyLbp).toContainText('4,450,000 LBP')
    const tallyUsd = page.locator('[data-testid="money-tally-method"][data-method="cash_usd"]')
    await expect(tallyUsd).toContainText('$100.00')

    // Owner finances: revenue total + collections by method — both columns.
    await expect(page.getByTestId('owner-finances')).toBeVisible({ timeout: 15_000 })
    const revRow = page.locator('[data-testid="revenue-row"]').first()
    await expect(revRow.getByTestId('revenue-row-total')).toContainText('$150')
    await expect(revRow.getByTestId('revenue-row-total-lbp')).toHaveText('4,450,000 LBP')
    const methodLbp = page.locator('[data-testid="method-row"][data-method="cash_lbp"] [data-testid="method-amount"]')
    await expect(methodLbp).toContainText('$50.00')
    await expect(methodLbp).toContainText('4,450,000 LBP')

    await page.screenshot({ path: 'screenshots/money-lbp-both-en.png', fullPage: true })
  } finally {
    await ctx.close()
  }
})

test('2 · LBP preference (ar/RTL) — LBP leads, USD muted', async ({ browser }) => {
  test.setTimeout(120_000)
  await setPref('LBP')
  const { ctx, page } = await ownerLogin(browser, 'ar')
  try {
    await page.goto('/ar/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toBeVisible({ timeout: 15_000 })
    // LBP leads the headline; USD is the muted secondary line.
    await expect(outstanding).toHaveText('9,790,000 LBP')
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText('$110.00')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.screenshot({ path: 'screenshots/money-lbp-lbp-ar.png', fullPage: true })
  } finally {
    await ctx.close()
  }
})

test('3 · USD preference — USD leads; the LBP total still shows because it was recorded', async ({ browser }) => {
  test.setTimeout(120_000)
  await setPref('USD')
  const { ctx, page } = await ownerLogin(browser, 'en')
  try {
    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toHaveText('$110.00')
    // USD-pref still surfaces the recorded LBP (honest, never hidden when it exists).
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText('9,790,000 LBP')
  } finally {
    await ctx.close()
  }
})
