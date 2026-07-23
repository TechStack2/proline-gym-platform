import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * MEMBER-360-ACTIONABLE — the §2.1 drillability contract, proven BEHAVIORALLY
 * (≤2-tap violations are defects, not polish):
 *  (a) strip Balance-due → the billing aging ledger → Collect opens the pay
 *      modal PRE-FILLED with the oldest open invoice (tap 2 = confirm);
 *  (b) a queue row acts in ONE tap (invoice row → wa.me reminder link; renewal
 *      row → Collect&renew pre-filled with the renewal invoice);
 *  (d) the lifecycle Next-bill fact drills to the pre-filled collect flow;
 *  (c) a guardian decomposition row → the child's file with the collect modal
 *      pre-filled on the child's oldest invoice, payer already stamped to the
 *      guardian (000037 issuance semantics — no client arg involved).
 *
 * HERMETIC own gym (the heavy-seed lesson): all fixtures live in m360a-<w>,
 * never a shared worker gym.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `m360a-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

let gymId = ''
let studentId = ''
let agedInvoiceId = '' // $70, due 15 days ago → strip/ledger/queue driver
let renewalInvoiceId = '' // $60, the registration's open renewal → (b)/(d)

const iso = (daysFromToday: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromToday)
  return d.toISOString().slice(0, 10)
}

async function svcPost(path: string, body: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`)
  const rows = (await r.json()) as any[]
  return rows[0]
}
async function svcGet(path: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}

let invSeq = 0
async function newInvoice(amountUsd: number, dueDaysAgo: number, forStudent = studentId, payerProfileId: string | null = null): Promise<string> {
  invSeq += 1
  const row = await svcPost('invoices', {
    gym_id: gymId, student_id: forStudent, invoice_type: 'class_registration',
    invoice_number: `INV-M360A-${SLUG}-${String(invSeq).padStart(4, '0')}`,
    amount_usd: amountUsd, tax_rate: 0, status: 'pending',
    due_date: iso(-dueDaysAgo), exchange_rate: 89000,
    ...(payerProfileId ? { payer_profile_id: payerProfileId } : {}),
  })
  return row.id
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
  if (!URL || !KEY) throw new Error('M360A needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) → ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string

  // Idempotent across local re-runs: clear THIS spec's fixtures first (the
  // hermetic gym persists; uq_class_reg_open would 409 a second seed).
  const mine = await svcGet(`invoices?gym_id=eq.${gymId}&invoice_number=like.INV-M360A-*&select=id`)
  if (mine.length) {
    const ids = mine.map((i) => i.id).join(',')
    await fetch(`${URL}/rest/v1/renewal_invoices?invoice_id=in.(${ids})`, { method: 'DELETE', headers: H })
    await fetch(`${URL}/rest/v1/payments?invoice_id=in.(${ids})`, { method: 'DELETE', headers: H })
    await fetch(`${URL}/rest/v1/invoices?id=in.(${ids})`, { method: 'DELETE', headers: H })
  }
  const RUN_NAME = 'M360A Fixture'
  const oldStu = await svcGet(`students?gym_id=eq.${gymId}&select=id,profiles!inner(first_name_en)&profiles.first_name_en=eq.M360A`)
  for (const o of oldStu) {
    await fetch(`${URL}/rest/v1/class_registrations?student_id=eq.${o.id}`, { method: 'DELETE', headers: H })
  }
  // A FRESH member (no inherited seed invoices → deterministic strip totals),
  // with a phone so the wa.me 1-tap renders.
  if (oldStu.length) {
    studentId = oldStu[0].id
  } else {
    const prof = await svcPost('profiles', {
      id: crypto.randomUUID(), gym_id: gymId, first_name_en: 'M360A', last_name_en: 'Fixture',
      first_name_ar: 'م٣٦٠', last_name_ar: 'تجربة', phone: '+96171999888', locale: 'en',
    })
    const stuRow = await svcPost('students', {
      profile_id: prof.id, gym_id: gymId, is_active: true, join_date: iso(-100), current_belt_rank: 'white',
    })
    studentId = stuRow.id
  }
  void RUN_NAME

  // The aged open invoice: $70 due 15 days ago (d1_30 bucket; > the 7d queue rule).
  agedInvoiceId = await newInvoice(70, 15)

  // An ACTIVE registration whose renewal is overdue, with its open renewal
  // invoice mapped through renewal_invoices — the (b)/(d) collect target.
  const [cls] = await svcGet(`classes?gym_id=eq.${gymId}&select=id&limit=1`)
  const reg = await svcPost('class_registrations', {
    gym_id: gymId, student_id: studentId, class_id: cls.id, status: 'active',
    monthly_fee_usd: 60, start_date: iso(-40), billing_anchor: iso(-40),
    paid_until: iso(-5), requested_at: new Date(Date.now() - 40 * 864e5).toISOString(),
  })
  renewalInvoiceId = await newInvoice(60, 5)
  await svcPost('renewal_invoices', {
    product_type: 'class_registration', product_id: reg.id, invoice_id: renewalInvoiceId,
    period_start: iso(-5), period_end: iso(25),
  })
})

