import { test, expect } from '@playwright/test'

/**
 * MONEY-OUTSTANDING — the permanent regression for the silently-truncated drawer.
 *
 * The old /money outstanding read was `invoices … .limit(500)` (no ORDER BY) feeding
 * `payments … .in(ids)` (no limit → PostgREST capped it at max_rows=1000, no ORDER BY),
 * netted in JS. Past either cap the number was an ARBITRARY subset: dropped invoices made
 * it read LOW (MEASURED −$21 at 521 open invoices), dropped payments made it read HIGH
 * (the original $20-partial flake). get_gym_outstanding (000109) removes the whole class
 * by aggregating in SQL with no row ceiling.
 *
 * This lives in its OWN hermetic gym, ISOLATED from money-lbp: the heavy seed (520 open
 * invoices) must not perturb any sibling's RLS reads. It crosses the invoices cap
 * deterministically — every extra invoice owes a positive $1, and 20 of them are
 * part-paid so partial-netting is exercised — and asserts the rendered total equals the
 * COMPLETE, independently-paged oracle to the cent. On the old code the two diverge (the
 * arbitrary 500 kept drops ~20 owing invoices); on the RPC they match. The count guard
 * keeps it a real regression: if a change stops crossing the cap it fails loudly, not
 * vacuously. The complete oracle nets EVERY payment, so a payment-side truncation would
 * surface here as a mismatch just the same.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `moneyout-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const RATE = 89000
const EXTRA = 520 // > the invoices limit(500)

let gymId = ''
let studentId = ''
let seededIds: string[] = []

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
async function svcGet(path: string): Promise<any[]> {
  const r = await svc(path)
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}
const grp = (n: number) => Number(n).toLocaleString('en-US')

/** Page through PostgREST past its max_rows cap (config.toml: 1000) so the oracle is
 *  COMPLETE — the property the app's old read lacked. `path` must carry a stable
 *  `&order=` for offset paging. */
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

/** Outstanding (USD) computed COMPLETELY + INDEPENDENTLY of the app: every open invoice
 *  and every one of this gym's payments, paged past max_rows, netted with the SAME clamps
 *  the app uses (balanceUsd <0.01→0). Returns the USD string and the invoice count. */
async function completeOutstanding(): Promise<{ usd: string; invoiceCount: number }> {
  const invs = await svcGetAll(`invoices?gym_id=eq.${gymId}&status=in.(pending,partial,overdue)&select=id,total_usd&order=id`)
  const pays = await svcGetAll(`payments?select=invoice_id,amount_usd,invoices!inner(gym_id)&invoices.gym_id=eq.${gymId}&order=id`)
  const pu = new Map<string, number>()
  for (const p of pays) pu.set(p.invoice_id, (pu.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  let u = 0
  for (const i of invs) {
    const bu = Number(i.total_usd ?? 0) - (pu.get(i.id) ?? 0)
    if (bu >= 0.01) u += Math.round(bu * 100) / 100
  }
  u = Math.round(u * 100) / 100
  return { usd: `$${u.toFixed(2)}`, invoiceCount: invs.length }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('MONEY-OUTSTANDING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) → ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  studentId = ((await (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as Array<{ id: string }>)[0].id
  await svc(`gyms?id=eq.${gymId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ currency_preference: 'USD' }) })

  // 520 open $1 invoices (total_usd is trigger-computed, so mirror the shape seed uses).
  const stamp = Date.now().toString(36)
  const invBody = Array.from({ length: EXTRA }, (_, k) => ({
    gym_id: gymId, student_id: studentId, invoice_type: 'other',
    invoice_number: `MOUT-${stamp}-${k}`,
    amount_usd: 1, amount_lbp: 0, tax_rate: 0, exchange_rate: RATE,
    status: 'pending', due_date: new Date().toISOString().slice(0, 10),
  }))
  const invRes = await svc('invoices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(invBody) })
  if (!invRes.ok) throw new Error(`bulk invoices → ${invRes.status} ${await invRes.text()}`)
  seededIds = ((await invRes.json()) as Array<{ id: string }>).map((x) => x.id)

  // 20 partials ($0.10) — exercise per-invoice netting without a >1000-payment set.
  const payBody = seededIds.slice(0, 20).map((id) => ({
    invoice_id: id, student_id: studentId, amount_usd: 0.1, amount_lbp: 0,
    payment_method: 'cash_usd', payment_date: new Date().toISOString(),
  }))
  const payRes = await svc('payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payBody) })
  if (!payRes.ok) throw new Error(`bulk payments → ${payRes.status} ${await payRes.text()}`)
})

test.afterAll(async () => {
  // Good citizen: drop the heavy seed from the shared tables (payments before invoices).
  for (let i = 0; i < seededIds.length; i += 100) {
    const chunk = seededIds.slice(i, i + 100).join(',')
    await svc(`payments?invoice_id=in.(${chunk})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  for (let i = 0; i < seededIds.length; i += 100) {
    const chunk = seededIds.slice(i, i + 100).join(',')
    await svc(`invoices?id=in.(${chunk})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
})

test('outstanding stays EXACT past the invoices truncation cap', async ({ browser }) => {
  test.setTimeout(120_000)
  const exp = await completeOutstanding()
  expect(exp.invoiceCount, 'seeded past the invoices limit(500)').toBeGreaterThan(500)

  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
    await page.locator('#password').fill(PW)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })

    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })
    const outstanding = page.getByTestId('money-outstanding')
    await expect(outstanding, 'the outstanding read failed loud instead of rendering a number').toBeVisible({ timeout: 15_000 })
    // The rendered total is the COMPLETE total, not a truncated one.
    await expect(outstanding).toHaveText(exp.usd)
    await expect(page.getByTestId('money-outstanding-error')).toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
