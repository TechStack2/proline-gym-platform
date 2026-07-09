import { test, expect, type Browser } from '@playwright/test'

/**
 * J1 SETUP-HUB — the guided /setup hub (Owner Journey 2.0). Six DERIVED milestone
 * cards (no stored state): each auto-completes from a light gym-scoped query.
 *
 * Hermetic: seeds its OWN fresh gym via the service-role wrapper seed_e2e_wl_gym
 * (with brand_color=null, so the "Your gym" milestone starts INCOMPLETE — the seed
 * fills contact + a coach + plans + PT + members, but no brand), logs in as its
 * owner, and tears the gym (+ its auth users) down. Per-worker slug so a retry in a
 * fresh worker never collides on the owner email.
 *
 * We check the /today summary (compact, links to /setup) WHILE the gym is still
 * incomplete, then flip ONE milestone to done via service role (set brand_color →
 * the gym card completes) and assert the card flips + the "N of 6" progress
 * increments. NOTE: the seed already includes a coach, so the "team" milestone
 * starts done — the deterministically-incomplete milestone to flip is the
 * gym/branding one (the same lever the sibling onboarding-checklist spec uses).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `sh-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}
/** service_role PATCH of the fresh gym's brand_color (plain fetch — supabase-js's
 *  Realtime client throws on CI Node). */
async function setBrandColor(color: string | null) {
  const res = await svc(`gyms?id=eq.${gymId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ brand_color: color }),
  })
  if (!res.ok) throw new Error(`brand_color update failed: ${res.status} ${await res.text()}`)
}
async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('SETUP-HUB needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  // brand_color=null → the "Your gym" milestone starts incomplete (deterministic).
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})

test.afterAll(async () => {
  if (!gymId) return
  // Delete the gym's auth users first — DELETE gyms cascades roles/profiles/students
  // but NOT auth.users, and a lingering owner email would 409 a future same-slug seed.
  const rows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('SETUP-HUB · /today links to /setup; the hub renders six milestones and one flips to done + progress increments', async ({ browser }) => {
  test.setTimeout(120_000)
  await setBrandColor(null) // guarantee the incomplete start even on a re-run

  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    // ── /today: the compact summary shows while incomplete + links to the hub ──
    await owner.page.goto('/en/today', { waitUntil: 'domcontentloaded' })
    const summary = owner.page.locator('[data-testid="setup-checklist"]:visible').first()
    await expect(summary, 'the compact setup summary shows while incomplete').toBeVisible({ timeout: 15_000 })
    await expect(summary, 'it links to the guided hub').toHaveAttribute('href', '/en/setup')
    await expect(summary, 'seven milestones (M2-B added the product-gated camps card)').toHaveAttribute('data-total', '7')
    await expect(summary.getByTestId('setup-hub-link'), 'the "continue setup" affordance').toBeVisible()

    // ── /setup: the guided hub renders six milestone cards; the gym is incomplete ──
    await owner.page.goto('/en/setup')
    const hub = owner.page.getByTestId('setup-hub')
    await expect(hub, 'the guided hub renders').toBeVisible({ timeout: 20_000 })
    await expect(hub, 'seven milestones (M2-B added the product-gated camps card)').toHaveAttribute('data-total', '7')
    const gymCard = owner.page.getByTestId('milestone-gym')
    await expect(gymCard, 'the gym milestone starts incomplete (no brand)').toHaveAttribute('data-done', 'false')
    await expect(gymCard.getByTestId('milestone-gym-cta'), 'incomplete card shows its CTA').toBeVisible()
    const before = Number(await hub.getAttribute('data-done'))
    expect(before, 'hub starts incomplete (< 7 of 7)').toBeLessThan(7)

    // ── FLIP one milestone via service role → the card ticks + progress increments ──
    await setBrandColor('#cd1419')
    await owner.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(owner.page.getByTestId('milestone-gym'), 'the gym card flips to done')
      .toHaveAttribute('data-done', 'true', { timeout: 15_000 })
    const after = Number(await owner.page.getByTestId('setup-hub').getAttribute('data-done'))
    expect(after, 'overall progress incremented').toBeGreaterThan(before)
  } finally {
    await owner.ctx.close()
  }
})

/**
 * M2-E CLASS-HOME — classes are Proline's primary signup product, so they get a
 * first-class home in Manage AND a guided onboarding shortcut:
 *  · REQ1 — the /settings Manage index surfaces a Classes card linking to /classes
 *    (before, classes were reachable only via Schedule).
 *  · REQ2 — the setup-hub classes CTA deep-links to /classes?new=1, which opens the
 *    create FormWizard straight away.
 * Reuses this file's hermetic WL gym + owner login (deterministic — no shared gym).
 */
test('SETUP-HUB · M2-E: Manage index Classes card + the ?new=1 deep-link auto-opens the create wizard', async ({ browser }) => {
  test.setTimeout(60_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    // REQ1 — the Manage index shows a Classes card that links to the classes surface.
    await owner.page.goto('/en/settings')
    const card = owner.page.getByTestId('settings-card-classes')
    await expect(card, 'the Manage index surfaces a Classes card').toBeVisible({ timeout: 20_000 })
    await expect(card, 'it links to the classes surface').toHaveAttribute('href', '/en/classes')

    // REQ2 — the onboarding deep-link opens the create wizard on arrival.
    await owner.page.goto('/en/classes?new=1')
    await expect(owner.page.getByTestId('class-wizard'), 'the create wizard auto-opens on ?new=1')
      .toBeVisible({ timeout: 20_000 })
  } finally {
    await owner.ctx.close()
  }
})
