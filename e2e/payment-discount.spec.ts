import { test, expect, type Browser } from '@playwright/test'

/**
 * DISCOUNT — payment-time discount (finding 16). Hermetic OWN gym (seed_e2e_wl_gym).
 *   R1  %↔value toggle: entering % computes the $ (and the new due) and vice-versa;
 *       the over-due entry is blocked client-side (submit disabled).
 *   R2  the receipt shows full price − discount = net; the drawer tally counts the NET
 *       cash (payments.amount_usd), never the pre-discount total.
 *   R3/R4  the DB is authoritative: over-due is rejected server-side, and only an
 *       owner/receptionist may discount — a coach's RPC is refused (permission matrix).
 * /en + /ar screenshots of the discount UI + the receipt.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `discount-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''
let studentId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
/** Create a fresh pending, tax-free $amount invoice on the seeded member. */
async function newInvoice(amountUsd: number): Promise<string> {
  const res = await svc('invoices', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      gym_id: gymId, student_id: studentId, invoice_type: 'other',
      invoice_number: `DISC-${SLUG}-${Date.now()}-${Math.floor(performance.now())}`,
      amount_usd: amountUsd, amount_lbp: 0, tax_rate: 0, exchange_rate: 89000,
      status: 'pending', due_date: new Date().toISOString().slice(0, 10),
    }),
  })
  if (!res.ok) throw new Error(`invoice insert failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as Array<{ id: string }>)[0].id
}
async function token(email: string): Promise<string> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}
/** Call record_payment as a specific authenticated user (exercises the DB guards). */
async function rpcRecordPayment(bearer: string, body: Record<string, unknown>) {
  const r = await fetch(`${URL}/rest/v1/rpc/record_payment`, {
    method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) as { message?: string } }
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
  if (!URL || !KEY) throw new Error('DISCOUNT needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  const studs = (await (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`)).json()) as Array<{ id: string }>
  studentId = studs[0].id
  // A coach WITH a login in this gym (for the permission-matrix guard).
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email: `coach+${SLUG}@e2e.local`, password: PW, email_confirm: true }),
  })
  const coachId = ((await cr.json()) as { id: string }).id
  await svc('profiles', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: coachId, gym_id: gymId, first_name_ar: 'مدرب', first_name_en: 'Coach', first_name_fr: 'Coach', last_name_ar: 'تجريبي', last_name_en: 'DiscTest', last_name_fr: 'DiscTest' }),
  })
  await svc('user_roles', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: coachId, gym_id: gymId, role: 'coach' }) })
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('DISCOUNT · %↔value compute, over-due blocked, receipt line, net tally (en)', async ({ browser }) => {
  test.setTimeout(120_000)
  const invId = await newInvoice(100)
  const owner = await ownerLogin(browser, 'en')
  try {
    await owner.page.goto(`/en/invoices/${invId}`)
    await expect(owner.page.getByTestId('discount-section'), 'owner sees the discount affordance').toBeVisible({ timeout: 15_000 })

    // R1 — % mode: 10% of $100 → $10.00 off, new due $90.00.
    await owner.page.getByTestId('discount-input').fill('10')
    await expect(owner.page.getByTestId('discount-usd')).toHaveText('$10.00')
    await expect(owner.page.getByTestId('discount-due-after')).toHaveText('$90.00')
    // R1 — $ mode: $25 off → 25%, new due $75.00 (value → percent).
    await owner.page.getByTestId('discount-mode-value').click()
    await owner.page.getByTestId('discount-input').fill('25')
    await expect(owner.page.getByTestId('discount-pct')).toHaveText('25')
    await expect(owner.page.getByTestId('discount-due-after')).toHaveText('$75.00')
    await owner.page.screenshot({ path: 'screenshots/payment-discount-ui-en.png' })

    // R1 — over the balance → invalid + submit disabled (client guard).
    await owner.page.getByTestId('discount-input').fill('200')
    await expect(owner.page.getByTestId('discount-invalid')).toBeVisible()
    await expect(owner.page.getByTestId('pay-submit')).toBeDisabled()

    // Apply a real 10% ($10) discount and collect the new $90 due → paid.
    await owner.page.getByTestId('discount-mode-pct').click()
    await owner.page.getByTestId('discount-input').fill('10')
    await expect(owner.page.getByTestId('pay-amount-usd')).toHaveValue('90.00') // auto-set to new due
    await owner.page.getByTestId('pay-submit').click()

    // R2 — lands on the receipt: full price − discount = net.
    await expect(owner.page.getByTestId('receipt')).toBeVisible({ timeout: 20_000 })
    await expect(owner.page.getByTestId('receipt-price'), 'the pre-discount price shows').toHaveText(/100/)
    await expect(owner.page.getByTestId('receipt-discount'), 'the discount line shows −$10').toContainText('10')
    await expect(owner.page.getByTestId('receipt-total')).toContainText('90')
    await expect(owner.page.getByTestId('receipt-balance')).toContainText('0.00')
    await owner.page.screenshot({ path: 'screenshots/payment-discount-receipt-en.png' })

    // R2 — the invoice total dropped to the NET, and the recorded cash IS the net.
    const inv = (await (await svc(`invoices?id=eq.${invId}&select=total_usd,status`)).json()) as Array<{ total_usd: number; status: string }>
    expect(Number(inv[0].total_usd), 'total reduced to the discounted net').toBeCloseTo(90, 2)
    expect(inv[0].status).toBe('paid')
    const pays = (await (await svc(`payments?invoice_id=eq.${invId}&select=amount_usd`)).json()) as Array<{ amount_usd: number }>
    expect(pays.reduce((s, p) => s + Number(p.amount_usd), 0), 'the tally sums the NET cash ($90), not $100').toBeCloseTo(90, 2)

    // R2 — the drawer tally surface renders (it sums payments.amount_usd = the net).
    await owner.page.goto('/en/money')
    await expect(owner.page.getByTestId('money-tally'), 'the daily drawer tally renders').toBeVisible({ timeout: 15_000 })
    await expect(owner.page.getByTestId('money-tally')).toContainText('90')
  } finally {
    await owner.ctx.close()
  }
})

