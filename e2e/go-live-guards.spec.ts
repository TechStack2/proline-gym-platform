import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * GO-LIVE-GUARDS — three P0 guards for the paying-customer go-live:
 *   #1 Leads: 'converted' is NOT offered by the interactive status select — the
 *      ConvertModal/convertLead path (member + invoice) is the only way in.
 *   #2 Login: the demo password never leaks on the default login (neutral
 *      placeholder; the demo hint only exists under ?demo=1 — hide-demo).
 *   #3 TVA: a gym with tax_rate=0 bills EXACTLY the configured price end-to-end
 *      (owner decided: configured prices are FINAL / tax-inclusive). The e2e/demo
 *      default stays 11% (billing/ml1 asserts $111.00/$55.50 are unchanged).
 *
 * Seeds its OWN isolated gym (seed_e2e_gym → Karim + a lead) and flips ITS
 * tax_rate to 0 via the service role — the per-worker gyms keep the 11% default.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `tva0-${BASE}`

async function sql(path: string, body: unknown) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('GO-LIVE-GUARDS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  // seed_e2e_gym itself has no service_role PostgREST grant (CI seeds via psql);
  // use the granted WL wrapper (000072) — null brand/name = a plain seeded gym.
  const gymId = (await sql('rpc/seed_e2e_wl_gym', { p_slug: SLUG, p_brand_color: null, p_name: null, p_password: PASSWORD })) as string
  // Owner-decided model for THIS gym only: configured prices are final → rate 0.
  const res = await fetch(`${URL}/rest/v1/gyms?id=eq.${gymId}`, {
    method: 'PATCH',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tax_rate: 0 }),
  })
  if (!res.ok) throw new Error(`set tax_rate=0 failed: ${res.status} ${await res.text()}`)
  // A lead for GLG #1 (seed_e2e_gym seeds none) — 'new' status → the interactive select renders.
  await sql('leads', { gym_id: gymId, first_name: 'GLG', last_name: 'Lead', phone: '+96171009900', source: 'walk_in', status: 'new' })
})

async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(`owner+${SLUG}@e2e.local`)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test('GLG #3 · tax_rate=0 gym bills EXACTLY the configured price ($40 → $40.00, no TVA)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    // The canonical D1 issue flow (billing.spec selectors) on the TVA-0 gym.
    await page.goto('/en/invoices/new')
    const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value')
    await vis(page, '[data-testid="inv-student"]').selectOption(karim!)
    await vis(page, '[data-testid="inv-type"]').selectOption('membership')
    await vis(page, '[data-testid="inv-amount-usd"]').fill('40')
    await vis(page, '[data-testid="issue-submit"]').click()
    await expect(vis(page, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 })
    // The configured price is FINAL: total = exactly $40.00 (11% would be $44.40).
    await expect(vis(page, '[data-testid="invoice-total"]'), 'total is exactly the configured price').toHaveText(/40\.00/)
    await expect(vis(page, '[data-testid="invoice-total"]'), 'no phantom 11% TVA').not.toHaveText(/44\.40/)
    await expect(vis(page, '[data-testid="invoice-balance"]')).toHaveText(/40\.00/)
  } finally {
    await ctx.close()
  }
})

test('GLG #1 · the leads status select does NOT offer converted (no phantom-convert)', async ({ browser }) => {
  const { ctx, page } = await ownerCtx(browser)
  try {
    await page.goto('/en/leads')
    // The seeded lead's interactive status select renders…
    const select = vis(page, '[data-testid="lead-card"]').first().locator('select')
    await expect(select, 'a lead status select renders').toBeVisible({ timeout: 15_000 })
    // …and offers NO 'converted' option (conversion only via the ConvertModal path).
    await expect(select.locator('option[value="converted"]'), 'converted is not selectable').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('GLG #2 · default login leaks no demo password (neutral placeholder; hint only under ?demo=1)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    await expect(page.locator('#password'), 'neutral password placeholder').toHaveAttribute('placeholder', '••••••••')
    await expect(page.locator('body'), 'the demo password never renders on the default login').not.toContainText('ProlineDemo2024!')
  } finally {
    await ctx.close()
  }
})
