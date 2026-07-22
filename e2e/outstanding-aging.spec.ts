import { test, expect } from '@playwright/test'

/**
 * OUTSTANDING-AGING — the permanent regression for the silently-truncated aging grid.
 *
 * The old getOutstandingAging read `invoices … .limit(2000)` (no ORDER BY) feeding
 * `payments … .in(ids)` (no limit → PostgREST max_rows=1000), then bucketed in JS. Past
 * 2000 open invoices the buckets silently dropped invoices (MEASURED: at 2101 open
 * invoices the app read current $554.50 / $500 / $500 / $500 vs the complete $580.50 /
 * $525 / $525 / $525 — every bucket LOW). get_gym_outstanding_aging (000110) buckets in
 * SQL with no row ceiling.
 *
 * Its OWN hermetic gym, isolated from money-lbp/money-outstanding: the heavy seed (2100
 * open invoices, spread across all four buckets, 40 part-paid) must not perturb any
 * sibling's RLS reads. Every rendered bucket is asserted == a COMPLETE, independently-
 * PAGED oracle to the cent; a count guard (> 2000) keeps it from passing vacuously. The
 * complete oracle nets EVERY payment, so a payment-side truncation would surface here as
 * a mismatch just the same.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `aging-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const RATE = 89000
const EXTRA = 2100 // > the invoices limit(2000)
const BUCKETS = ['current', 'd1_30', 'd31_60', 'd60_plus'] as const

// Day offsets from today, one per bucket, chosen well away from the ≤30 / ≤60 boundaries
// so a ±1-day clock difference between the JS oracle and SQL current_date can't reclass.
const OFFSET: Record<(typeof BUCKETS)[number], number> = { current: 5, d1_30: -15, d31_60: -45, d60_plus: -90 }

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
const iso = (offsetDays: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}
const todayUTC = () => new Date().toISOString().slice(0, 10)

/** Bucket a due_date the SAME way get_gym_outstanding_aging does (due≥today→current,
 *  else ≤30 / ≤60 / 60+), against a fixed `today`. */
function bucketOf(due: string, today: string): (typeof BUCKETS)[number] {
  if (due >= today) return 'current'
  const days = Math.floor((new Date(today + 'T12:00:00Z').getTime() - new Date(due + 'T12:00:00Z').getTime()) / 864e5)
  return days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : 'd60_plus'
}

/** Per-bucket outstanding USD computed COMPLETELY + INDEPENDENTLY of the app: every open
 *  invoice and every payment, paged past max_rows, netted + bucketed exactly as the RPC
 *  (raw bal, skip ≤0.005). Returns `$x.xx` per bucket + the total invoice count. */
async function completeAging(): Promise<{ usd: Record<string, string>; invoiceCount: number }> {
  const today = todayUTC()
  const invs = await svcGetAll(`invoices?gym_id=eq.${gymId}&status=in.(pending,partial,overdue)&select=id,total_usd,due_date&order=id`)
  const pays = await svcGetAll(`payments?select=invoice_id,amount_usd,invoices!inner(gym_id)&invoices.gym_id=eq.${gymId}&order=id`)
  const paid = new Map<string, number>()
  for (const p of pays) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount_usd ?? 0))
  const sum: Record<string, number> = { current: 0, d1_30: 0, d31_60: 0, d60_plus: 0 }
  for (const i of invs) {
    const bal = Number(i.total_usd ?? 0) - (paid.get(i.id) ?? 0)
    if (bal <= 0.005) continue
    sum[bucketOf(String(i.due_date), today)] += bal
  }
  const usd: Record<string, string> = {}
  for (const k of BUCKETS) usd[k] = `$${(Math.round(sum[k] * 100) / 100).toFixed(2)}`
  return { usd, invoiceCount: invs.length }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('OUTSTANDING-AGING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) → ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  studentId = ((await (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as Array<{ id: string }>)[0].id
  await svc(`gyms?id=eq.${gymId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ currency_preference: 'USD' }) })

  // 2100 open $1 invoices, due dates cycling across all four buckets (total_usd is
  // trigger-computed, so mirror newInvoice's shape).
  const stamp = Date.now().toString(36)
  const invBody = Array.from({ length: EXTRA }, (_, k) => ({
    gym_id: gymId, student_id: studentId, invoice_type: 'other',
    invoice_number: `AGE-${stamp}-${k}`,
    amount_usd: 1, amount_lbp: 0, tax_rate: 0, exchange_rate: RATE,
    status: 'pending', due_date: iso(OFFSET[BUCKETS[k % 4]]),
  }))
  const invRes = await svc('invoices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(invBody) })
  if (!invRes.ok) throw new Error(`bulk invoices → ${invRes.status} ${await invRes.text()}`)
  seededIds = ((await invRes.json()) as Array<{ id: string }>).map((x) => x.id)

  // 40 partials ($0.10) — exercise per-invoice netting inside the buckets. Light.
  const payBody = seededIds.slice(0, 40).map((id) => ({
    invoice_id: id, student_id: studentId, amount_usd: 0.1, amount_lbp: 0,
    payment_method: 'cash_usd', payment_date: new Date().toISOString(),
  }))
  const payRes = await svc('payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payBody) })
  if (!payRes.ok) throw new Error(`bulk payments → ${payRes.status} ${await payRes.text()}`)
})

test.afterAll(async () => {
  for (let i = 0; i < seededIds.length; i += 100) {
    const chunk = seededIds.slice(i, i + 100).join(',')
    await svc(`payments?invoice_id=in.(${chunk})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  for (let i = 0; i < seededIds.length; i += 100) {
    const chunk = seededIds.slice(i, i + 100).join(',')
    await svc(`invoices?id=in.(${chunk})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
})

test('aging buckets stay EXACT past the invoices truncation cap', async ({ browser }) => {
  test.setTimeout(180_000)
  const exp = await completeAging()
  expect(exp.invoiceCount, 'seeded past the invoices limit(2000)').toBeGreaterThan(2000)

  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
    await page.locator('#password').fill(PW)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })

    await page.goto('/en/money', { waitUntil: 'domcontentloaded' })
    // The aging read failed loud instead of rendering buckets?
    await expect(page.getByTestId('aging-error')).toHaveCount(0)
    const grid = page.getByTestId('aging-grid')
    await expect(grid).toBeVisible({ timeout: 20_000 })

    for (const b of BUCKETS) {
      const usd = grid.locator(`[data-testid="aging-bucket"][data-bucket="${b}"] [data-testid="aging-usd"]`)
      await expect(usd, `bucket ${b} must be the COMPLETE total, not a truncated one`).toHaveText(exp.usd[b])
    }
  } finally {
    await ctx.close()
  }
})