test('DISCOUNT · /ar discount UI + receipt discount line (RTL)', async ({ browser }) => {
  test.setTimeout(120_000)
  const invId = await newInvoice(100)
  const owner = await ownerLogin(browser, 'ar')
  try {
    await owner.page.goto(`/ar/invoices/${invId}`)
    await expect(owner.page.getByTestId('discount-section')).toBeVisible({ timeout: 15_000 })
    await owner.page.getByTestId('discount-input').fill('10')
    await expect(owner.page.getByTestId('discount-due-after')).toHaveText('$90.00')
    await owner.page.screenshot({ path: 'screenshots/payment-discount-ui-ar.png' })
    await owner.page.getByTestId('pay-submit').click()
    await expect(owner.page.getByTestId('receipt')).toBeVisible({ timeout: 20_000 })
    await expect(owner.page.getByTestId('receipt-discount')).toContainText('10')
    await owner.page.screenshot({ path: 'screenshots/payment-discount-receipt-ar.png' })
  } finally {
    await owner.ctx.close()
  }
})

test('DISCOUNT · DB guards — over-due rejected, coach cannot discount (permission matrix)', async () => {
  test.setTimeout(60_000)
  const invId = await newInvoice(100)

  // R3/R4 — over-due discount rejected at the DB even with a valid owner session.
  const ownerTok = await token(`owner+${SLUG}@e2e.local`)
  const over = await rpcRecordPayment(ownerTok, { p_invoice_id: invId, p_amount_usd: 1, p_discount_usd: 99999 })
  expect(over.status, 'DB rejects an over-the-due discount').toBeGreaterThanOrEqual(400)
  expect(over.body.message ?? '', 'the P0001 message surfaces verbatim').toMatch(/larger than the balance due/i)

  // R3/R4 — permission matrix: a coach (is_staff, can record a payment) may NOT discount.
  const coachTok = await token(`coach+${SLUG}@e2e.local`)
  const coach = await rpcRecordPayment(coachTok, { p_invoice_id: invId, p_amount_usd: 1, p_discount_usd: 5 })
  expect(coach.status, 'DB rejects a coach discount').toBeGreaterThanOrEqual(400)
  expect(coach.body.message ?? '', 'only owner/receptionist may discount').toMatch(/owner or receptionist/i)

  // Sanity: the invoice is untouched by the rejected calls (still pending, full total).
  const inv = (await (await svc(`invoices?id=eq.${invId}&select=total_usd,status`)).json()) as Array<{ total_usd: number; status: string }>
  expect(Number(inv[0].total_usd)).toBeCloseTo(100, 2)
  expect(inv[0].status).toBe('pending')
})
