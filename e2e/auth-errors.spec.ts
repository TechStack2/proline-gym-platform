import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * AUTH-ERRORS — sign-in failures say which thing went wrong, without ever saying
 * WHO exists.
 *
 * FIELD LESSON (owner, 2026-07-20): a wrong password rendered "An error occurred
 * during login" — the same sentence a broken platform would show. A production
 * diagnosis chased a phantom outage for hours before the password turned out to be
 * the whole story.
 *
 * The J6 anti-enumeration rule is untouched, and this file is where that is
 * PROVEN rather than asserted in a comment: the message for a wrong password on a
 * REAL account and the message for an address that has never existed are compared
 * to each other, character for character. That comparison is the point of the
 * test — checking each against a literal separately would pass even if they drifted
 * apart, and drift is exactly what would build the oracle.
 *
 * HERMETIC: seeds its own throwaway gym + account. It never uses a shared run-gym
 * role, because the reset-door cases below stub GoTrue's answer to a password
 * UPDATE — if a stub ever failed to match, a shared account's password would
 * change and every other spec's stored session would die. On a throwaway account
 * the same slip costs nothing.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'

const REAL_EMAIL = `ae-real-${BASE}@e2e.local`
const GYM_SLUG = `ae-gym-${BASE}`
const GYM_NAME = `Auth Errors Gym ${BASE}`

// The copy each state must produce (src/i18n/messages/en.json → auth.*).
const CREDENTIALS = 'Incorrect email/phone or password'
const SERVER = 'Something went wrong on our side'
const POLICY = "That password wasn't accepted"
const RETIRED = 'An error occurred during login' // the one message this slice retires

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let userId = ''
let gymId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
}

async function attempt(page: Page, id: string, password: string) {
  await page.locator('#email').fill(id)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

test.beforeAll(async () => {
  if (!URL_ || !KEY) throw new Error('AUTH-ERRORS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')

  const g = await svc('gyms', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name_ar: GYM_NAME, name_en: GYM_NAME, name_fr: GYM_NAME, slug: GYM_SLUG, is_active: true }),
  })
  if (!g.ok) throw new Error(`seed gym failed: ${g.status} ${await g.text()}`)
  gymId = ((await g.json()) as Array<{ id: string }>)[0].id

  // `gym_id` rides signup metadata so handle_new_user() (000017) attaches the
  // auto-created profile to THIS gym. No must_change_password → no forced
  // /onboarding bounce, so a successful sign-in behaves like a normal one.
  const u = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcHeaders,
    body: JSON.stringify({ email: REAL_EMAIL, password: PW, email_confirm: true, user_metadata: { gym_id: gymId } }),
  })
  if (!u.ok) throw new Error(`seed user failed: ${u.status} ${await u.text()}`)
  userId = ((await u.json()) as { id: string }).id
  const r = await svc('user_roles', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, gym_id: gymId, role: 'owner', is_active: true }),
  })
  if (!r.ok && r.status !== 409) throw new Error(`seed role failed: ${r.status} ${await r.text()}`)
})

test.afterAll(async () => {
  if (userId) {
    await svc(`user_roles?user_id=eq.${userId}`, { method: 'DELETE' }).catch(() => {})
    await svc(`profiles?id=eq.${userId}`, { method: 'DELETE' }).catch(() => {})
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {})
  }
  if (gymId) await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
})

