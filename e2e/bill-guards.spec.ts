import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'
import { ROLES } from './roles'

/**
 * BILL-GUARDS — cost is required, one billing door, no silent free.
 *  · R1 — the class wizard REQUIRES a fee: step-3 "Next" is blocked until a numeric
 *    fee is entered OR the explicit "Free" chip writes 0 (NULL can't be produced).
 *  · R2 — a class whose fee was never set (NULL) can't be registered/approved: the
 *    unified enroll door surfaces the curated "no fee" error (P0001). Hermetic own gym
 *    (a NULL-fee class must be inserted server-side — the UI can no longer make one).
 *  · R6 — the member portal HOME surfaces the outstanding balance without a click,
 *    linking into billing; a settled member shows NO card.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `billguard-${BASE}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''
let nullClassId = ''

async function rpc(path: string, body: unknown) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}
async function get(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  if (!res.ok) throw new Error(`get ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('BILL-GUARDS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymId = (await rpc('rpc/seed_e2e_wl_gym', { p_slug: SLUG, p_brand_color: null, p_name: null, p_password: PW })) as string
  // Reuse the seeded gym's discipline + coach; insert a NULL-fee class (the UI cannot).
  const [seedClass] = await get(`classes?gym_id=eq.${gymId}&select=discipline_id,coach_id&limit=1`)
  const [cls] = await rpc('classes', {
    gym_id: gymId, discipline_id: seedClass.discipline_id, coach_id: seedClass.coach_id,
    name_en: 'No-Fee Guard', name_ar: 'بدون رسوم', name_fr: 'Sans frais',
    max_capacity: 20, is_active: true, monthly_fee_usd: null, monthly_fee_lbp: null,
  })
  nullClassId = cls.id
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await get(`user_roles?gym_id=eq.${gymId}&select=user_id`).catch(() => [])) as Array<{ user_id: string }>
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

test('BILL-GUARDS R1 · the class wizard requires a fee (Next blocked until a fee or Free)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    // The (dashboard) shell mounts content TWICE (hidden + visible) → the wizard's
    // `fee` state is duplicated; scope EVERY interaction to the VISIBLE modal so the
    // Free click and the Next assertion hit the SAME instance. Entry = /en/classes
    // (the proven createClassViaWizard flow); step-2 defaults a day+time (no click).
    await page.goto('/en/classes')
    await vis(page, '[data-testid="add-class-btn"]').first().click()
    const wiz = page.locator('[data-testid="class-wizard"]:visible')
    await wiz.getByTestId('class-name-en').fill('Fee Guard Wizard')
    await wiz.locator('[data-testid="wizard-discipline-chip"]').first().click()
    await wiz.locator('[data-testid="wizard-coach-chip"]').first().click()
    await wiz.getByTestId('wizard-next').click() // → step 2
    await wiz.getByTestId('wizard-next').click() // step 2 defaults → step 3
    // Step 3 — capacity set, fee EMPTY → Next is blocked (NULL can't be produced)
    await wiz.getByTestId('class-capacity').fill('10')
    await expect(wiz.getByTestId('wizard-next'), 'Next is blocked while the fee is empty').toBeDisabled()
    // The explicit "Free" chip writes 0 → the required-fee gate is satisfied
    await wiz.getByTestId('class-fee-free').click()
    await expect(wiz.getByTestId('wizard-next'), 'Free (=0) satisfies the required fee').toBeEnabled()
  } finally {
    await ctx.close()
  }
})

test('BILL-GUARDS R2 · a NULL-fee class cannot be registered — the door surfaces "no fee"', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    await page.goto(`/en/classes/${nullClassId}`)
    await page.locator('[data-testid="enroll-open"]:visible').first().click()
    const modal = page.locator('[data-testid="enroll-modal"]:visible')
    await expect(modal).toBeVisible({ timeout: 15_000 })
    await modal.getByTestId('enroll-search').fill('Karim')
    const row = modal.locator('[data-testid="enroll-student-row"]', { hasText: 'Karim' }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await modal.getByTestId('enroll-confirm').click()
    // The billing door raises the curated P0001 prose (action-error passes it through).
    await expect(
      page.getByText(/no fee/i).first(),
      'approving a NULL-fee registration surfaces the "set a fee or mark it free" error',
    ).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'screenshots/bill-guards-nofee-error.png' }).catch(() => {})
  } finally {
    await ctx.close()
  }
})

test('BILL-GUARDS R6 · the portal home surfaces the outstanding balance, linking into billing', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/portal')
    await page.waitForLoadState('networkidle').catch(() => {})
    const card = page.getByTestId('portal-outstanding-balance').first()
    // Cross-check against the billing balance so this is order-tolerant: if the member
    // is settled the card is absent; if they owe, the home card shows and links to billing.
    await page.goto('/en/portal/billing')
    await page.waitForLoadState('networkidle').catch(() => {})
    const owes = await page.getByText(/\$\s*[1-9]/).first().isVisible().catch(() => false)
    await page.goto('/en/portal')
    if (owes) {
      await expect(card, 'a member who owes sees the outstanding card on home').toBeVisible({ timeout: 15_000 })
      await expect(card).toHaveAttribute('href', /\/portal\/billing/)
      await page.screenshot({ path: 'screenshots/bill-guards-portal-outstanding.png' }).catch(() => {})
    } else {
      await expect(card, 'a settled member gets NO card (do not celebrate a zero)').toHaveCount(0)
    }
  } finally {
    await ctx.close()
  }
})
