import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * DS-1 — design-system foundation. Asserts the load-bearing tokens, not pixels:
 *   (a) the per-role --surface accent differs (shell top stripe: reception=crimson,
 *       coach=graphite, member=bronze) — AND is applied via a bundled class/var, so
 *       the computed color renders under the prod CSP (a stripped inline style would
 *       leave it transparent → this also covers (c) "no CSP inline-style breakage").
 *   (b) Arabic per-script type: body ≥1.1× the Latin equivalent, line-height ≥1.6,
 *       letter-spacing normal (never track the connected script).
 * (d) "existing e2e stays green" is a separate cross-suite run (testid-safe restyle).
 * /en + /ar.
 */
const CRIMSON = 'rgb(205, 20, 25)' // #cd1419 — reception
const GRAPHITE = 'rgb(71, 85, 105)' // #475569 — coach
const BRONZE = 'rgb(180, 83, 9)' // #b45309 — member

async function stripeColor(browser: Browser, role: keyof typeof ROLES, url: string): Promise<string> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', viewport: { width: 390, height: 780 } })
  const page = await ctx.newPage()
  try {
    await page.goto(url)
    const stripe = page.getByTestId('shell-accent-stripe').first()
    await expect(stripe, 'the shell accent stripe renders').toBeVisible({ timeout: 20_000 })
    // A bundled class (bg-[color:var(--shell-accent)]) + a bundled --surface var → the
    // computed color IS the per-role surface. A CSP-stripped inline style → transparent.
    return stripe.evaluate((el) => getComputedStyle(el).backgroundColor)
  } finally {
    await ctx.close()
  }
}

test('DS-1 · the per-role --surface accent differs (reception crimson · coach graphite · member bronze)', async ({ browser }) => {
  const reception = await stripeColor(browser, 'owner', '/en/today')
  const coach = await stripeColor(browser, 'coach', '/en/coach')
  const member = await stripeColor(browser, 'student', '/en/portal')

  expect(reception, 'reception surface = crimson').toBe(CRIMSON)
  expect(coach, 'coach surface = graphite').toBe(GRAPHITE)
  expect(member, 'member surface = bronze').toBe(BRONZE)
  // and the three are DISTINCT — the whole point of the "which surface" signal.
  expect(new Set([reception, coach, member]).size, 'three distinct per-role surfaces').toBe(3)
})

async function measureBaseText(browser: Browser, locale: 'en' | 'ar') {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  try {
    // A public page whose <html dir> matches the locale (dir drives the RTL ramp).
    await page.goto(`/${locale}/auth/login`)
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr', { timeout: 15_000 })
    return page.evaluate(() => {
      const el = document.createElement('p')
      el.className = 'text-base'
      el.textContent = 'Body نص عربي'
      document.body.appendChild(el)
      const cs = getComputedStyle(el)
      const out = { fontSize: parseFloat(cs.fontSize), lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing }
      el.remove()
      return out
    })
  } finally {
    await ctx.close()
  }
}

test('DS-1 · Arabic per-script type is larger + looser + untracked vs Latin', async ({ browser }) => {
  const en = await measureBaseText(browser, 'en')
  const ar = await measureBaseText(browser, 'ar')

  // (b) Arabic body ≥1.1× the Latin equivalent (DS-1 targets ~1.13×).
  expect(ar.fontSize / en.fontSize, `ar ${ar.fontSize}px vs en ${en.fontSize}px ≥ 1.1×`).toBeGreaterThanOrEqual(1.1)
  // line-height ≥1.6 for the connected script.
  const arLineRatio = parseFloat(ar.lineHeight) / ar.fontSize
  expect(arLineRatio, `ar line-height ratio ${arLineRatio.toFixed(2)} ≥ 1.6`).toBeGreaterThanOrEqual(1.6)
  // letter-spacing normal — tracking breaks Arabic letterforms.
  const untracked = ar.letterSpacing === 'normal' || parseFloat(ar.letterSpacing) === 0
  expect(untracked, `ar letter-spacing must be normal/0 (got "${ar.letterSpacing}")`).toBeTruthy()
})
