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
async function svcGet(path: string): Promise<any[]> {
  const r = await svc(path)
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}
const grp = (n: number) => Number(n).toLocaleString('en-US') // mirrors fmtLbp exactly

/** Page through PostgREST past its max_rows cap (config.toml: 1000), so an oracle over
 *  the whole table is COMPLETE. `path` must carry a stable `&order=` for offset paging
 *  to be deterministic. This is the property the app's old read lacked, so the oracle
 *  must NOT share it — otherwise the assertion would mirror the very truncation it is
 *  meant to catch. */
async function svcGetAll(path: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let off = 0; ; off += PAGE) {
    const rows = await svcGet(`${path}&offset=${off}&limit=${PAGE}`)
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** Expected outstanding (USD + LBP), computed COMPLETELY and INDEPENDENTLY of the app:
 *  every open invoice and every one of this gym's payments, paged past max_rows, netted
 *  with the SAME clamps the app uses (balanceUsd <0.01→0; balanceLbp <1→0). Because it
 *  never truncates, it is a true oracle for get_gym_outstanding — including the
 *  regression test that seeds past both PostgREST caps. */
async function expectedOutstanding(): Promise<{ usd: string; lbp: string; invoiceCount: number; paymentCount: number }> {
  const invs = await svcGetAll(`invoices?gym_id=eq.${gymId}&status=in.(pending,partial,overdue)&select=id,total_usd,total_lbp&order=id`)
  const pays = await svcGetAll(`payments?select=invoice_id,amount_usd,amount_lbp,invoices!inner(gym_id)&invoices.gym_id=eq.${gymId}&order=id`)
  const pu = new Map<string, number>(); const pl = new Map<string, number>()
  for (const p of pays) { pu.set(p.invoice_id, (pu.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0)); pl.set(p.invoice_id, (pl.get(p.invoice_id) ?? 0) + Number(p.amount_lbp ?? 0)) }
  let u = 0; let l = 0
  for (const i of invs) {
    const bu = Number(i.total_usd ?? 0) - (pu.get(i.id) ?? 0); if (bu >= 0.01) u += Math.round(bu * 100) / 100
    const bl = Number(i.total_lbp ?? 0) - (pl.get(i.id) ?? 0); if (bl >= 1) l += Math.round(bl)
  }
  u = Math.round(u * 100) / 100
  return { usd: `$${u.toFixed(2)}`, lbp: `${grp(l)} LBP`, invoiceCount: invs.length, paymentCount: pays.length }
}
/** Expected collections for a method THIS MONTH (both columns) — includes this spec's
 *  refund (negative) + discounted (net) rows, so a match proves they flow through. */
async function expectedMethodThisMonth(method: string): Promise<{ usd: string; lbp: string }> {
  const mk = new Date().toISOString().slice(0, 7)
  const start = `${mk}-01T00:00:00Z`
  const end = new Date(`${mk}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1)
  const pays = await svcGet(`payments?select=amount_usd,amount_lbp,payment_method,invoices!inner(gym_id)&invoices.gym_id=eq.${gymId}&payment_method=eq.${method}&payment_date=gte.${start}&payment_date=lt.${end.toISOString()}`)
  let u = 0; let l = 0
  for (const p of pays) { u += Number(p.amount_usd ?? 0); l += Number(p.amount_lbp ?? 0) }
  return { usd: `$${u.toFixed(2)}`, lbp: `${grp(l)} LBP` }
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
  const exp = await expectedOutstanding()
  const expLbp = await expectedMethodThisMonth('cash_lbp') // includes the refund + discounted rows
  const { ctx, page } = await ownerLogin(browser, 'en')
  try {
    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })

    // Outstanding — both columns, exactly matching the ledger (BOTH → USD leads).
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toBeVisible({ timeout: 15_000 })
    await expect(outstanding).toHaveText(exp.usd)
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText(exp.lbp)

    // Daily drawer tally shows a real LBP figure (the cash_lbp chip carries both).
    const tallyLbp = page.locator('[data-testid="money-tally-method"][data-method="cash_lbp"]')
    await expect(tallyLbp).toContainText('$')
    await expect(tallyLbp).toContainText('LBP')

    // Owner finances: revenue total carries an LBP line; collections-by-method for
    // cash_lbp matches the ledger EXACTLY (net of the refund + the discount).
    await expect(page.getByTestId('owner-finances')).toBeVisible({ timeout: 15_000 })
    const revLbp = page.locator('[data-testid="revenue-row"]').first().getByTestId('revenue-row-total-lbp')
    await expect(revLbp).toBeVisible()
    await expect(revLbp).toContainText('LBP')
    const methodLbp = page.locator('[data-testid="method-row"][data-method="cash_lbp"] [data-testid="method-amount"]')
    await expect(methodLbp).toContainText(expLbp.usd)
    await expect(methodLbp).toContainText(expLbp.lbp)

    await page.screenshot({ path: 'screenshots/money-lbp-both-en.png', fullPage: true })
  } finally {
    await ctx.close()
  }
})

test('2 · LBP preference (ar/RTL) — LBP leads, USD muted', async ({ browser }) => {
  test.setTimeout(120_000)
  await setPref('LBP')
  const exp = await expectedOutstanding()
  const { ctx, page } = await ownerLogin(browser, 'ar')
  try {
    await page.goto('/ar/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toBeVisible({ timeout: 15_000 })
    // LBP leads the headline; USD is the muted secondary line.
    await expect(outstanding).toHaveText(exp.lbp)
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText(exp.usd)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.screenshot({ path: 'screenshots/money-lbp-lbp-ar.png', fullPage: true })
  } finally {
    await ctx.close()
  }
})

test('3 · USD preference — USD leads; the LBP total still shows because it was recorded', async ({ browser }) => {
  test.setTimeout(120_000)
  await setPref('USD')
  const exp = await expectedOutstanding()
  const { ctx, page } = await ownerLogin(browser, 'en')
  try {
    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding).toHaveText(exp.usd)
    // USD-pref still surfaces the recorded LBP (honest, never hidden when it exists).
    await expect(page.getByTestId('money-outstanding-lbp')).toHaveText(exp.lbp)
  } finally {
    await ctx.close()
  }
})

/** Bulk-insert `n` OPEN, USD-only invoices ($1 each, no tax) mirroring newInvoice's
 *  shape (total_usd is trigger-computed), returning their ids. One POST, not n. */
async function bulkOpenInvoices(n: number): Promise<string[]> {
  const stamp = Date.now().toString(36)
  const body = Array.from({ length: n }, (_, k) => ({
    gym_id: gymId, student_id: studentId, invoice_type: 'other',
    invoice_number: `MOUT-${stamp}-${++invSeq}-${k}`,
    amount_usd: 1, amount_lbp: 0, tax_rate: 0, exchange_rate: RATE,
    status: 'pending', due_date: new Date().toISOString().slice(0, 10),
  }))
  const r = await svc('invoices', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`bulk invoices → ${r.status} ${await r.text()}`)
  return ((await r.json()) as Array<{ id: string }>).map((x) => x.id)
}

/** Bulk-insert `perInvoice` small USD partial payments on each id. One POST. */
async function bulkPartials(ids: string[], perInvoice: number): Promise<void> {
  const body = ids.flatMap((id) =>
    Array.from({ length: perInvoice }, () => ({
      invoice_id: id, student_id: studentId, amount_usd: 0.1, amount_lbp: 0,
      payment_method: 'cash_usd', payment_date: new Date().toISOString(),
    })),
  )
  const r = await svc('payments', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`bulk payments → ${r.status} ${await r.text()}`)
}

/**
 * MONEY-OUTSTANDING — the permanent regression for the silently-truncated drawer.
 *
 * The old /money read was `invoices … .limit(500)` (no ORDER BY) feeding
 * `payments … .in(ids)` (no limit → PostgREST capped it at max_rows=1000, no ORDER BY),
 * netted in JS. Past either cap the number was an ARBITRARY subset: dropped invoices
 * made it read LOW (measured −$21 at 521 open invoices) and dropped payments made it
 * read HIGH — the shape of the original $20-partial flake.
 *
 * This seeds PAST BOTH caps in the hermetic gym — 520 extra open invoices, each with
 * two partial payments (1040 payments) — on top of the beforeAll's i5 partial, and
 * asserts the rendered outstanding equals the COMPLETE, independently-paged oracle to
 * the cent. On the old code the two diverge; on get_gym_outstanding (000109) they match
 * because the aggregate has no row ceiling. The guard on the oracle's own counts keeps
 * this a real regression: if a future change stops crossing the caps, it fails loudly
 * rather than passing vacuously.
 */
test('4 · MONEY-OUTSTANDING — outstanding stays EXACT past both truncation caps', async ({ browser }) => {
  test.setTimeout(180_000)
  await setPref('USD')
  const ids = await bulkOpenInvoices(520)
  await bulkPartials(ids, 2)

  const exp = await expectedOutstanding()
  // This test is only meaningful if the data actually exceeds the old caps.
  expect(exp.invoiceCount, 'seeded past the invoices limit(500)').toBeGreaterThan(500)
  expect(exp.paymentCount, 'seeded past the payments max_rows(1000)').toBeGreaterThan(1000)

  const { ctx, page } = await ownerLogin(browser, 'en')
  try {
    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding, 'the outstanding read failed loud instead of rendering a number').toBeVisible({ timeout: 15_000 })
    // The whole point: the rendered total is the COMPLETE total, not a truncated one.
    await expect(outstanding).toHaveText(exp.usd)
    // The error state must NOT be showing — a green number here is the real assertion.
    await expect(page.getByTestId('money-outstanding-error')).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

/**
 * MONEY-TALLY — the cash-drawer RPC (000108) is a SECURITY DEFINER function, so the
 * tenant boundary it takes off RLS's hands is its OWN to enforce. That gate is proven
 * here at the HTTP layer, where it is genuinely reachable — unlike the read's failure
 * path, which happens inside a server component and is pinned in
 * src/lib/billing/daily-tally.test.ts instead.
 *
 * The third case is the one worth having: the function takes a `p_gym_id`, but that
 * argument is an ASSERTION, not the scope. The scope is derived from the caller's own
 * session (get_user_gym_id()), because BILL-POLICY's lesson — a client-sent argument
 * silently shadows a server-derived default — would here be shadowing a tenant
 * boundary. Naming someone else's gym must fail, not re-scope.
 */
test('MONEY-TALLY · the drawer RPC fails closed, and its gym argument cannot re-scope it', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const callTally = (bearer: string | null, gym: string | null) =>
    fetch(`${URL}/rest/v1/rpc/get_daily_tally`, {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || KEY!,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_gym_id: gym, p_date: today }),
    })

  // (a) No session at all → refused. anon is never granted EXECUTE, so this is
  //     stopped by the grant itself, before the function body runs.
  const anon = await callTally(null, gymId)
  expect(anon.ok, 'an anonymous caller cannot read any gym cash drawer').toBeFalsy()
  expect([401, 403, 404]).toContain(anon.status)

  // (b) The gym's own staff → served, and the seeded LBP method is present.
  const tok = await ownerToken()
  const mine = await callTally(tok, gymId)
  expect(mine.status, 'the gym owner reads their own drawer').toBe(200)
  const rows = (await mine.json()) as { payment_method: string; usd: number; lbp: number }[]
  expect(rows.some((r) => r.payment_method === 'cash_lbp'), 'the seeded cash_lbp collections are tallied').toBe(true)

  // (c) The SAME staff token naming a DIFFERENT gym → refused, not silently
  //     re-scoped and not answered with the caller's own gym. A uuid that belongs to
  //     nobody is the sharpest form of the test: the only thing that can reject it is
  //     the assertion itself.
  const other = await callTally(tok, '00000000-0000-4000-8000-000000000000')
  expect(other.status, 'the p_gym_id argument is an assertion, never the scope').toBe(403)
  expect(await other.text()).toContain('cash drawer')
})
