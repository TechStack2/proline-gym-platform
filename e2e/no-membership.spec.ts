import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * NO-MEMBERSHIP — membership is a per-gym OPTIONAL product (white-label). When a
 * gym's enabled_products.membership is false (Proline sells classes + PT only),
 * every membership surface is HIDDEN/GATED (not deleted), and the membership
 * lifecycle is skipped.
 *
 * This spec drives a DEDICATED isolated gym seeded with membership DISABLED (via
 * the service-role e2e seed seed_e2e_gym_no_membership — the reset_ml1_e2e
 * pattern), so ml1/pause-card/billing keep running on their membership-ENABLED
 * per-worker gyms untouched. It proves the disabled gym still shows classes + PT
 * and hides all membership surfaces.
 */
const SLUG = `nomem-${process.env.E2E_GYM_SLUG_BASE || 'local'}`
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const OWNER = `owner+${SLUG}@e2e.local`

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NO-MEMBERSHIP needs SUPABASE_SERVICE_ROLE_KEY to seed the disabled gym')
  // Plain fetch to the PostgREST RPC (service key = service_role). NOT
  // @supabase/supabase-js (its Realtime client throws on CI Node 20). Idempotent
  // per slug, so retries re-seed harmlessly.
  const res = await fetch(`${url}/rest/v1/rpc/seed_e2e_gym_no_membership`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: SLUG, p_password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`seed_e2e_gym_no_membership(${SLUG}) failed: ${res.status} ${await res.text()}`)
})

