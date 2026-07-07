import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis } from './helpers'

/**
 * J3 PT-GUARDS — make PT honestly bookable (Owner Journey 2.0, Sprint 1).
 * Proves the three guards that close the "sold-but-unbookable" dead-end:
 *   (a) approving a coach-LESS PT request is BLOCKED until a coach is picked
 *       (the permanently-unbookable NULL-coach path — inbox chip picker + the
 *       approve button disabled until a coach is chosen);
 *   (b) selling for a coach with NO published availability WARNS (never blocks)
 *       and "Sell anyway" completes the sale;
 *   (c) the STAFF booking modal for that coach diagnoses WHY there are no slots
 *       ("no published availability") + deep-links to the availability panel.
 *
 * Hermetic: seeds its OWN no-availability coach + a no-discipline PT package via
 * the service role (so the coach is always pickable), asserts through the owner
 * UI session, and cleans up. Own-data → no shared-gym coupling.
 */
const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = Date.now().toString().slice(-6)
const PKG_NAME = `J3 Pack ${RUN}`

async function svc(path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`${SVC_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SVC_KEY as string, Authorization: `Bearer ${SVC_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`svc ${method} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

let gymId = ''
let coachId = ''
let profileId = ''
let packageId = ''
let studentId = ''

test.beforeAll(async () => {
  if (!SVC_URL || !SVC_KEY) throw new Error('J3 PT-GUARDS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymId = (await svc(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0].id

  // A NO-availability coach (login-less profile + coach), unique to this run.
  const prof = (await svc('profiles', 'POST', {
    gym_id: gymId,
    first_name_en: `J3NoAvail${RUN}`, first_name_ar: `J3NoAvail${RUN}`, first_name_fr: `J3NoAvail${RUN}`,
    last_name_en: 'Coach', last_name_ar: 'Coach', last_name_fr: 'Coach',
  }))[0]
  profileId = prof.id
  coachId = (await svc('coaches', 'POST', { gym_id: gymId, profile_id: profileId, is_active: true }))[0].id

  // A no-discipline PT package → the seeded coach is always pickable (the sell
  // specialty-filter falls back to ALL coaches when the type has no discipline).
  packageId = (await svc('pt_packages', 'POST', {
    gym_id: gymId, name_en: PKG_NAME, name_ar: PKG_NAME, name_fr: PKG_NAME,
    session_count: 5, price_usd: 100, validity_days: 60, is_active: true,
  }))[0].id

  // Any existing student in the gym (the sale target).
  studentId = (await svc(`students?gym_id=eq.${gymId}&select=id&limit=1`))[0].id
})

test.afterAll(async () => {
  // Clean up this run's rows (assignments first — FK to coach/package).
  await svc(`pt_assignments?coach_id=eq.${coachId}`, 'DELETE').catch(() => {})
  await svc(`pt_assignments?package_id=eq.${packageId}`, 'DELETE').catch(() => {})
  if (coachId) await svc(`coaches?id=eq.${coachId}`, 'DELETE').catch(() => {})
  if (packageId) await svc(`pt_packages?id=eq.${packageId}`, 'DELETE').catch(() => {})
  if (profileId) await svc(`profiles?id=eq.${profileId}`, 'DELETE').catch(() => {})
})

async function ownerPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return ctx.newPage()
}

test('J3-A · approving a coach-less PT request is blocked until a coach is picked', async ({ browser }) => {
  test.setTimeout(90_000)
  // Seed a coach-LESS pending request (the honest request_pt path with no preferred coach).
  const asg = (await svc('pt_assignments', 'POST', {
    student_id: studentId, package_id: packageId, coach_id: null,
    sessions_total: 5, status: 'requested', requested_at: new Date().toISOString(),
  }))[0]
  const page = await ownerPage(browser)
  try {
    await page.goto('/en/inbox')
    const row = vis(page, '[data-testid="inbox-pt-row"]').filter({ hasText: PKG_NAME }).first()
    await expect(row, 'the coach-less PT request shows in the inbox').toBeVisible({ timeout: 25_000 })

    // BLOCKED: the coach picker prompts, and Approve is disabled with no coach.
    await expect(row.getByTestId('inbox-pt-coach-picker'), 'a coach picker is required').toBeVisible()
    await expect(row.getByTestId('inbox-pt-approve'), 'approve is blocked with no coach').toBeDisabled()

    // Picking a coach chip unblocks approve — the guard is a gate, not a wall.
    await row.getByTestId('inbox-pt-coach-chip').first().click()
    await expect(row.getByTestId('inbox-pt-approve'), 'approve unlocks once a coach is chosen').toBeEnabled()
  } finally {
    await svc(`pt_assignments?id=eq.${asg.id}`, 'DELETE').catch(() => {})
    await page.context().close()
  }
})

test('J3-B/C · sell-anyway for a no-availability coach completes; staff booking then diagnoses the gap', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await ownerPage(browser)
  try {
    await page.goto(`/en/students/${studentId}`)

    // ── (b) SALE GUARD (warn-and-allow) ──
    await vis(page, '[data-testid="pt-sell-open"]').first().click()
    await page.locator('[data-testid="pt-type-chip"]').filter({ hasText: PKG_NAME }).first().click()
    await page.locator(`[data-testid="pt-coach-chip"][data-id="${coachId}"]`).click()
    await page.getByTestId('pt-sell-submit').click()

    // The warn dialog appears (coach has no availability) — NOT a hard block.
    await expect(page.getByTestId('pt-sell-warn-modal'), 'no-availability warn dialog').toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('pt-sell-set-availability'), 'a Set-availability deep link').toBeVisible()

    // "Sell anyway" completes the sale (owner's call).
    await page.getByTestId('pt-sell-anyway').click()
    const card = vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: PKG_NAME }).first()
    await expect(card, 'the package sells despite no availability').toBeVisible({ timeout: 25_000 })

    // ── (c) STAFF NO-SLOTS DIAGNOSTIC ──
    await card.getByTestId('m360-pt-book').click()
    await expect(page.getByTestId('pt-book-modal')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('pt-no-availability'), 'staff sees WHY there are no slots').toBeVisible({ timeout: 15_000 })
    const link = page.getByTestId('pt-set-availability-link')
    await expect(link, 'with a deep link to the coach availability panel').toBeVisible()
    await expect(link).toHaveAttribute('href', new RegExp(`/coaches/${coachId}#panel-availability`))
  } finally {
    await page.context().close()
  }
})
