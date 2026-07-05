import { test, expect, type Browser } from '@playwright/test'

/**
 * STAFF-MGMT (000084) — the owner can manage ALL staff, not just coaches.
 *   1. the team list (user_roles-based) shows owner + head_coach + coach AND
 *      receptionist; a newly-invited receptionist appears immediately;
 *   2. deactivating a coach marks their user_roles.is_active=false AND blocks staff
 *      access (get_user_role gated → is_staff() false → RLS denies their reads);
 *   3. a receptionist gets NO deactivate control (owner/head_coach-only).
 *
 * Hermetic: seeds its OWN gym (owner/coach/reception/student via seed_e2e_wl_gym —
 * the service-role-granted wrapper over seed_e2e_gym) and tears it down. /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `sm-${BASE}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''
let coachId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
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
  if (!URL || !KEY) throw new Error('STAFF-MGMT needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
  const coach = (await (await svc(`user_roles?gym_id=eq.${gymId}&role=eq.coach&select=user_id`)).json()) as Array<{ user_id: string }>
  coachId = coach[0]?.user_id
  if (!coachId) throw new Error('STAFF-MGMT: seeded coach not found')
})

test.afterAll(async () => {
  if (gymId) await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {}) // cascades staff/roles/students
})

test('STAFF-MGMT · the team list shows ALL staff roles + a newly-invited receptionist appears', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/coaches')
    await expect(owner.page.getByTestId('staff-access-list')).toBeVisible({ timeout: 20_000 })
    // The bug: the seeded RECEPTIONIST (a user_roles row, NO coaches row) must show —
    // alongside owner + coach (all staff roles).
    await expect(owner.page.locator('[data-testid="staff-role"][data-role="receptionist"]').first(), 'a receptionist shows in the team list').toBeVisible()
    await expect(owner.page.locator('[data-testid="staff-role"][data-role="owner"]').first()).toBeVisible()
    await expect(owner.page.locator('[data-testid="staff-role"][data-role="coach"]').first()).toBeVisible()

    const before = await owner.page.getByTestId('staff-row').count()
    // Invite a NEW receptionist (the form defaults role=receptionist) → appears immediately.
    const RUN = Date.now().toString().slice(-6)
    await owner.page.getByTestId('invite-staff-btn').click()
    await owner.page.getByTestId('staff-first-name').fill(`Recep${RUN}`)
    await owner.page.getByTestId('staff-phone').fill(`+96176${RUN}`)
    await owner.page.getByTestId('staff-invite-submit').click()
    await expect(owner.page.getByTestId('invite-result'), 'the invite returns credentials').toBeVisible({ timeout: 20_000 })
    await owner.page.goto('/en/coaches')
    await expect(owner.page.getByText(`Recep${RUN}`), 'the invited receptionist appears in the team list').toBeVisible({ timeout: 15_000 })
    expect(await owner.page.getByTestId('staff-row').count(), 'the roster grew').toBeGreaterThan(before)
    // Owner's own row has NO deactivate control (cannot deactivate yourself).
    const ownerRow = owner.page.locator('[data-testid="staff-row"]', { has: owner.page.locator('[data-role="owner"]') }).first()
    await expect(ownerRow.getByTestId('staff-toggle'), 'no self-deactivate control').toHaveCount(0)
  } finally {
    await owner.ctx.close()
  }
})

test('STAFF-MGMT · deactivating a coach marks them inactive AND blocks staff access', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  try {
    await owner.page.goto('/en/coaches')
    const row = owner.page.locator(`[data-testid="staff-row"][data-user-id="${coachId}"]`)
    await expect(row, 'the coach is in the team list').toBeVisible({ timeout: 20_000 })
    await expect(row).toHaveAttribute('data-active', '1')
    await row.getByTestId('staff-toggle').click()
    await expect(owner.page.locator(`[data-testid="staff-row"][data-user-id="${coachId}"]`), 'the coach row flips to inactive')
      .toHaveAttribute('data-active', '0', { timeout: 15_000 })
  } finally {
    await owner.ctx.close()
  }
  // Persistence (service role).
  const rr = (await (await svc(`user_roles?user_id=eq.${coachId}&role=eq.coach&select=is_active`)).json()) as Array<{ is_active: boolean }>
  expect(rr[0]?.is_active, 'user_roles.is_active persisted false').toBe(false)

  // Access gate: the gym has a seeded student — an ACTIVE coach would read it; the
  // deactivated coach's is_staff() is false (get_user_role gated) → RLS denies → none.
  const coach = await loginAs(browser, `coach+${SLUG}@e2e.local`)
  try {
    await coach.page.goto('/en/students')
    await coach.page.waitForLoadState('networkidle').catch(() => {})
    await expect(coach.page.getByTestId('student-card'), 'a deactivated coach is blocked from staff reads').toHaveCount(0)
  } finally {
    await coach.ctx.close()
  }
})

test('STAFF-MGMT · a receptionist cannot deactivate anyone (no controls)', async ({ browser }) => {
  const rec = await loginAs(browser, `reception+${SLUG}@e2e.local`)
  try {
    await rec.page.goto('/en/coaches')
    await expect(rec.page.getByTestId('staff-access-list')).toBeVisible({ timeout: 20_000 })
    // The list renders for a receptionist, but with NO deactivate control (owner/
    // head_coach-only; the set_staff_active RPC also re-gates server-side).
    await expect(rec.page.getByTestId('staff-toggle'), 'a receptionist has no deactivate control').toHaveCount(0)
  } finally {
    await rec.ctx.close()
  }
})
