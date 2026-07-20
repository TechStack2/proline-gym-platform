import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * OWNER-RESET — the vendor console can recover a gym owner's login.
 *
 * FIELD DRIVER: Proline's owner forgot their password and the only remedy was a human
 * with a database URL writing a bcrypt hash into auth.users by hand. This proves the
 * supported replacement end to end:
 *   (a) a platform admin issues a temporary password, and it actually signs in;
 *   (b) that sign-in lands on the forced-change screen, so the temp is single-use;
 *   (c) the owner's PREVIOUS password stops working (a reset, not an additional key);
 *   (d) a non-platform-admin cannot reach the console at all.
 *
 * The server-action-layer refusal — the case that matters most, because a server
 * action is an HTTP endpoint that no hidden button protects — is pinned separately and
 * more precisely in src/app/[locale]/(vendor)/vendor/actions.test.ts, which enters the
 * action as a non-admin and asserts it returns `forbidden` WITHOUT ever constructing a
 * service-role client. That is a stronger statement than any UI probe can make, and it
 * cannot be satisfied by hiding a button.
 *
 * HERMETIC: seeds its OWN platform admin, gym and gym-owner, and tears them down. It
 * never touches the shared run-gym — resetting a shared owner's password would break
 * every other spec's stored session.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'

const ADMIN_EMAIL = `or-admin-${BASE}@e2e.local`
const OWNER_EMAIL = `or-owner-${BASE}@e2e.local`
const GYM_SLUG = `or-gym-${BASE}`
const GYM_NAME = `Owner Reset Gym ${BASE}`
const OWNER_FIRST = 'Nadia'
const OWNER_LAST = 'Khoury'

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let adminId = ''
let ownerId = ''
let gymId = ''
/** The owner's CURRENT password. The reset test updates it, so the file is safe to run
 *  in any order and a re-run does not depend on a previous run's leftovers. */
let ownerPassword = PW

async function createAuthUser(email: string, meta?: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcHeaders,
    body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: meta ?? {} }),
  })
  if (!res.ok) throw new Error(`createUser(${email}) failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}
async function deleteAuthUser(id: string) {
  await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {})
}
async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
}

/** Attempt a sign-in; resolve with whether it left the login page. */
async function trySignIn(browser: Browser, email: string, password: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  const signedIn = await page
    .waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  return { ctx, page, signedIn }
}

async function loginAs(browser: Browser, email: string, password = PW) {
  const r = await trySignIn(browser, email, password)
  if (!r.signedIn) {
    await r.ctx.close()
    throw new Error(`login failed for ${email}`)
  }
  return r
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('OWNER-RESET needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')

  // A pure platform admin: no gym, no gym role (service-role seed — never self-grantable).
  adminId = await createAuthUser(ADMIN_EMAIL)
  const a = await svc('platform_admins', { method: 'POST', body: JSON.stringify({ user_id: adminId }) })
  if (!a.ok && a.status !== 409) throw new Error(`seed platform_admin failed: ${a.status} ${await a.text()}`)

  const g = await svc('gyms', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name_ar: GYM_NAME, name_en: GYM_NAME, name_fr: GYM_NAME, slug: GYM_SLUG, is_active: true }),
  })
  if (!g.ok) throw new Error(`seed gym failed: ${g.status} ${await g.text()}`)
  gymId = ((await g.json()) as Array<{ id: string }>)[0].id

  // The gym's owner. `gym_id` rides signup metadata so handle_new_user() (000017)
  // attaches the auto-created profile to THIS gym rather than falling back.
  ownerId = await createAuthUser(OWNER_EMAIL, { gym_id: gymId })
  ownerPassword = PW
  const p = await svc(`profiles?id=eq.${ownerId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      gym_id: gymId,
      first_name_en: OWNER_FIRST, first_name_ar: OWNER_FIRST, first_name_fr: OWNER_FIRST,
      last_name_en: OWNER_LAST, last_name_ar: OWNER_LAST, last_name_fr: OWNER_LAST,
    }),
  })
  if (!p.ok) throw new Error(`seed owner profile failed: ${p.status} ${await p.text()}`)
  const r = await svc('user_roles', {
    method: 'POST',
    body: JSON.stringify({ user_id: ownerId, gym_id: gymId, role: 'owner', is_active: true }),
  })
  if (!r.ok && r.status !== 409) throw new Error(`seed owner role failed: ${r.status} ${await r.text()}`)
})

test.afterAll(async () => {
  if (ownerId) {
    await svc(`user_roles?user_id=eq.${ownerId}`, { method: 'DELETE' }).catch(() => {})
    await svc(`profiles?id=eq.${ownerId}`, { method: 'DELETE' }).catch(() => {})
    await deleteAuthUser(ownerId)
  }
  if (gymId) await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
  if (adminId) {
    await svc(`platform_admins?user_id=eq.${adminId}`, { method: 'DELETE' }).catch(() => {})
    await deleteAuthUser(adminId)
  }
})

