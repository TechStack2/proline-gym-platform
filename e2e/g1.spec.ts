import { test, expect, type Browser } from '@playwright/test'
import { ROLES, roleEmail, E2E_PASSWORD } from './roles'
import { vis, gymSlug } from './helpers'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * G1-STABILIZE: stand up THIS test's OWN paid membership invoice via the same RPCs
 * the billing UI calls (create_student → issue_invoice → record_payment), driven
 * API-only with the owner's real JWT. Returns the invoice id. API-only keeps the
 * setup fast + read-nothing-shared, so the receipt assertion can't be raced by a
 * parallel spec mutating the seed gym (the old flake) and the test stays well under
 * budget even when the single next-start server is loaded.
 */
async function standUpOwnPaidInvoice(run: string): Promise<string> {
  if (!URL || !ANON || !SVC) throw new Error('G1 receipt setup needs SUPABASE URL + anon + service-role key')
  const tokRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: roleEmail('owner'), password: E2E_PASSWORD }),
  })
  const jwt = (await tokRes.json()).access_token as string | undefined
  if (!jwt) throw new Error(`G1 owner sign-in failed: ${tokRes.status}`)
  // Staff RPCs run under the owner's JWT (is_staff); return=representation gives the row.
  const rpc = async (fn: string, body: unknown) => {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON!, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`${fn} failed: ${r.status} ${await r.text()}`)
    const j = await r.json()
    return Array.isArray(j) ? j[0] : j
  }
  const gymRes = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(gymSlug())}&select=id`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  })
  const gymId = ((await gymRes.json()) as Array<{ id: string }>)[0]?.id
  if (!gymId) throw new Error('G1 could not resolve the run gym')
  // 1) a fresh member the test OWNS (the F1 create_student write path)
  const stu = await rpc('create_student', {
    p_first_name_ar: `قسيمة ${run}`, p_first_name_en: `G1 Receipt ${run}`, p_first_name_fr: `G1 Receipt ${run}`,
    p_last_name_ar: '', p_last_name_en: '', p_last_name_fr: '',
    p_phone: `+96170${run}`, p_gender: 'male', p_date_of_birth: null,
    p_emergency_contact_name: null, p_emergency_contact_phone: null,
    p_medical_notes: null, p_join_date: null, p_current_belt_rank: null,
  })
  // 2) issue a MEMBERSHIP invoice for THEM (billing's issue_invoice)
  const inv = await rpc('issue_invoice', {
    p_gym_id: gymId, p_student_id: stu.id, p_invoice_type: 'membership',
    p_amount_usd: 50, p_amount_lbp: 0, p_exchange_rate: null, p_rate_date: null,
    p_membership_id: null, p_due_date: null, p_notes_en: null, p_notes_ar: null, p_notes_fr: null,
  })
  // 3) record the FULL payment → paid → the receipt exists
  await rpc('record_payment', {
    p_invoice_id: inv.id, p_amount_usd: inv.total_usd, p_amount_lbp: 0, p_method: 'cash_usd',
    p_reference: null, p_exchange_rate: null, p_payment_date: null, p_client_uuid: null,
  })
  return inv.id as string
}

/**
 * G1 — WhatsApp channel. Two proofs:
 *  1. wa.me BRIDGE (day-1, no backend): on a not-configured gym, share actions
 *     render valid wa.me/<phone>?text=<localized> links, Arabic under /ar.
 *  2. SETTINGS + DISPATCH routing (record-mode): saving creds flips status to
 *     active and the access token is NEVER in the client HTML; a renewal
 *     reminder on an active gym creates an outbound send (status sent) AND the
 *     in-app notification still fires; on a not-configured gym it dispatches
 *     NOTHING; a forced provider error (sentinel phone) records 'failed' without
 *     rolling back the notification/action (best-effort).
 */
const SECRET = 'SECRET_WA_TOKEN_DO_NOT_LEAK_991'

async function ownerCtx(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale })
  return { ctx, page: await ctx.newPage() }
}

// CI-HYGIENE (the f3 non-idempotent-retry lesson): g1's second test FLIPS the
// gym's WhatsApp state (not_configured → active) mid-test, so a flaky attempt 1
// left flipped state and every retry failed DETERMINISTICALLY at the
// "not-configured → no dispatch" step. Reset the config to the known baseline
// (row deleted = not_configured) at test START — beforeEach re-runs on every
// retry, so each attempt starts clean. Service-role delete on THIS worker's gym
// only. No assertion changes.
test.beforeEach(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return // legacy/local single-gym runs without a service key
  const gymRes = await fetch(`${url}/rest/v1/gyms?slug=eq.${encodeURIComponent(gymSlug())}&select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const gymId = ((await gymRes.json()) as Array<{ id: string }>)[0]?.id
  if (!gymId) return
  const del = await fetch(`${url}/rest/v1/gym_whatsapp_config?gym_id=eq.${gymId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!del.ok) throw new Error(`g1 baseline reset failed: ${del.status} ${await del.text()}`)
})

// G1-STABILIZE: the wa.me bridge proof is SPLIT into two independent tests (receipt +
// lead-reply). It used to be one test doing both, and under --repeat-each the single
// next-start server is loaded (RSC-prefetch fallbacks) → the two halves cumulatively
// blew the 120s budget. Split, each half owns its own budget + data. No assertion
// changed: both still require wa.me + THIS gym's Arabic name ("برولاين تجريبي").

test('G1 · wa.me RECEIPT bridge renders the localized link (Arabic /ar) — no backend', async ({ browser }) => {
  test.setTimeout(120_000)
  const RUN = Date.now().toString().slice(-6)
  // OWN the receipt data instead of the shared "Adopt Member" (a parallel spec
  // mutating the shared seed gym used to leave that invoice out of the asserted state
  // → hang). Stand up this test's OWN member + PAID membership invoice via the RPCs
  // the billing UI calls — API-only, so nothing shared is read and it can't be raced.
  const invoiceId = await standUpOwnPaidInvoice(RUN)

  const { ctx, page } = await ownerCtx(browser, 'ar')
  try {
    // Direct nav to THIS test's own paid invoice → the receipt is always present.
    await page.goto(`/ar/invoices/${invoiceId}`)
    await vis(page, '[data-testid="receipt-link"]').first().click()
    const wa = vis(page, '[data-testid="receipt-wa"]').first()
    const href = await wa.getAttribute('href')
    expect(href, 'a wa.me deep-link').toContain('https://wa.me/')
    // WL-TEMPLATES re-point: the receipt template interpolates THIS gym's localized
    // name (was a hardcoded "برو لاين جيم"). g1 runs on the e2e gym (seed_e2e_gym,
    // 000029) whose name_ar is "برولاين تجريبي" — assert the message carries the
    // gym's OWN name (stronger: proves per-gym interpolation).
    expect(decodeURIComponent(href!), 'the Arabic receipt carries THIS gym name').toContain('برولاين تجريبي')
  } finally {
    await ctx.close()
  }
})

test('G1 · wa.me LEAD-REPLY bridge renders the localized link (Arabic /ar) — no backend', async ({ browser }) => {
  test.setTimeout(120_000)
  const RUN = Date.now().toString().slice(-6)
  const { ctx, page } = await ownerCtx(browser, 'ar')
  try {
    // Lead-reply share (create a lead this test OWNS, then assert its wa.me reply link).
    await page.goto('/ar/students?tab=prospects')
    await vis(page, '[data-testid="add-lead-button"]').first().click()
    const modal = page.locator('[data-testid="add-lead-modal"]:visible')
    await modal.getByTestId('lead-first-name').fill('واتس')
    await modal.getByTestId('lead-last-name').fill(`Lead${RUN}`)
    await modal.getByTestId('lead-phone').fill(`+96171${RUN}`)
    await modal.getByTestId('wizard-next').click()
    await modal.locator('[data-testid="lead-source-chip"][data-value="instagram"]').click()
    await modal.getByTestId('wizard-next').click()
    await modal.getByTestId('wizard-submit').click()
    await page.goto(`/ar/students?tab=prospects&search=Lead${RUN}`)
    const leadWa = vis(page, '[data-testid="lead-card"]').filter({ hasText: `Lead${RUN}` }).first().getByTestId('lead-wa')
    const lhref = await leadWa.getAttribute('href')
    expect(lhref, 'lead reply wa.me link').toContain('https://wa.me/')
    // WL-TEMPLATES re-point: leadReply interpolates the e2e gym's own name.
    expect(decodeURIComponent(lhref!), 'the Arabic lead reply carries THIS gym name').toContain('برولاين تجريبي')
  } finally {
    await ctx.close()
  }
})

test('G1 · settings token-security + record-mode dispatch routing (active→sent, none→no-op, forced→failed no-rollback)', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await ownerCtx(browser, 'en')
  const reminder = async (search: string, name: string) => {
    await page.goto(`/en/students?search=${encodeURIComponent(search)}`)
    await vis(page, '[data-testid="student-card"]').filter({ hasText: name }).first().click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await vis(page, '[data-testid="send-reminder-btn"]').first().click()
    return vis(page, '[data-testid="reminder-result"]').first()
  }
  try {
    // ── 1. NOT-CONFIGURED gym: reminder notifies but dispatches nothing ──
    let res = await reminder('Adopt', 'Adopt Member')
    await expect(res).toBeVisible({ timeout: 20_000 })
    await expect(res, 'in-app notification fired').toHaveAttribute('data-notified', 'true')
    await expect(res, 'inactive gym → no WhatsApp dispatch').toHaveAttribute('data-dispatched', 'false')

    // ── 2. Save credentials → status active; the token is NEVER client-exposed ──
    await page.goto('/en/settings')
    const card = vis(page, '[data-testid="whatsapp-settings"]').first()
    await expect(card.getByTestId('whatsapp-status')).toHaveAttribute('data-status', 'not_configured')
    await card.getByTestId('wa-phone-id').fill('123456789')
    await card.getByTestId('wa-token').fill(SECRET)
    await card.getByTestId('wa-save').click()
    await expect(vis(page, '[data-testid="wa-saved"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="whatsapp-status"]').first()).toHaveAttribute('data-status', 'active', { timeout: 15_000 })

    await page.goto('/en/settings')
    await page.waitForLoadState('networkidle').catch(() => {})
    const body = await page.locator('body').innerText()
    expect(body, 'the access token must NEVER appear in the client HTML').not.toContain(SECRET)
    const html = await page.content()
    expect(html, 'token absent from the full payload too').not.toContain(SECRET)
    await expect(vis(page, '[data-testid="whatsapp-status"]').first()).toHaveAttribute('data-status', 'active')

    // ── 3. ACTIVE gym: reminder dispatches (record-mode → sent) + still notifies ──
    res = await reminder('Adopt', 'Adopt Member')
    await expect(res).toBeVisible({ timeout: 20_000 })
    await expect(res).toHaveAttribute('data-notified', 'true')
    await expect(res, 'active gym → WhatsApp dispatched').toHaveAttribute('data-dispatched', 'true')
    await expect(res, 'record-mode marks it sent (no external call)').toHaveAttribute('data-status', 'sent')

    // ── 4. FORCED ERROR (sentinel phone): records failed, no rollback ──
    res = await reminder('WA', 'WA Force')
    await expect(res).toBeVisible({ timeout: 20_000 })
    await expect(res, 'the in-app notification still fired (best-effort)').toHaveAttribute('data-notified', 'true')
    await expect(res, 'an outbound row was created').toHaveAttribute('data-dispatched', 'true')
    await expect(res, 'the provider error recorded failed (no rollback)').toHaveAttribute('data-status', 'failed')
  } finally {
    await ctx.close()
  }
})
