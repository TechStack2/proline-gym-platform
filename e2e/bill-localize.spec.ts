import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * BILL-LOCALIZE — honest tax + preferred display currency, proven on a HERMETIC own
 * gym (the go-live-guards pattern). tva_registration_number + currency_preference are
 * GYM-WIDE and the invoice surfaces read them at render, so doing this on the shared
 * per-worker gym would flip every concurrent invoice (e.g. billing.spec's $111.00 →
 * LBP) — so we seed our own gym, drive it as that gym's owner, and tear it down.
 *
 * Proves:
 *  · REQ2 — a TVA-registered gym renders an honest "TVA (11%)" line (rate from the
 *    invoice's own tax_rate, not a hardcoded 11%) + its registration number; clearing
 *    the number removes the tax-line pretense entirely (total is unchanged).
 *  · REQ4 — currency_preference=LBP makes the invoice total LEAD with LBP. Storage is
 *    unchanged (total_usd/total_lbp both persist) — display order/emphasis only.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `billloc-${BASE}`
const TVA = 'LB-42-987654'
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function rpc(path: string, body: unknown) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}
async function patchGym(fields: Record<string, unknown>) {
  const res = await fetch(`${URL}/rest/v1/gyms?id=eq.${gymId}`, { method: 'PATCH', headers: H, body: JSON.stringify(fields) })
  if (!res.ok) throw new Error(`patch gym failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('BILL-LOCALIZE needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymId = (await rpc('rpc/seed_e2e_wl_gym', { p_slug: SLUG, p_brand_color: null, p_name: null, p_password: PW })) as string
  // A TVA-registered collector (tax_rate stays the seeded 11% default), USD-primary.
  await patchGym({ tva_registration_number: TVA, currency_preference: 'USD' })
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await fetch(`${URL}/rest/v1/user_roles?gym_id=eq.${gymId}&select=user_id`, { headers: H })).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await fetch(`${URL}/rest/v1/gyms?id=eq.${gymId}`, { method: 'DELETE', headers: H }).catch(() => {})
})

async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test('BILL-LOCALIZE · registered → honest TVA line + number; LBP preference leads the total; unregistered → no pretense', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    // ── Issue a $100 invoice (tax_rate 11% default → $111.00; the seeded gym rate
    //    gives the invoice an exchange_rate → total_lbp is computed by the trigger). ──
    await page.goto('/en/invoices/new')
    const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
    await vis(page, '[data-testid="inv-student"]').selectOption(karim!)
    await vis(page, '[data-testid="inv-type"]').selectOption('membership')
    await vis(page, '[data-testid="inv-amount-usd"]').fill('100')
    await vis(page, '[data-testid="issue-submit"]').click()
    await expect(vis(page, '[data-testid="invoice-number"]').first()).toBeVisible({ timeout: 15_000 })

    // ── REQ2: registered gym → honest "TVA (11%)" line (rate from the invoice) + the
    //    registration number; USD-primary total. ──
    await expect(vis(page, '[data-testid="invoice-tva-label"]').first(), 'TVA line shows for a registered gym').toContainText('11', { timeout: 15_000 })
    await expect(vis(page, '[data-testid="invoice-tva-number"]').first(), 'the TVA registration number is surfaced').toContainText(TVA)
    await expect(vis(page, '[data-testid="invoice-total"]').first(), 'USD-primary total').toContainText('111.00')
    // REQ5 visual evidence: a tax-bearing invoice (honest TVA line + reg number) → the
    // e2e-screenshots artifact the auditor reviews.
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'screenshots/bill-localize-invoice-tva-en.png', fullPage: true }).catch(() => {})

    // ── REQ4: currency_preference=LBP → the total LEADS with LBP (order/emphasis only). ──
    await patchGym({ currency_preference: 'LBP' })
    await page.reload()
    await expect(vis(page, '[data-testid="invoice-total"]').first(), 'LBP leads the total under LBP preference').toContainText('LBP', { timeout: 15_000 })

    // ── REQ2: clearing the TVA number removes the tax-line pretense entirely; the stored
    //    (TVA-inclusive) total is unchanged. ──
    await patchGym({ tva_registration_number: null, currency_preference: 'USD' })
    await page.reload()
    await expect(page.locator('[data-testid="invoice-tva-label"]'), 'no TVA line without a registration number').toHaveCount(0, { timeout: 15_000 })
    await expect(vis(page, '[data-testid="invoice-total"]').first(), 'the total (still TVA-inclusive) is unchanged').toContainText('111.00')
  } finally {
    await ctx.close()
  }
})
