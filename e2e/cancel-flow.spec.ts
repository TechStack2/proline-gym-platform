import { test, expect, type Page } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG, roleEmail, E2E_PASSWORD } from './roles'
import { vis } from './helpers'

/**
 * CANCEL-FLOW (R5).
 *  1. Cancel an UNPAID registration → the linked invoice is VOIDED (voided_at set,
 *     VOID stamp) + the roster spot is freed + it drops out of "owed".
 *  2. Cancel a PAID registration with the refund fork → a reversing NEGATIVE payment
 *     is recorded (both drawer tallies net to zero) + the invoice is voided.
 *  3. Standalone VOID of a wrong (unpaid) invoice → VOID status + reason + excluded
 *     from the outstanding balance.
 *  4. Permission — a receptionist CAN cancel (UI); a coach CANNOT (RPC rejects).
 *  5. Alias redirect is a 308 PERMANENT.
 * Seeds its own class/member (service role); drives the is_staff-gated actions
 * through the owner UI.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROXY_KEY = process.env.PROXY_HOST_SECRET || ''

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svc(method: string, path: string, body?: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}
/** A real per-role JWT via GoTrue password grant (the seed accounts) → drive the
 *  is_staff-gated RPCs directly (the app uses cookie sessions, not localStorage). */
async function tokenFor(role: 'owner' | 'coach' | 'reception'): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: roleEmail(role), password: E2E_PASSWORD }),
  })
  if (!res.ok) throw new Error(`token ${role} → ${res.status} ${await res.text()}`)
  return (await res.json()).access_token as string
}
function rpcAs(token: string, fn: string, args: any) {
  return fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
}

let gymId: string, disciplineId: string, coachId: string
test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('CANCEL-FLOW needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymId = (await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0].id
  disciplineId = (await svcGet(`disciplines?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
  coachId = (await svcGet(`coaches?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
})

async function seedClass(name: string, feeUsd: number): Promise<string> {
  const [cls] = await svc('POST', 'classes', {
    gym_id: gymId, discipline_id: disciplineId, coach_id: coachId,
    name_en: name, name_ar: name, name_fr: name, max_capacity: 20,
    monthly_fee_usd: feeUsd, monthly_fee_lbp: 0, is_active: true,
  })
  for (const d of [0, 1, 2, 3, 4, 5, 6]) await svc('POST', 'class_schedules', { class_id: cls.id, day_of_week: d, start_time: '18:00', end_time: '19:30', is_active: true })
  return cls.id
}
async function seedStudent(name: string): Promise<{ id: string; display: string }> {
  const [prof] = await svc('POST', 'profiles', {
    gym_id: gymId, first_name_en: name, first_name_ar: name, first_name_fr: name,
    last_name_en: 'Cx', last_name_ar: 'Cx', last_name_fr: 'Cx',
    phone: '+9617' + Math.floor(1000000 + Math.random() * 8999999), gender: 'male',
  })
  const [stu] = await svc('POST', 'students', { profile_id: prof.id, gym_id: gymId, current_belt_rank: 'white', belt_promotion_date: new Date().toISOString().slice(0, 10), is_active: true })
  return { id: stu.id, display: `${name} Cx` }
}
/** Walk-in register + approve on the class page (owner) → active + an invoice. */
async function registerAndApprove(page: Page, classId: string, display: string) {
  await page.goto(`/en/classes/${classId}`)
  const opt = await page.locator('[data-testid="walkin-student"] option', { hasText: display }).first().getAttribute('value')
  await vis(page, '[data-testid="walkin-student"]').selectOption(opt!)
  await vis(page, '[data-testid="walkin-register-btn"]').click()
  const row = vis(page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: display }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.getByTestId('approve-btn').click()
  await expect(vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: display }).first()).toBeVisible({ timeout: 15_000 })
}
const regInvoice = (stuId: string) =>
  svcGet(`invoices?student_id=eq.${stuId}&invoice_type=eq.class_registration&order=created_at.desc&limit=1&select=id,status,voided_at,void_reason,total_usd`)