test('M360A · (a)+(b)+(d) — strip → ledger → pre-filled collect; queue rows act in one tap; next-bill drills pre-filled', async ({ browser }) => {
  test.setTimeout(150_000)
  const { ctx, page } = await ownerLogin(browser)
  try {
    await page.goto(`/en/students/${studentId}`, { waitUntil: 'domcontentloaded' })

    // §3.1 — the strip states the balance with the oldest age chip. The total is
    // computed from the ledger the same way the app does (a registration insert
    // may auto-issue a first-cycle invoice — the DB, not the spec, is the oracle).
    const open = await svcGet(`invoices?student_id=eq.${studentId}&status=in.(pending,partial,overdue)&select=id,total_usd`)
    const opays = open.length ? await svcGet(`payments?invoice_id=in.(${open.map((i) => i.id).join(',')})&select=invoice_id,amount_usd`) : []
    const opaid = new Map<string, number>()
    for (const pRow of opays) opaid.set(pRow.invoice_id, (opaid.get(pRow.invoice_id) ?? 0) + Number(pRow.amount_usd ?? 0))
    let expectedBalance = 0
    for (const i of open) { const b = Number(i.total_usd ?? 0) - (opaid.get(i.id) ?? 0); if (b >= 0.01) expectedBalance += Math.round(b * 100) / 100 }
    const balance = vis(page, '[data-testid="m360-strip-balance"]').first()
    await expect(balance).toBeVisible({ timeout: 20_000 })
    await expect(balance, 'strip balance = the complete open ledger').toContainText(`$${expectedBalance.toFixed(2)}`)
    await expect(balance, 'oldest-age chip').toContainText('15')

    // (a) tap 1: strip → the aging ledger (billing card anchor).
    await balance.click()
    await expect(page).toHaveURL(/#panel-billing/)
    const ledger = vis(page, '[data-testid="m360-aging-ledger"]').first()
    await expect(ledger).toBeVisible()
    const agedRow = ledger.locator('[data-testid="member-invoice-row"]').first()
    await expect(agedRow, 'ledger is oldest-due-first').toHaveAttribute('data-bucket', 'd1_30')

    // (a) tap 2 target: Collect on the OLDEST row opens the pay modal PRE-FILLED.
    await agedRow.locator('[data-testid="ledger-collect"]').click()
    const modal = vis(page, '[data-testid="m360-pay-modal"]').first()
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await expect(modal.locator('[data-testid="m360-pay-invoice"]'), 'oldest invoice pre-selected').toHaveValue(agedInvoiceId)
    await expect(modal.locator('[data-testid="m360-pay-amount"]'), 'amount pre-filled — tap 2 is confirm, never search-again').toHaveValue('70.00')
    await page.keyboard.press('Escape')

    // (b) §3.2 — the queue is present and its rows carry their action directly.
    const queue = vis(page, '[data-testid="m360-attention"]').first()
    await expect(queue).toBeVisible()
    const invoiceRow = queue.locator('[data-testid="m360-attention-row"][data-kind="invoice"]').first()
    await expect(invoiceRow).toBeVisible()
    // One tap = the wa.me reminder link right on the row (seeded member has a phone).
    const remindHref = await invoiceRow.locator('[data-testid="invoice-row-wa-remind"]').getAttribute('href')
    expect(remindHref, 'queue reminder is a 1-tap wa.me handoff').toContain('wa.me')

    const renewalRow = queue.locator('[data-testid="m360-attention-row"][data-kind="renewal"]').first()
    await expect(renewalRow, 'overdue renewal queues').toBeVisible()
    const collectRenew = renewalRow.locator('[data-testid="queue-collect-renew"]')
    await expect(collectRenew, '1-tap Collect&renew targets the renewal invoice').toHaveAttribute('href', new RegExp(`pay=${renewalInvoiceId}`))
    await collectRenew.click()
    await expect(vis(page, '[data-testid="m360-pay-modal"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="m360-pay-invoice"]:visible'), 'renewal invoice pre-selected').toHaveValue(renewalInvoiceId)
    await page.keyboard.press('Escape')

    // (d) §3.3 — the registration's Next-bill fact drills to the SAME pre-filled
    // flow. Fresh navigation first: after (b) the URL already carries this exact
    // ?pay= target, and a same-URL Link click is a no-op by Next router contract.
    await page.goto(`/en/students/${studentId}`, { waitUntil: 'domcontentloaded' })
    const nextBill = vis(page, '[data-testid="reg-lifecycle"]').first().locator('[data-testid="fact-next-bill"]')
    await expect(nextBill).toHaveAttribute('href', new RegExp(`pay=${renewalInvoiceId}`))
    await nextBill.click()
    const modal3 = vis(page, '[data-testid="m360-pay-modal"]').first()
    await expect(modal3).toBeVisible({ timeout: 15_000 })
    await expect(modal3.locator('[data-testid="m360-pay-invoice"]'), 'next-bill lands pre-filled').toHaveValue(renewalInvoiceId)
    await expect(modal3.locator('[data-testid="m360-pay-amount"]')).toHaveValue('60.00')
  } finally {
    await ctx.close()
  }
})

test('M360A · (c) — guardian decomposition row → child billing with the payer pre-scoped; family-collect stat is a 1-tap door', async ({ browser }) => {
  test.setTimeout(150_000)
  // A guardian family: the seeded WL gym ships a primary-contact guardian with
  // linked kids; give one kid an aged invoice PAYER-STAMPED to the guardian
  // (what 000037 issuance does for every linked minor).
  const [guardian] = await svcGet(`guardians?gym_id=eq.${gymId}&select=id,profile_id&order=is_primary_contact.desc&limit=1`)
  const kidLinks = await svcGet(`guardian_students?guardian_id=eq.${guardian.id}&select=student_id`)
  expect(kidLinks.length, 'seeded guardian has dependents').toBeGreaterThan(0)
  const kidId = kidLinks[0].student_id
  const kidInvoiceId = await newInvoice(45, 21, kidId, guardian.profile_id)

  const { ctx, page } = await ownerLogin(browser)
  try {
    await page.goto(`/en/students/guardians/${guardian.id}`, { waitUntil: 'domcontentloaded' })

    // §4.1 — the family-balance stat is the 1-tap door into the pre-scoped flow.
    const stat = vis(page, '[data-testid="guardian-family-collect-stat"]').first()
    await expect(stat).toBeVisible({ timeout: 20_000 })
    await stat.click()
    const dialog = vis(page, '[data-testid="family-collect-dialog"]').first()
    await expect(dialog).toBeVisible()
    const rows = dialog.locator('[data-testid="family-collect-row"]')
    await expect(rows.first(), 'oldest obligation first (the 21d fixture)').toHaveAttribute('data-invoice-id', kidInvoiceId)
    await expect(rows.first(), 'and pre-selected').toHaveAttribute('data-checked', 'true')
    const kidOpen = await svcGet(`invoices?student_id=eq.${kidId}&status=in.(pending,partial,overdue)&select=id,total_usd`)
    const kidPays = kidOpen.length ? await svcGet(`payments?invoice_id=in.(${kidOpen.map((i) => i.id).join(',')})&select=invoice_id,amount_usd`) : []
    const paid = new Map<string, number>()
    for (const pRow of kidPays) paid.set(pRow.invoice_id, (paid.get(pRow.invoice_id) ?? 0) + Number(pRow.amount_usd ?? 0))
    let expectedTotal = 0
    for (const i of kidOpen) { const b = Number(i.total_usd ?? 0) - (paid.get(i.id) ?? 0); if (b >= 0.01) expectedTotal += Math.round(b * 100) / 100 }
    await expect(dialog.locator('[data-testid="family-collect-total"]'), 'total = the family balance (computed from the ledger)').toContainText(`$${expectedTotal.toFixed(2)}`)
    await page.keyboard.press('Escape')

    // §4.2 — the decomposition row drills into the child's file, collect modal
    // pre-filled on the child's oldest invoice; the payer is ALREADY the guardian.
    const ledgerRow = vis(page, `[data-testid="family-ledger-row"][data-student-id="${kidId}"]`).first()
    await expect(ledgerRow).toBeVisible()
    await expect(ledgerRow, 'the oldest-age chip drives the row').toContainText('21')
    await ledgerRow.locator('[data-testid="family-ledger-collect"]').click()
    await expect(page).toHaveURL(new RegExp(`/students/${kidId}\\?pay=${kidInvoiceId}`), { timeout: 15_000 })
    const modal = vis(page, '[data-testid="m360-pay-modal"]').first()
    await expect(modal).toBeVisible({ timeout: 20_000 })
    await expect(modal.locator('[data-testid="m360-pay-invoice"]'), 'child oldest invoice pre-selected').toHaveValue(kidInvoiceId)
    await expect(modal.locator('[data-testid="m360-pay-amount"]')).toHaveValue('45.00')
    // payer pre-scoped: the ledger states the payer on the invoice row itself.
    await page.keyboard.press('Escape')
    await expect(vis(page, '[data-testid="member-invoice-row"]').first().locator('[data-testid="invoice-payer"]'),
      'the invoice is payer-stamped to the guardian — no client arg involved').toBeVisible()
  } finally {
    await ctx.close()
  }
})
