import { test, expect, type Browser } from '@playwright/test'
import { vis } from './helpers'

/**
 * LANDING-CUSTOM — the public-page editors (contact + socials + map + office hours)
 * SAVE in Settings and RENDER on the tenant landing. Hermetic own gym (the
 * bill-localize / completeness pattern): office_hours + public contact are gym-wide
 * and the footer reads them at render, so we seed our OWN gym, drive it as its owner,
 * assert the landing, and tear it down — never perturbing the shared run gym.
 *
 *  R2  Settings → Public page: contact phone/WhatsApp/email + Instagram(+followers) +
 *      TikTok save; the map picker parses a pasted Google-Maps link into lat/lng and
 *      shows the OpenStreetMap preview. Opening-hours editor: enable + per-day edit save.
 *  R3  Landing footer renders the FULL contact set (phone tap-to-call, WhatsApp, email),
 *      the TikTok social link, and the data-driven office hours (localized, with Closed).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.E2E_PASSWORD || 'E2eTestPass!23'
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG = `lcust-${BASE}-w${process.env.TEST_WORKER_INDEX ?? '0'}`
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
let gymId = ''

async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  await page.goto('/en/auth/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.endsWith('/auth/login'), { timeout: 20_000 })
  return { ctx, page }
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('LANDING-CUSTOM needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_slug: SLUG, p_brand_color: null, p_name: null }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${SLUG}) failed: ${res.status} ${await res.text()}`)
  gymId = (await res.json()) as string
})

test.afterAll(async () => {
  if (!gymId) return
  const rows = (await (await fetch(`${URL}/rest/v1/user_roles?gym_id=eq.${gymId}&select=user_id`, { headers: H })).json().catch(() => [])) as Array<{ user_id: string }>
  for (const r of rows) await fetch(`${URL}/auth/v1/admin/users/${r.user_id}`, { method: 'DELETE', headers: H }).catch(() => {})
  await fetch(`${URL}/rest/v1/gyms?id=eq.${gymId}`, { method: 'DELETE', headers: H }).catch(() => {})
})

test('LANDING-CUSTOM · public contact + socials + map + office hours save and render on the landing', async ({ browser }) => {
  test.setTimeout(180_000)
  const owner = await loginAs(browser, `owner+${SLUG}@e2e.local`)
  const phone = '+961 71 234 567'
  const email = 'hello@lcust.example'
  try {
    // ── Settings → Public page ─────────────────────────────────────────────────
    await owner.page.goto('/en/settings?tab=gym')
    await expect(vis(owner.page, '[data-testid="gym-name-en"]').first()).toBeVisible({ timeout: 15_000 })

    await vis(owner.page, '[data-testid="gym-contact-phone"]').first().fill(phone)
    await vis(owner.page, '[data-testid="gym-contact-whatsapp"]').first().fill(phone)
    await vis(owner.page, '[data-testid="gym-contact-email"]').first().fill(email)
    await vis(owner.page, '[data-testid="gym-instagram"]').first().fill('lcust.gym')
    await vis(owner.page, '[data-testid="gym-instagram-followers"]').first().fill('4200')
    await vis(owner.page, '[data-testid="gym-tiktok"]').first().fill('lcust.tt')

    // Map picker: paste a Google-Maps link → parse → lat/lng + OSM preview.
    await vis(owner.page, '[data-testid="gym-map-link"]').first().fill('https://www.google.com/maps/@33.8331,35.5419,17z')
    await vis(owner.page, '[data-testid="gym-map-apply"]').first().click()
    await expect(vis(owner.page, '[data-testid="gym-map-lat"]').first(), 'link parsed → lat').toHaveValue('33.8331')
    await expect(vis(owner.page, '[data-testid="gym-map-lng"]').first(), 'link parsed → lng').toHaveValue('35.5419')
    await expect(vis(owner.page, '[data-testid="gym-map-preview"]').first(), 'OSM preview shows').toBeVisible()
    await owner.page.screenshot({ path: 'screenshots/landing-custom-settings-public-en.png' }).catch(() => {})

    await vis(owner.page, '[data-testid="gym-save-publicPage"]').first().click()
    await expect(vis(owner.page, '[data-testid="gym-save-ok-publicPage"]').first(), 'public page saved').toBeVisible({ timeout: 15_000 })

    // ── Settings → Opening hours ───────────────────────────────────────────────
    await vis(owner.page, '[data-testid="gym-hours-enabled"]').first().check()
    await expect(vis(owner.page, '[data-testid="gym-hours-editor"]').first()).toBeVisible()
    await vis(owner.page, '[data-testid="gym-hours-open-mon"]').first().fill('15:00')
    await vis(owner.page, '[data-testid="gym-hours-close-mon"]').first().fill('22:00')
    // Close Sunday (default is already closed) — assert the toggle drives the open/close inputs away.
    await expect(vis(owner.page, '[data-testid="gym-hours-closed-sun"]').first()).toBeChecked()
    await owner.page.screenshot({ path: 'screenshots/landing-custom-settings-hours-en.png' }).catch(() => {})
    await vis(owner.page, '[data-testid="gym-save-hours"]').first().click()
    await expect(vis(owner.page, '[data-testid="gym-save-ok-hours"]').first(), 'hours saved').toBeVisible({ timeout: 15_000 })

    // ── Landing render (this gym) ──────────────────────────────────────────────
    await owner.page.goto(`/en?gym=${encodeURIComponent(SLUG)}`, { waitUntil: 'domcontentloaded' })
    await expect(owner.page.getByTestId('hero-gym-name'), 'the gym landing renders').toBeVisible({ timeout: 15_000 })

    // R3 — full contact set in the footer.
    await expect(owner.page.getByTestId('footer-phone'), 'phone renders').toContainText('234 567')
    await expect(owner.page.getByTestId('footer-phone'), 'phone is tap-to-call').toHaveAttribute('href', /^tel:/)
    await expect(owner.page.getByTestId('footer-email'), 'email renders').toContainText(email)
    await expect(owner.page.getByTestId('footer-email')).toHaveAttribute('href', `mailto:${email}`)
    await expect(owner.page.getByTestId('footer-wa'), 'WhatsApp deep link').toHaveAttribute('href', /wa\.me\//)
    await expect(owner.page.getByTestId('footer-tiktok'), 'TikTok social link').toHaveAttribute('href', /tiktok\.com\/@lcust\.tt/)

    // R3 — data-driven office hours (localized day names; Monday range; Sunday Closed).
    const hours = owner.page.getByTestId('footer-hours')
    await expect(hours, 'office hours render from data').toBeVisible()
    await expect(hours).toContainText('15:00')
    await expect(hours).toContainText('22:00')
    await expect(hours, 'a closed day shows Closed').toContainText('Closed')
    await hours.scrollIntoViewIfNeeded().catch(() => {})
    await owner.page.screenshot({ path: 'screenshots/landing-custom-footer-en.png' }).catch(() => {})

    // ── Arabic (RTL) footer render ─────────────────────────────────────────────
    await owner.page.goto(`/ar?gym=${encodeURIComponent(SLUG)}`, { waitUntil: 'domcontentloaded' })
    const hoursAr = owner.page.getByTestId('footer-hours')
    await expect(hoursAr, 'AR office hours render').toBeVisible({ timeout: 15_000 })
    await expect(hoursAr, 'AR closed label').toContainText('مغلق')
    await hoursAr.scrollIntoViewIfNeeded().catch(() => {})
    await owner.page.screenshot({ path: 'screenshots/landing-custom-footer-ar.png' }).catch(() => {})
  } finally {
    await owner.ctx.close()
  }
})
