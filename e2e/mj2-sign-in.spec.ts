import { test, expect, type Browser } from '@playwright/test'
import { randomUUID } from 'crypto'
import { ROLES } from './roles'

/**
 * MJ-2 SIGN-IN-SANE — deterministic phone sign-in + the member front door.
 * Hermetic own gym (seed_e2e_wl_gym; worker-unique slug + phone). Proves:
 *  1. A member stored with a CANONICAL phone signs in typing a LOCAL VARIANT (bare
 *     national) — normalizePhone maps both to the same subscriber.
 *  2. A NON-credentialed profile sharing the SAME phone (a family member with no
 *     auth account) does NOT break the credentialed holder's login — resolution
 *     keeps only credentialed profiles (the on1:60 root-cause, generalized).
 *  3. Every gym landing (a NON-default tenant too) shows the "Member sign-in" link
 *     → /auth/login and offers NO public registration (staff-only credential gate).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const W = (process.env.TEST_WORKER_INDEX || '0').padStart(2, '0')
const SLUG = `mj2-${BASE}-${W}`
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23'
// Stored CANONICAL; typed below as a BARE-NATIONAL variant. Worker-unique national
// number (76 52 <worker> 00) so parallel workers never share a subscriber.
const MEMBER_PHONE = `+9617652${W}00`
const MEMBER_PHONE_VARIANT = `7652${W}00`
const H: Record<string, string> = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(path: string, body: unknown) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

let gymId = ''
let credId = ''

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('MJ-2 needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  gymId = (await (await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: 'Sign-In Sane Gym' }),
  })).json()) as string

  // A CREDENTIALED member in the invite-flow shape: auth user id == profile id,
  // synthetic email, phone set, NO forced-change (a plain successful sign-in). We
  // own the password, so we can sign in with a phone VARIANT below. Creating the
  // auth user fires the handle_new_user trigger → it auto-creates the profiles row,
  // so we PATCH it (gym + phone + names) rather than insert (would 23505).
  credId = randomUUID()
  const auth = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ id: credId, email: `m-${credId}@members.proline.lb`, phone: MEMBER_PHONE, password: PASSWORD, email_confirm: true, phone_confirm: true, app_metadata: {} }),
  })
  if (!auth.ok) throw new Error(`create auth user failed: ${auth.status} ${await auth.text()}`)
  const patch = await fetch(`${URL}/rest/v1/profiles?id=eq.${credId}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ gym_id: gymId, phone: MEMBER_PHONE, first_name_en: 'Cred', first_name_ar: 'كريد', first_name_fr: 'Cred', last_name_en: 'Holder', last_name_ar: 'حامل', last_name_fr: 'Holder' }),
  })
  if (!patch.ok) throw new Error(`patch cred profile failed: ${patch.status} ${await patch.text()}`)
  await rest('user_roles', { user_id: credId, gym_id: gymId, role: 'student' })

  // A SECOND profile on the SAME phone but LOGIN-LESS (a family member, no auth
  // account) — the resolver must ignore it and still log the credentialed holder in.
  await rest('profiles', { gym_id: gymId, phone: MEMBER_PHONE, first_name_en: 'Family', first_name_ar: 'عائلة', first_name_fr: 'Famille', last_name_en: 'Twin', last_name_ar: 'توأم', last_name_fr: 'Jumeau' })
})

test.afterAll(async () => {
  if (!URL || !KEY) return
  await fetch(`${URL}/auth/v1/admin/users/${credId}`, { method: 'DELETE', headers: H }).catch(() => {})
})

test('MJ-2 · a canonical-stored member signs in typing a LOCAL VARIANT, past a login-less family twin on the same phone', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/auth/login')
    await page.screenshot({ path: 'screenshots/mj2-login-en.png' }) // VISUAL: the member front door
    // Type the BARE-NATIONAL variant (no +961, no trunk 0). normalizePhone maps it
    // to the stored canonical; resolution then keeps only the CREDENTIALED holder.
    await page.locator('#email').fill(MEMBER_PHONE_VARIANT)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    await expect(page, 'the variant phone + password signs the credentialed holder in (login-less twin ignored)')
      .not.toHaveURL(/\/auth\/login/, { timeout: 20_000 })

    // VISUAL: the first-login welcome (name + this gym's brand + the 3 things) — LTR + RTL.
    await page.goto('/en/welcome')
    await expect(page.getByTestId('welcome-gym'), 'the welcome shows THIS gym brand').toHaveText('Sign-In Sane Gym', { timeout: 15_000 })
    await page.screenshot({ path: 'screenshots/mj2-welcome-en.png' })
    await page.goto('/ar/welcome')
    await expect(page.getByTestId('welcome-title')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'screenshots/mj2-welcome-ar.png' })
  } finally {
    await ctx.close()
  }
})

async function ownerCtx(browser: Browser) {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  return { ctx, page: await ctx.newPage() }
}

test('MJ-2 · the soft duplicate hint surfaces (never blocks) when a phone matches another profile in the gym', async ({ browser }) => {
  const { ctx, page } = await ownerCtx(browser)
  try {
    // The add-member wizard on the shared run gym (Sami the coach is seeded with
    // +96170000012). Typing that number as a bare-national variant surfaces the
    // informational "also used by …" chip — and never disables the flow.
    await page.goto('/en/students/add')
    await expect(page.getByTestId('sw-phone'), 'the identity step renders').toBeVisible({ timeout: 15_000 })
    await page.getByTestId('sw-phone').fill('70000012')
    await expect(page.getByTestId('phone-dup-hint'), 'the soft duplicate chip appears').toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'screenshots/mj2-dup-chip-en.png' })
    // Never blocks: name the student and the wizard can still advance.
    await page.getByTestId('sw-name-en').fill('Dup Chip Demo')
    await expect(page.locator('[data-testid="wizard-next"]:visible').first(), 'capture is never blocked by a shared phone').toBeEnabled()
  } finally {
    await ctx.close()
  }
})

test('MJ-2 · a non-default gym landing shows the Member sign-in front door → /auth/login and no public registration', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG)}`)
    const signin = page.getByTestId('landing-member-signin')
    await expect(signin, 'the nav Member sign-in link renders (non-default tenant too)').toBeVisible({ timeout: 15_000 })
    await expect(signin).toHaveAttribute('href', '/en/auth/login')
    await expect(page.getByTestId('landing-footer-signin'), 'the footer sign-in link too').toHaveAttribute('href', '/en/auth/login')
    // Staff-only credential gate: NO self-registration ROUTE (the public path is
    // request → leads, i.e. the trial CTA — that's allowed, so assert the route, not text).
    await expect(page.locator('a[href*="/auth/register"], a[href*="/auth/signup"], a[href$="/register"]'), 'no public registration route')
      .toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
