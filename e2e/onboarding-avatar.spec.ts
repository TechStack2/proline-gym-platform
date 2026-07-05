import { test, expect, type Browser } from '@playwright/test'

/**
 * ONBOARDING-AVATAR (#4) — the first-login onboarding wizard's avatar upload must
 * STORE the image in the `avatars` bucket at <gym>/<uid>.jpg AND set
 * profiles.avatar_url. Reported dead (password step works, upload does nothing).
 *
 * Hermetic: seeds its OWN gym (seed_e2e_wl_gym) + a NET-NEW onboarding user via the
 * GoTrue admin API (app_metadata.must_change_password=true, user_metadata.gym_id →
 * the handle_new_user trigger makes a profile with that gym). Slug carries the worker
 * index; afterAll deletes the run's auth users. /en.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `obav-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const ONBOARD_EMAIL = `onboard+${SLUG}@e2e.local`
let gymId = ''
let userId = ''

async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('ONBOARDING-AVATAR needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const seed = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!seed.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${seed.status} ${await seed.text()}`)
  gymId = (await seed.json()) as string

  // Net-new first-login user: must_change_password + gym_id (trigger makes the profile).
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      email: ONBOARD_EMAIL, password: PW, email_confirm: true,
      app_metadata: { must_change_password: true },
      user_metadata: { gym_id: gymId, first_name_en: 'Onboard', first_name_ar: 'Onboard', first_name_fr: 'Onboard' },
    }),
  })
  if (!res.ok) throw new Error(`create onboarding user failed: ${res.status} ${await res.text()}`)
  userId = ((await res.json()) as { id: string }).id
  if (!userId) throw new Error('onboarding user id missing')
})

test.afterAll(async () => {
  if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: H }).catch(() => {})
  if (gymId) {
    const roleRows = (await (await svc(`user_roles?gym_id=eq.${gymId}&select=user_id`)).json().catch(() => [])) as Array<{ user_id: string }>
    await svc(`gyms?id=eq.${gymId}`, { method: 'DELETE' }).catch(() => {})
    for (const r of roleRows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  }
})

/** Log in as the onboarding user, advance to the avatar step, upload `fixture`, and
 *  assert it stored (avatars/<gym>/<uid>.jpg) + set profiles.avatar_url. */
async function uploadAtOnboarding(browser: Browser, fixture: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  try {
    // Sign in with the temp credential → forced to onboarding.
    await page.goto('/en/auth/login')
    await page.locator('#email').fill(ONBOARD_EMAIL)
    await page.locator('#password').fill(PW)
    await page.locator('button[type="submit"]').click()
    await expect(page, 'forced into the onboarding wizard').toHaveURL(/\/onboarding/, { timeout: 25_000 })

    const w = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first()
    // Fill a valid password so the step gate opens (Submit isn't clicked — the
    // password isn't changed; we only need to ADVANCE to the avatar step).
    await w('ob-password').fill('NewPass!12345')
    await w('ob-password2').fill('NewPass!12345')
    // password → language → avatar
    await w('wizard-next').click()
    await w('wizard-next').click()
    await expect(w('avatar-upload'), 'the avatar step renders its uploader').toBeVisible({ timeout: 15_000 })

    // Upload straight onto the hidden file input (fires onChange → uploadAvatar).
    // The input is display:hidden, so DON'T use :visible — setInputFiles works on it.
    await page.locator('[data-testid="avatar-file-input"]').first().setInputFiles(fixture)

    // Surface a swallowed uploader error early with its message (fail fast + readable).
    const err = page.getByTestId('avatar-error')
    await expect(async () => {
      if (await err.count()) throw new Error(`uploader error: "${(await err.first().innerText()).trim()}"`)
      const rows = await (await svc(`profiles?id=eq.${userId}&select=avatar_url`)).json().catch(() => [])
      const url = Array.isArray(rows) ? rows[0]?.avatar_url : undefined
      expect(url, `avatar_url set (console: ${consoleErrors.join(' | ')})`).toContain(`/avatars/${gymId}/${userId}.jpg`)
    }).toPass({ timeout: 25_000, intervals: [500, 1000, 2000, 3000] })

    // The object is really stored + publicly retrievable.
    const pub = await fetch(`${URL}/storage/v1/object/public/avatars/${gymId}/${userId}.jpg`)
    expect(pub.status, 'the stored avatar object is retrievable').toBe(200)
  } finally {
    await ctx.close()
  }
}

test('ONBOARDING-AVATAR · a standard image uploads + sets profile.avatar_url', async ({ browser }) => {
  test.setTimeout(120_000)
  await uploadAtOnboarding(browser, 'e2e/fixtures/avatar.png')
})

test('ONBOARDING-AVATAR · a HEIC photo (iPhone/Mac default) uploads too — the dead-upload fix', async ({ browser }) => {
  test.setTimeout(120_000)
  // createImageBitmap can't decode HEIC → the upload used to die silently. The lazy
  // heic2any fallback transcodes it, so it now stores + sets avatar_url like any photo.
  await uploadAtOnboarding(browser, 'e2e/fixtures/avatar.heic')
})