async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' }) // fresh — no per-worker session
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(OWNER)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test('NO-MEMBERSHIP · disabled gym shows classes + PT and hides every membership surface', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    // ── Today: the three membership horizon cards are GONE (on an enabled gym one
    //    of card-<x>/card-empty-<x> always renders; here neither does). ──
    await page.goto('/en/today')
    await expect(vis(page, '[data-testid="today-view"], [data-testid="owner-today"], main').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="card-expiring"], [data-testid="card-empty-expiring"]'), 'no Expiring-membership card').toHaveCount(0)
    await expect(page.locator('[data-testid="card-chase"], [data-testid="card-empty-chase"]'), 'no Chase (overdue/lapsed membership) card').toHaveCount(0)
    await expect(page.locator('[data-testid="card-paused"], [data-testid="card-empty-paused"]'), 'no Paused-membership card').toHaveCount(0)

    // ── Money: the revenue table renders, but has NO membership revenue column and
    //    the churn table has NO membership-churn (lapsed) column. ──
    await page.goto('/en/money')
    await expect(vis(page, '[data-testid="revenue-table"]').first(), 'the owner revenue table renders').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="revenue-row"] [data-product="membership"]'), 'no membership revenue column').toHaveCount(0)
    await expect(page.locator('[data-testid="churn-lapsed"]'), 'no membership-churn (lapsed) column').toHaveCount(0)

    // ── Add-student wizard: the optional Plan step is GONE — identity advances
    //    straight to review (an enabled gym would land on the Plan step). ──
    await page.goto('/en/students/add')
    await vis(page, '[data-testid="sw-name-en"]').first().fill('NoMem Test')
    await vis(page, '[data-testid="sw-phone"]').first().fill('+9613111222')
    await vis(page, '[data-testid="wizard-next"]').first().click()
    await expect(vis(page, '[data-testid="sw-review"]').first(), 'identity → review directly (Plan step skipped)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="sw-plan-none"]'), 'no Plan step in the wizard').toHaveCount(0)
    await expect(page.locator('[data-testid="sw-plan-chip"]'), 'no plan chips').toHaveCount(0)

    // ── Member file: no membership panel; classes (registrations) + PT panels ARE
    //    present (the gym sells classes + PT). ──
    await page.goto('/en/students')
    await vis(page, '[data-testid="student-card"]').first().click()
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(page.locator('[data-testid="panel-membership"]'), 'no membership panel on the member file').toHaveCount(0)
    await expect(vis(page, '[data-testid="panel-pt"]').first(), 'PT panel present (PT is sold)').toBeVisible({ timeout: 15_000 })
    await expect(vis(page, '[data-testid="panel-registrations"]').first(), 'class registrations panel present (classes are sold)').toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('NO-MEMBERSHIP-GAPS · the six audit leaks are gated on the disabled gym', async ({ browser }) => {
  test.setTimeout(180_000)
  const { ctx, page } = await ownerCtx(browser)
  try {
    // ── 1. Settings: the plans deep-link resolves to the Offers section (never 404),
    //       but NO membership plan manager renders there for a no-membership gym; PT +
    //       exchange rates still show. (M2-A: /settings is a card index; ?tab=plans →
    //       the Offers section, which gates the plan manager on showMembership.) ──
    await page.goto('/en/settings?tab=plans')
    await expect(vis(page, '[data-testid="settings-section-offers"]').first(), 'plans deep-link opens the Offers section (no 404)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="plan-manager"]'), 'no membership plan surface for a no-membership gym').toHaveCount(0)
    await expect(vis(page, '[data-testid="rate-input"]').first(), 'PT + exchange rates remain in Offers').toBeVisible({ timeout: 15_000 })

    // ── 2. Money: no Winback tab; no Renewals-outstanding card / ProcessRenewals. ──
    await page.goto('/en/money')
    await expect(vis(page, '[data-testid="money-tabs"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="money-tabs"] a[href*="tab=winback"]'), 'no Winback tab').toHaveCount(0)
    await expect(page.locator('[data-testid="money-renewals"]'), 'no Renewals-outstanding card (incl. ProcessRenewals)').toHaveCount(0)
    // The churn breakdown collapses to month + total (no lapsed/cancelled/suspended),
    // and the to-win-back link is gone.
    await expect(vis(page, '[data-testid="churn-table"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="churn-table"] thead th'), 'churn shows only month + total').toHaveCount(2)
    await expect(page.locator('[data-testid="churn-winback-link"]'), 'no to-win-back link').toHaveCount(0)
    // The winback deep link falls back to overview (never renders the winback view).
    await page.goto('/en/money?tab=winback')
    await expect(page.locator('[data-testid="money-renewals"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="winback-list"], [data-testid="winback-empty"]'), 'winback deep link falls back').toHaveCount(0)

    // ── 3. Today: the Win-back-due card is inside the membership gate now. ──
    await page.goto('/en/today')
    await expect(vis(page, 'main').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="card-winback-due"], [data-testid="card-empty-winback-due"]'), 'no Win-back-due card').toHaveCount(0)

    // ── 4. Students: no "expiring" chip (the other chips stay). ──
    await page.goto('/en/students')
    await expect(vis(page, '[data-testid="member-chips"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid="chip-expiring"]'), 'no expiring chip').toHaveCount(0)
    await expect(vis(page, '[data-testid="chip-owing"]').first(), 'the owing chip stays').toBeVisible()

    // ── 6. Desk: a scanned member shows PT + belt but NO membership badge. ──
    await page.goto('/en/desk')
    await expect(vis(page, '[data-testid="offline-desk"]').first()).toBeVisible({ timeout: 15_000 })
    await vis(page, '[data-testid="desk-search"]').first().fill('Karim')
    await vis(page, '[data-testid="desk-member-result"]').filter({ hasText: 'Karim' }).first().click()
    await expect(vis(page, '[data-testid="desk-member-basics"]').first(), 'the basics panel renders').toBeVisible({ timeout: 90_000 })
    await expect(page.locator('[data-testid="desk-basic-membership"]'), 'no membership badge on the scanned member').toHaveCount(0)
    await expect(vis(page, '[data-testid="desk-basic-pt"]').first(), 'the PT badge stays').toBeVisible()
  } finally {
    await ctx.close()
  }
})