test('1 · cancel an UNPAID registration → invoice VOIDED + roster freed + not owed', async ({ browser }) => {
  test.setTimeout(120_000)
  const classId = await seedClass(`CXunpaid ${Date.now()}`, 40)
  const stu = await seedStudent(`CXu${Date.now().toString().slice(-5)}`)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await registerAndApprove(page, classId, stu.display)
    const inv0 = (await regInvoice(stu.id))[0]
    expect(inv0?.id, 'an unpaid registration invoice exists').toBeTruthy()
    expect(inv0.voided_at, 'not voided yet').toBeNull()

    // Cancel via the reason dialog.
    await vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
      .getByTestId('cancel-reg-btn').click()
    const dlg = vis(page, '[data-testid="cancel-reg-dialog"]').first()
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    await dlg.getByTestId('reason-chip').filter({ hasText: 'Wrong class' }).first().click()
    await dlg.getByTestId('reason-confirm').click()

    // The registration leaves the active list…
    await expect(vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }))
      .toHaveCount(0, { timeout: 15_000 })
    // …the roster spot is freed (class_enrollments deactivated)…
    await expect.poll(async () => {
      const en = await svcGet(`class_enrollments?class_id=eq.${classId}&student_id=eq.${stu.id}&select=is_active`)
      return en[0]?.is_active
    }, { timeout: 10_000 }).toBe(false)
    // …and the invoice is VOIDED (never deleted — keeps its number) + no longer owed.
    const inv1 = (await regInvoice(stu.id))[0]
    expect(inv1.id, 'same invoice row — not deleted (numbering continuous)').toBe(inv0.id)
    expect(inv1.voided_at, 'invoice voided').not.toBeNull()
    expect(inv1.status).toBe('cancelled')
    expect(inv1.void_reason).toContain('Wrong class')
  } finally { await ctx.close() }
})

test('2 · cancel a PAID registration with refund → reversing payment nets the drawers + void', async ({ browser }) => {
  test.setTimeout(120_000)
  const classId = await seedClass(`CXpaid ${Date.now()}`, 30)
  const stu = await seedStudent(`CXp${Date.now().toString().slice(-5)}`)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await registerAndApprove(page, classId, stu.display)
    const inv0 = (await regInvoice(stu.id))[0]
    // Pay it in full via the owner's own JWT (deterministic — no payment-form flake).
    const payRes = await rpcAs(await tokenFor('owner'), 'record_payment', { p_invoice_id: inv0.id, p_amount_usd: inv0.total_usd })
    expect(payRes.ok, `payment recorded (${payRes.status})`).toBeTruthy()
    const paid0 = (await svcGet(`payments?invoice_id=eq.${inv0.id}&select=amount_usd`)).reduce((s: number, p: any) => s + Number(p.amount_usd), 0)
    expect(paid0, 'a positive payment stands').toBeGreaterThan(0)

    // Cancel WITH refund.
    await page.goto(`/en/classes/${classId}`)
    await vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
      .getByTestId('cancel-reg-btn').click()
    const dlg = vis(page, '[data-testid="cancel-reg-dialog"]').first()
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    await dlg.getByTestId('reason-text').fill('signed to the wrong service')
    await dlg.getByTestId('reason-refund').check()
    await dlg.getByTestId('reason-confirm').click()
    await expect(vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }))
      .toHaveCount(0, { timeout: 15_000 })

    // The payments NET to zero (reversing negative payment) → both drawer tallies net.
    await expect.poll(async () => {
      const rows = await svcGet(`payments?invoice_id=eq.${inv0.id}&select=amount_usd`)
      return Math.round(rows.reduce((s: number, p: any) => s + Number(p.amount_usd), 0) * 100) / 100
    }, { timeout: 10_000 }).toBe(0)
    const inv1 = (await regInvoice(stu.id))[0]
    expect(inv1.voided_at, 'refunded invoice is voided').not.toBeNull()
  } finally { await ctx.close() }
})

test('3 · standalone VOID of a wrong unpaid invoice → VOID stamp + reason + not owed', async ({ browser }) => {
  test.setTimeout(120_000)
  const classId = await seedClass(`CXstand ${Date.now()}`, 25)
  const stu = await seedStudent(`CXs${Date.now().toString().slice(-5)}`)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await registerAndApprove(page, classId, stu.display)
    const inv0 = (await regInvoice(stu.id))[0]
    await page.goto(`/en/invoices/${inv0.id}`)
    await vis(page, '[data-testid="void-btn"]').click()
    const dlg = vis(page, '[data-testid="reason-dialog"]').first()
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    await dlg.getByTestId('reason-chip').filter({ hasText: 'Wrong invoice' }).first().click()
    await dlg.getByTestId('reason-confirm').click()
    await expect(vis(page, '[data-testid="invoice-status"]')).toHaveText(/Void/i, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="invoice-void-reason"]')).toContainText('Wrong invoice')
    const inv1 = (await regInvoice(stu.id))[0]
    expect(inv1.voided_at).not.toBeNull()
  } finally { await ctx.close() }
})