// ── (d) the console itself is closed to a tenant owner ────────────────────────
// Runs FIRST so it exercises the seeded password; it does not depend on the reset.
test('OWNER-RESET · a gym owner cannot reach the vendor console or its reset control', async ({ browser }) => {
  test.setTimeout(120_000)
  const owner = await loginAs(browser, OWNER_EMAIL, ownerPassword)
  try {
    await owner.page.goto('/en/vendor')
    await expect(owner.page.getByTestId('vendor-console'), 'no vendor console for a gym owner').toHaveCount(0)
    await expect(owner.page.getByTestId('vendor-gym-row'), 'no cross-tenant gym rows leak').toHaveCount(0)
    await expect(
      owner.page.getByTestId('vendor-reset-owner-pw'),
      'the credential-reset control is not reachable by a tenant owner',
    ).toHaveCount(0)
  } finally {
    await owner.ctx.close()
  }

  // A gym owner from the SHARED run-gym is likewise refused — the guard is on the
  // platform-admin role, not on which gym you happen to own.
  const staff = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  const staffPage = await staff.newPage()
  try {
    await staffPage.goto('/en/vendor')
    await expect(staffPage.getByTestId('vendor-console')).toHaveCount(0)
    await expect(staffPage.getByTestId('vendor-reset-owner-pw')).toHaveCount(0)
  } finally {
    await staff.close()
  }
})

// ── (a) + (b) + (c) the reset itself ──────────────────────────────────────────
test('OWNER-RESET · a platform admin issues a temp password; it signs in, forces a change, and retires the old one', async ({ browser }) => {
  test.setTimeout(180_000)
  const admin = await loginAs(browser, ADMIN_EMAIL)
  let temp = ''
  try {
    await admin.page.goto('/en/vendor')
    const row = admin.page.locator(`[data-testid="vendor-gym-row"][data-slug="${GYM_SLUG}"]`)
    await expect(row, 'the fixture gym is listed').toBeVisible({ timeout: 20_000 })

    // R2 — the confirmation names WHICH account before anything is issued.
    await row.getByTestId('vendor-reset-owner-pw').click()
    const modal = admin.page.getByTestId('vendor-reset-modal')
    await expect(modal).toBeVisible({ timeout: 20_000 })
    await expect(modal, 'the first phase confirms, it does not issue').toHaveAttribute('data-phase', 'confirm')
    await expect(admin.page.getByTestId('vendor-reset-owner-name')).toContainText(OWNER_FIRST)
    const shownEmail = (await admin.page.getByTestId('vendor-reset-owner-email').textContent())?.trim() ?? ''
    expect(shownEmail, 'the email is masked, not printed in full').not.toBe(OWNER_EMAIL)
    expect(shownEmail, 'the mask still identifies the account by domain').toContain('@e2e.local')
    expect(shownEmail).toContain('***')
    // The target is pinned to the resolved owner, not to the row.
    await expect(admin.page.getByTestId('vendor-reset-target')).toHaveAttribute('data-owner-id', ownerId)

    // R1 — issue it.
    await admin.page.getByTestId('vendor-reset-confirm').click()
    await expect(modal).toHaveAttribute('data-phase', 'done', { timeout: 20_000 })
    await expect(admin.page.getByTestId('vendor-reset-once-warning'), 'the one-time warning is shown').toBeVisible()
    temp = (await admin.page.getByTestId('vendor-reset-temp-password').textContent())?.trim() ?? ''
    expect(temp, 'a temp password was displayed').toMatch(/^[A-Za-z]{6,}\d{2}$/)
    // The shared generator's dictate-safety contract — this string gets read aloud.
    expect(temp, 'no ambiguous glyphs (0/O/1/l/I) — it is dictated over WhatsApp').not.toMatch(/[0O1lI]/)

    // Closing the reveal drops it from the UI: it is shown once, not parked on screen.
    await admin.page.getByTestId('vendor-reset-close').click()
    await expect(admin.page.getByTestId('vendor-reset-temp-password')).toHaveCount(0)
  } finally {
    await admin.ctx.close()
  }

  // (c) the OLD password is dead — this is a reset, not an extra key.
  const stale = await trySignIn(browser, OWNER_EMAIL, ownerPassword)
  try {
    expect(stale.signedIn, 'the previous password no longer signs in').toBe(false)
  } finally {
    await stale.ctx.close()
  }
  ownerPassword = temp

  // (a) the temp signs in, and (b) lands on the forced-change screen.
  const fresh = await trySignIn(browser, OWNER_EMAIL, temp)
  try {
    expect(fresh.signedIn, 'the issued temp password signs in').toBe(true)
    await expect(fresh.page, 'must_change_password forces /onboarding before anything else')
      .toHaveURL(/\/onboarding(\/|$|\?)/, { timeout: 20_000 })
    await expect(fresh.page.getByTestId('ob-password'), 'the change-password field is presented').toBeVisible({ timeout: 15_000 })

    // The forced change is not merely the landing route: any other destination bounces
    // back until a new password is set.
    await fresh.page.goto('/en/dashboard')
    await expect(fresh.page, 'the gate holds across navigation').toHaveURL(/\/onboarding(\/|$|\?)/, { timeout: 20_000 })
  } finally {
    await fresh.ctx.close()
  }
})