test('AUTH-ERRORS · a wrong password says so — and says the IDENTICAL thing for an account that does not exist', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')

    // (1) A REAL account, wrong password. Seeded above — without a real account
    // this whole comparison would be two non-existent addresses agreeing with
    // each other, which proves nothing.
    await attempt(page, REAL_EMAIL, 'DefinitelyNotIt!9')
    const onExisting = (await page.getByTestId('login-error').textContent({ timeout: 20_000 }))?.trim() ?? ''
    expect(onExisting, 'a wrong password is named as a credential problem').toContain(CREDENTIALS)
    expect(onExisting, 'the retired catch-all copy is gone').not.toContain(RETIRED)
    expect(onExisting, 'a wrong password must NOT read as a platform failure').not.toContain(SERVER)

    // (2) An address with no account at all — a DIFFERENT identifier, so the
    // per-identifier limiter cannot be what answers here.
    await page.goto('/en/auth/login')
    await attempt(page, `ae-nobody-${Date.now()}@e2e.local`, 'DefinitelyNotIt!9')
    const onMissing = (await page.getByTestId('login-error').textContent({ timeout: 20_000 }))?.trim() ?? ''

    // THE assertion: equal to each other. J6 — the login screen is not an
    // account-existence oracle, and cannot become one by copy drift.
    expect(onMissing, 'no-such-account is byte-identical to wrong-password').toBe(onExisting)

    // (3) …and the credentials state is not simply what this screen always says:
    // the correct password still signs in.
    await page.goto('/en/auth/login')
    await attempt(page, REAL_EMAIL, PW)
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })
  } finally {
    await ctx.close()
  }
})

test('AUTH-ERRORS · a failing server says OUR side broke — never that the password was wrong', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')

    // The page is already loaded, so from here the only request matching this URL
    // is the sign-in server action itself. FULFILL a 500 (never continue — the
    // known route+continue hang under the service worker).
    //
    // The content-type is load-bearing. Next only awaits an action's RESULT when
    // the response announces itself as a flight payload; a 500 with any other
    // content-type is returned WITHOUT a result, so the promise our submit handler
    // is awaiting simply never settles — measured: the submit sat for the full 15s
    // withAuthTimeout window and then surfaced the CONNECTION state, because from
    // the browser's side a request that never completes is indistinguishable from a
    // dead link. Announcing the flight content-type makes the client parse the
    // body, fail, and REJECT — which is the shape a real 500 takes once the
    // response is well-formed enough to be read.
    await page.route('**/auth/login**', (r) =>
      r.fulfill({ status: 500, contentType: 'text/x-component', body: 'not-a-flight-payload' }))

    // CORRECT credentials: whatever this screen says next cannot be about them.
    await attempt(page, REAL_EMAIL, PW)

    const shown = page.getByTestId('login-error')
    await expect(shown, 'a broken back end is named as ours').toContainText(SERVER, { timeout: 20_000 })
    await expect(shown, 'and never blames the credentials').not.toContainText(CREDENTIALS)
    await expect(page.locator('button[type="submit"]'), 'the spinner cleared — the form is usable again').toBeEnabled()
  } finally {
    await ctx.close()
  }
})

test('AUTH-ERRORS · the reset door names a rejected password instead of blaming the link', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    // A real session (the throwaway account) — updateUser needs one, and without
    // it supabase-js fails locally with "session missing" and never calls GoTrue.
    await page.goto('/en/auth/login')
    await attempt(page, REAL_EMAIL, PW)
    await page.waitForURL((u) => !u.pathname.includes('/auth/login'), { timeout: 30_000 })

    await page.goto('/en/auth/reset')
    await expect(page.getByTestId('reset-password')).toBeVisible({ timeout: 20_000 })

    // Stub GoTrue's answer to the password UPDATE. Fulfilled, never continued, so
    // the throwaway account's password is not actually touched either way.
    const stub = (status: number, body: Record<string, unknown>) =>
      page.route('**/auth/v1/user**', (r) =>
        r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }))

    // (1) The user retyped their CURRENT password. This used to render "the link
    // may have expired" — sending them to request reset links forever for
    // something no link could fix.
    await stub(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' })
    await page.getByTestId('reset-password').fill('BrandNewPass!42')
    await page.getByTestId('reset-password2').fill('BrandNewPass!42')
    await page.getByTestId('reset-submit').click()
    await expect(page.getByTestId('reset-error'), 'the rejected password is named').toContainText(POLICY, { timeout: 20_000 })

    // (2) A genuine outage is still called an outage — not an expired link.
    await page.unroute('**/auth/v1/user**')
    await stub(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error' })
    await page.getByTestId('reset-submit').click()
    await expect(page.getByTestId('reset-error'), 'a 500 is ours, not the link').toContainText(SERVER, { timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})
