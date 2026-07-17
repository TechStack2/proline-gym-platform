import { test, expect, type Browser } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'
import { vis } from './helpers'

/**
 * PWA-BASICS + INVITE-HOST (R5).
 *  A. INVITE-HOST — an outbound portal-invite link is built on the gym's CANONICAL
 *     host (its mapped primary custom domain), not localhost / SITE_URL.
 *  B. Locale editable in EVERY role — the coach + member shells now expose a working
 *     interface-language switcher (the field bug: a coach was stuck in Arabic).
 *  C. Install affordance for EVERY role — the iOS-aware, self-hiding install card now
 *     renders for coaches + members (was staff-/today-only).
 *  D. Notification-bell popup stays inside a 360px viewport (LTR + RTL).
 * Screenshots (en + ar, mobile) → the e2e-screenshots artifact.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PHONE = { width: 360, height: 780 } // a narrow Android PWA

async function svcGet(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}
async function svc(method: string, path: string, body?: any) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

test.describe('PWA-BASICS + INVITE-HOST', () => {
  test('A · a portal-invite link is built on the gym\'s canonical (mapped) domain', async ({ browser }) => {
    test.setTimeout(120_000)
    if (!URL || !KEY) throw new Error('needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
    const gymId = (await svcGet(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0].id
    const DOMAIN = `invite-${E2E_GYM_SLUG}.test`.toLowerCase()
    // Map a PRIMARY custom domain to this worker's gym.
    await svc('POST', 'gym_domains', { gym_id: gymId, domain: DOMAIN, is_primary: true })
    // A fresh login-less member WITH a phone (invitable; no shared-member mutation).
    const suffix = Date.now().toString().slice(-6)
    const [prof] = await svc('POST', 'profiles', {
      gym_id: gymId, first_name_en: `InviteHost${suffix}`, first_name_ar: `InviteHost${suffix}`, first_name_fr: `InviteHost${suffix}`,
      last_name_en: 'Host', last_name_ar: 'Host', last_name_fr: 'Host', phone: `+9617${Math.floor(1000000 + Math.random() * 8999999)}`,
    })
    const [stu] = await svc('POST', 'students', { profile_id: prof.id, gym_id: gymId, current_belt_rank: 'white', belt_promotion_date: new Date().toISOString().slice(0, 10), is_active: true })

    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
    const page = await ctx.newPage()
    try {
      await page.goto(`/en/students/${stu.id}`)
      await vis(page, '[data-testid="invite-btn"]').first().click()
      await expect(vis(page, '[data-testid="invite-result"]').first(), 'invite issued').toBeVisible({ timeout: 20_000 })
      const wa = await vis(page, '[data-testid="invite-wa-link"]').first().getAttribute('href')
      const decoded = decodeURIComponent(wa || '')
      expect(decoded, 'the login link is on the gym\'s canonical primary domain, not localhost/SITE_URL')
        .toContain(`https://${DOMAIN}/en/auth/login`)
    } finally {
      await ctx.close()
      // Revert the mapping so the shared gym is unchanged for other specs.
      await svc('DELETE', `gym_domains?gym_id=eq.${gymId}&domain=eq.${DOMAIN}`)
    }
  })

  for (const role of ['coach', 'student'] as const) {
    const home = role === 'coach' ? '/en/coach' : '/en/portal'
    const profile = role === 'coach' ? '/en/coach/profile' : '/en/portal/profile'

    test(`B · ${role} can change the interface language from their settings`, async ({ browser }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', viewport: PHONE })
      const page = await ctx.newPage()
      try {
        await page.goto(profile)
        const lang = vis(page, '[data-testid="settings-language"]').first()
        await expect(lang, `${role} settings expose a language switcher`).toBeVisible({ timeout: 15_000 })
        await lang.getByRole('button', { name: 'العربية' }).click()
        await expect(page, `${role} switched the UI to Arabic (route + cookie)`).toHaveURL(/\/ar(\/|$)/, { timeout: 15_000 })
      } finally { await ctx.close() }
    })

    test(`C · the install affordance renders for a ${role}`, async ({ browser }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', viewport: PHONE })
      const page = await ctx.newPage()
      try {
        await page.goto(home)
        await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
        await page.reload()
        await expect(vis(page, '[data-testid="install-app-card"]').first(), `${role} sees the install card`).toBeVisible({ timeout: 15_000 })
        // Native button OR the manual (incl. iOS) instructions — never a dead end.
        if (await vis(page, '[data-testid="install-app-btn"]').count() === 0) {
          await expect(vis(page, '[data-testid="install-app-instructions"]').first()).toBeVisible()
        }
      } finally { await ctx.close() }
    })
  }

  for (const locale of ['en', 'ar'] as const) {
    test(`D · the notification-bell popup stays inside a 360px viewport (${locale})`, async ({ browser }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale, viewport: PHONE })
      const page = await ctx.newPage()
      try {
        await page.goto(`/${locale}/today`)
        await vis(page, '[data-testid="notification-bell"]').first().click()
        const panel = vis(page, '[data-testid="notification-dropdown"]').first()
        await expect(panel).toBeVisible({ timeout: 15_000 })
        const box = (await panel.boundingBox())!
        expect(box, 'panel has a box').not.toBeNull()
        expect(box.x, 'left edge in-viewport').toBeGreaterThanOrEqual(-1)
        expect(box.x + box.width, 'right edge in-viewport').toBeLessThanOrEqual(PHONE.width + 1)
      } finally { await ctx.close() }
    })
  }

  // Report evidence: install card + language switcher at mobile width, en + ar.
  for (const locale of ['en', 'ar'] as const) {
    test(`shots · ${locale} coach install + language (mobile)`, async ({ browser }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({ storageState: ROLES.coach.storage, locale, viewport: PHONE })
      const page = await ctx.newPage()
      try {
        await page.goto(`/${locale}/coach`)
        await page.evaluate(() => localStorage.removeItem('pwa_install_dismissed'))
        await page.reload()
        await expect(vis(page, '[data-testid="install-app-card"]').first()).toBeVisible({ timeout: 15_000 })
        await page.screenshot({ path: `screenshots/pwa-basics-install-coach-${locale}.png`, fullPage: true }).catch(() => {})
        await page.goto(`/${locale}/coach/profile`)
        await expect(vis(page, '[data-testid="settings-language"]').first()).toBeVisible({ timeout: 15_000 })
        await page.screenshot({ path: `screenshots/pwa-basics-language-coach-${locale}.png`, fullPage: true }).catch(() => {})
      } finally { await ctx.close() }
    })
  }
})