test('4 · permission — a receptionist can cancel; a coach cannot', async ({ browser }) => {
  test.setTimeout(120_000)
  const classId = await seedClass(`CXperm ${Date.now()}`, 20)
  const stu = await seedStudent(`CXperm${Date.now().toString().slice(-5)}`)

  // Register+approve as owner, capture the reg id.
  const octx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const opage = await octx.newPage()
  await registerAndApprove(opage, classId, stu.display)
  const reg = (await svcGet(`class_registrations?student_id=eq.${stu.id}&class_id=eq.${classId}&select=id&limit=1`))[0]
  await octx.close()

  // Coach NO — call the RPC with the coach's own JWT → rejected (owner/reception only).
  const coachRes = await rpcAs(await tokenFor('coach'), 'cancel_class_registration', { p_reg_id: reg.id, p_reason: 'coach attempt' })
  expect(coachRes.ok, `a coach is NOT authorized to cancel (got ${coachRes.status})`).toBeFalsy()
  // Sanity: the registration is STILL active (the coach's call didn't take effect).
  expect((await svcGet(`class_registrations?id=eq.${reg.id}&select=status`))[0].status).toBe('active')

  // Reception YES — cancels via the UI.
  const rctx = await browser.newContext({ storageState: ROLES.reception.storage, locale: 'en' })
  const rpage = await rctx.newPage()
  try {
    await rpage.goto(`/en/classes/${classId}`)
    await vis(rpage, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
      .getByTestId('cancel-reg-btn').click()
    const dlg = vis(rpage, '[data-testid="cancel-reg-dialog"]').first()
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    await dlg.getByTestId('reason-text').fill('reception cancel')
    await dlg.getByTestId('reason-confirm').click()
    await expect(vis(rpage, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }))
      .toHaveCount(0, { timeout: 15_000 })
  } finally { await rctx.close() }
})

for (const locale of ['en', 'ar'] as const) {
  test(`shots · ${locale} cancel dialog + VOID receipt stamp`, async ({ browser }) => {
    test.setTimeout(120_000)
    const classId = await seedClass(`CXshot ${locale} ${Date.now()}`, 40)
    const stu = await seedStudent(`CXsh${locale}${Date.now().toString().slice(-5)}`)
    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
    const page = await ctx.newPage()
    try {
      // Register+approve (via /en for stable testids), then open the cancel dialog on /<locale>.
      await registerAndApprove(page, classId, stu.display)
      await page.goto(`/${locale}/classes/${classId}`)
      await vis(page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: stu.display }).first()
        .getByTestId('cancel-reg-btn').click()
      const dlg = vis(page, '[data-testid="cancel-reg-dialog"]').first()
      await expect(dlg).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(400)
      await dlg.screenshot({ path: `screenshots/cancel-flow-dialog-${locale}.png` }).catch(() => {})

      // Void the invoice, then screenshot the receipt's VOID stamp.
      const inv = (await regInvoice(stu.id))[0]
      await page.goto(`/${locale}/invoices/${inv.id}`)
      await vis(page, '[data-testid="void-btn"]').click()
      const rd = vis(page, '[data-testid="reason-dialog"]').first()
      await expect(rd).toBeVisible({ timeout: 10_000 })
      await rd.getByTestId('reason-text').fill(locale === 'ar' ? 'فاتورة خاطئة' : 'wrong invoice')
      await rd.getByTestId('reason-confirm').click()
      await expect(vis(page, '[data-testid="invoice-status"]')).toHaveText(/Void|ملغاة|Annulée/i, { timeout: 15_000 })
      await page.goto(`/${locale}/invoices/${inv.id}/receipt`)
      const stamp = vis(page, '[data-testid="receipt-paid-stamp"]').first()
      await expect(stamp).toHaveAttribute('data-state', 'void', { timeout: 15_000 })
      await page.waitForTimeout(300)
      await stamp.screenshot({ path: `screenshots/cancel-flow-void-stamp-${locale}.png` }).catch(() => {})
    } finally { await ctx.close() }
  })
}

test('5 · a non-primary alias redirects 308 PERMANENT to the primary domain', async ({ browser }) => {
  test.setTimeout(90_000)
  if (!PROXY_KEY) throw new Error('needs PROXY_HOST_SECRET')
  // A WL gym mapped to a PRIMARY custom domain; its subdomain is a non-primary alias.
  const slug = `cxalias-${E2E_GYM_SLUG}`.toLowerCase()
  const wlId = await (async () => {
    const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
      method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_brand_color: '#334155', p_name: 'CX Alias Dojo' }),
    })
    if (!res.ok) throw new Error(`seed_e2e_wl_gym: ${res.status} ${await res.text()}`)
    return (await res.json()) as string
  })()
  const DOMAIN = `cxalias-${E2E_GYM_SLUG}.test`.toLowerCase()
  await svc('POST', 'gym_domains', { gym_id: wlId, domain: DOMAIN, is_primary: true })

  const ctx = await browser.newContext({ locale: 'en' })
  try {
    // Arrive on the gym's SUBDOMAIN (a non-primary alias) via the trusted proxy channel.
    const resp = await ctx.request.get('/en', {
      headers: { 'x-praxella-host': `${slug}.praxella.com`, 'x-praxella-proxy-key': PROXY_KEY },
      maxRedirects: 0,
    })
    expect(resp.status(), 'alias → primary is a 308 PERMANENT redirect').toBe(308)
    expect((resp.headers()['location'] || ''), 'redirects to the primary domain').toContain(DOMAIN)
  } finally {
    await ctx.close()
    await svc('DELETE', `gym_domains?gym_id=eq.${wlId}&domain=eq.${DOMAIN}`)
  }
})
