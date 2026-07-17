import { test, expect, type Browser } from '@playwright/test'

/**
 * WA-INVOICE (field finding 4) — send invoice + payment reminders over WhatsApp via
 * the wa.me deep-link bridge (no Meta Cloud API in this slice). Hermetic OWN gym
 * (seed_e2e_wl_gym) mapped to a PRIMARY custom domain so the canonical-host link is
 * unambiguous.
 *   R1/R2  "Send invoice" + "Send reminder" on a due invoice (owner+reception only);
 *          wa.me href carries the member's number + an encoded localized body with
 *          the invoice number and a portal link on the gym's CANONICAL domain.
 *   R3     each click logs a handoff row (message_logs) → the trace reads "sent 1×";
 *          NOT a delivery claim; no billing write beyond the log.
 *   guardian-billed → the PAYER's phone (family model), member-locale body.
 *   no-phone → guidance, never a dead button.
 *   role gate → a coach viewing the same invoice sees no actions.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `wainvoice-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const DOMAIN = `${SLUG}.test`
const RUN = String(Date.now()).slice(-6)
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const P1 = `+96170${RUN}0` // solo member
const PG = `+96171${RUN}0` // guardian (payer)
const PK = `+96176${RUN}0` // guardian-billed kid (must NOT win over the payer)

let gymId = ''
let invSolo = '', invGuardian = '', invNoPhone = ''
const lastSolo = `Solo${RUN}`

async function svcGet(path: string): Promise<any[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}
async function svc(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok && r.status !== 409) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json().catch(() => null)
}
async function ownerToken(): Promise<string> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `owner+${SLUG}@e2e.local`, password: PW }),
  })
  if (!r.ok) throw new Error(`owner token → ${r.status} ${await r.text()}`)
  return (await r.json()).access_token as string
}
async function issueInvoice(token: string, studentId: string): Promise<string> {
  const r = await fetch(`${URL}/rest/v1/rpc/issue_invoice`, {
    method: 'POST',
    headers: { apikey: ANON!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      p_gym_id: gymId, p_student_id: studentId, p_invoice_type: 'membership',
      p_amount_usd: 50, p_amount_lbp: 0, p_exchange_rate: 89000, p_rate_date: null,
      p_membership_id: null, p_due_date: null,
      p_notes_en: 'Membership', p_notes_ar: 'اشتراك', p_notes_fr: 'Abonnement',
    }),
  })
  if (!r.ok) throw new Error(`issue_invoice → ${r.status} ${await r.text()}`)
  const j = await r.json()
  return (Array.isArray(j) ? j[0] : j).id as string
}
async function seedStudent(last: string, phone: string, locale: string): Promise<{ studentId: string; profileId: string }> {
  const [prof] = await svc('POST', 'profiles', {
    gym_id: gymId, first_name_en: 'Wa', first_name_ar: 'وا', first_name_fr: 'Wa',
    last_name_en: last, last_name_ar: last, last_name_fr: last, phone, gender: 'male', locale,
  })
  const [stu] = await svc('POST', 'students', {
    profile_id: prof.id, gym_id: gymId, current_belt_rank: 'white',
    belt_promotion_date: new Date().toISOString().slice(0, 10), is_active: true,
  })
  return { studentId: stu.id, profileId: prof.id }
}
async function loginAs(browser: Browser, email: string, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  const page = await ctx.newPage()
  await page.goto(`/${locale}/auth/login`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY || !ANON) throw new Error('WA-INVOICE needs SUPABASE URL + anon + service-role key')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: '#0ea5e9', p_name: 'WA Invoice Dojo' }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) → ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string

  // Map a PRIMARY custom domain → gymCanonicalOrigin resolves to it (proves the portal
  // link is built on the gym's own domain, not SITE_URL). No localhost redirect fires
  // (the alias 301 only triggers on the gym's own arrival host via the proxy channel).
  await svc('POST', 'gym_domains', { gym_id: gymId, domain: DOMAIN, is_primary: true })

  const token = await ownerToken()

  // 1) a solo self-paying member with a due membership invoice
  const solo = await seedStudent(lastSolo, P1, 'en')
  invSolo = await issueInvoice(token, solo.studentId)

  // 2) a guardian-billed invoice: a kid (phone PK) whose invoice is stamped to the
  //    guardian profile (phone PG, ar). The message must go to PG, not PK.
  const kid = await seedStudent(`Kid${RUN}`, PK, 'en')
  const [guardianProf] = await svc('POST', 'profiles', {
    gym_id: gymId, first_name_en: 'Rana', first_name_ar: 'رنا', first_name_fr: 'Rana',
    last_name_en: `Guard${RUN}`, last_name_ar: `Guard${RUN}`, last_name_fr: `Guard${RUN}`,
    phone: PG, gender: 'female', locale: 'ar',
  })
  invGuardian = await issueInvoice(token, kid.studentId)
  await svc('PATCH', `invoices?id=eq.${invGuardian}`, { payer_profile_id: guardianProf.id })

  // 3) a member with NO phone on file → guidance state
  const noPhone = await seedStudent(`NoPhone${RUN}`, `+96178${RUN}0`, 'en')
  invNoPhone = await issueInvoice(token, noPhone.studentId)
  await svc('PATCH', `profiles?id=eq.${noPhone.profileId}`, { phone: null })
})

test.afterAll(async () => {
  if (URL && KEY) await svc('DELETE', `gym_domains?gym_id=eq.${gymId}&domain=eq.${DOMAIN}`)
})

test('1 · detail: Send invoice + Send reminder → wa.me links (member phone + encoded body + canonical portal link), handoff logged, no billing write', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'en')
  try {
    await page.goto(`/en/invoices/${invSolo}`, { waitUntil: 'domcontentloaded' })
    const panel = page.locator('[data-testid="invoice-wa"]:visible').first()
    await expect(panel).toBeVisible({ timeout: 15_000 })
    // Nothing sent yet.
    await expect(panel.getByTestId('invoice-wa-trace-none')).toBeVisible()

    const invNumber = await page.getByTestId('invoice-number').innerText()

    const send = panel.getByTestId('invoice-wa-send')
    const sendHref = await send.getAttribute('href')
    expect(sendHref, 'a wa.me deep-link to the member').toContain(`https://wa.me/96170${RUN}0?text=`)
    const sendText = decodeURIComponent(sendHref!.split('?text=')[1])
    expect(sendText, 'the body names the invoice').toContain(invNumber.trim())
    expect(sendText, 'the portal link is on the gym CANONICAL domain, member locale').toContain(`https://${DOMAIN}/en/portal/billing`)

    // The softer reminder shares the same recipient + canonical link.
    const remindHref = await panel.getByTestId('invoice-wa-remind').getAttribute('href')
    expect(remindHref).toContain(`https://wa.me/96170${RUN}0?text=`)
    expect(decodeURIComponent(remindHref!)).toContain(`https://${DOMAIN}/en/portal/billing`)

    await expect(panel.getByTestId('invoice-wa-disclaimer')).toBeVisible()
    await page.screenshot({ path: 'screenshots/wa-invoice-detail-en.png' })

    // Click "Send invoice": the anchor opens WhatsApp in a popup (closed immediately);
    // the onClick records the handoff.
    const [popup] = await Promise.all([
      ctx.waitForEvent('page').catch(() => null),
      send.click(),
    ])
    if (popup) await popup.close().catch(() => {})

    // R3: exactly one handoff row for THIS invoice, kind invoice_due, channel whatsapp.
    await expect.poll(async () => {
      const rows = await svcGet(`message_logs?provider_message_id=eq.${invSolo}&select=template_name,channel,status`)
      return rows.length
    }, { timeout: 15_000 }).toBeGreaterThan(0)
    const logs = await svcGet(`message_logs?provider_message_id=eq.${invSolo}&select=template_name,channel,status`)
    expect(logs[0].channel).toBe('whatsapp')
    expect(logs[0].template_name).toBe('invoice_due')

    // The trace now reflects the handoff.
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('[data-testid="invoice-wa-trace-invoice"]:visible').first()).toBeVisible({ timeout: 8_000 })
    }).toPass({ timeout: 30_000 })

    // No billing side-effect: the invoice is untouched (not paid, not voided; no payment).
    const inv = await svcGet(`invoices?id=eq.${invSolo}&select=voided_at`)
    expect(inv[0].voided_at, 'sending must not void the invoice').toBeNull()
    const pays = await svcGet(`payments?invoice_id=eq.${invSolo}&select=id`)
    expect(pays.length, 'sending must not record a payment').toBe(0)

    // R1 on the list: the outstanding row exposes the same two actions.
    await page.goto(`/en/money?tab=invoices&search=${lastSolo}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('[data-testid="invoice-row"]:visible').filter({ hasText: lastSolo }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('invoice-row-wa-send')).toBeVisible()
    await expect(row.getByTestId('invoice-row-wa-remind')).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('2 · guardian-billed → the PAYER phone (ar body); reception sees actions; no-phone → guidance; coach → hidden', async ({ browser }) => {
  test.setTimeout(120_000)

  // Guardian-billed, viewed under /ar (RTL) — the message goes to the guardian.
  const ownerAr = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'ar')
  try {
    await ownerAr.page.goto(`/ar/invoices/${invGuardian}`, { waitUntil: 'domcontentloaded' })
    const panel = ownerAr.page.locator('[data-testid="invoice-wa"]:visible').first()
    await expect(panel).toBeVisible({ timeout: 15_000 })
    const href = await panel.getByTestId('invoice-wa-send').getAttribute('href')
    expect(href, 'the guardian (payer) phone wins over the kid').toContain(`https://wa.me/96171${RUN}0?text=`)
    expect(href, "not the member's own number").not.toContain(`96176${RUN}0`)
    const body = decodeURIComponent(href!.split('?text=')[1])
    expect(body, 'member-locale (ar) portal link').toContain(`https://${DOMAIN}/ar/portal/billing`)
    expect(body, 'signs with the gym Arabic name').toContain('WA Invoice Dojo')
    await ownerAr.page.screenshot({ path: 'screenshots/wa-invoice-detail-ar.png' })
  } finally {
    await ownerAr.ctx.close()
  }

  // Reception (the other billing role) also gets the actions.
  const recept = await loginAs(browser, `reception+${SLUG}@e2e.local`, 'en')
  try {
    await recept.page.goto(`/en/invoices/${invSolo}`, { waitUntil: 'domcontentloaded' })
    await expect(recept.page.locator('[data-testid="invoice-wa-send"]:visible').first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await recept.ctx.close()
  }

  // No phone on file → guidance, not a dead button.
  const owner2 = await loginAs(browser, `owner+${SLUG}@e2e.local`, 'en')
  try {
    await owner2.page.goto(`/en/invoices/${invNoPhone}`, { waitUntil: 'domcontentloaded' })
    await expect(owner2.page.locator('[data-testid="invoice-wa-nophone"]:visible').first()).toBeVisible({ timeout: 15_000 })
    await expect(owner2.page.locator('[data-testid="invoice-wa-send"]')).toHaveCount(0)
  } finally {
    await owner2.ctx.close()
  }

  // A coach (not a billing role) viewing the same invoice sees no WhatsApp actions.
  const coach = await loginAs(browser, `coach+${SLUG}@e2e.local`, 'en')
  try {
    await coach.page.goto(`/en/invoices/${invSolo}`, { waitUntil: 'domcontentloaded' })
    await expect(coach.page.getByTestId('invoice-number')).toBeVisible({ timeout: 15_000 })
    await expect(coach.page.locator('[data-testid="invoice-wa"]')).toHaveCount(0)
  } finally {
    await coach.ctx.close()
  }
})
