import { test, expect, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * CSP-STYLE-FIX — prod `style-src` is now `'self' 'unsafe-inline'` (was over-hardened
 * to `'strict-dynamic' 'nonce-…'`, a script-only keyword set that stripped EVERY inline
 * style attribute in prod → unstyled sonner toasts / Radix Selects, and a FREEZE when an
 * open toast tried to re-position on viewport resize). This guards the regression: real
 * dashboard pages — full of inline styles (next/image `fill`, Radix/Floating-UI, React
 * `style={{}}`) — must fire ZERO `style-src` CSP violations. The local stack serves the
 * PROD CSP (middleware runs under `next start`), so this is a genuine prod-CSP assertion:
 * before the fix these pages fired many style-src violations; after, none.
 *
 * script-src stays strict ('strict-dynamic' + nonce) — a script-src violation would still
 * be reported here (we log ALL violations) but only style-src is asserted clean.
 */
async function styleViolations(page: Page): Promise<string[]> {
  // `violatedDirective` is 'style-src' | 'style-src-elem' | 'style-src-attr'.
  return page.evaluate(() =>
    (((window as unknown as { __csp?: string[] }).__csp) ?? []).filter((d) => d.startsWith('style-src')),
  )
}

test('CSP-STYLE-FIX · real staff pages fire NO style-src CSP violations (inline styles allowed)', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
  // Collect CSP violations at document-start, before any page script — survives each
  // full navigation (which re-runs this and resets the array to that page's violations).
  await ctx.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        (e as SecurityPolicyViolationEvent).violatedDirective,
      ),
    )
  })
  const page = await ctx.newPage()
  try {
    // /today + /schedule (calendar cells, next/image avatars) + /students (cards +
    // Radix filter) — the pages the RESPONSIVE-CSP note called out as having
    // "pre-existing inline-style violations" under the old strict style-src.
    for (const url of ['/en/today', '/en/schedule', '/en/students']) {
      await page.goto(url)
      await expect(page.locator('[data-testid="shell-content"], main').first(),
        `${url} rendered`).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(700) // let Radix/Floating-UI/async inline styles apply
      const v = await styleViolations(page)
      expect(v, `${url}: no style-src CSP violation (inline styles now allowed) — got ${JSON.stringify(v.slice(0, 4))}`).toEqual([])
    }
  } finally {
    await ctx.close()
  }
})

test('CSP-STYLE-FIX · a Radix Select opens WITHOUT a style-src violation (the freeze victim)', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ storageState: ROLES.coach.storage, locale: 'en' })
  await ctx.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        (e as SecurityPolicyViolationEvent).violatedDirective,
      ),
    )
  })
  const page = await ctx.newPage()
  try {
    // The coach shell hub — opening a Radix/Floating-UI popover (the coach-status
    // Select was a named victim) positions itself with inline styles. Under the old
    // CSP that inline positioning was stripped/looped; here it must apply cleanly.
    await page.goto('/en/coach')
    await expect(page.locator('main').first(), 'coach hub rendered').toBeVisible({ timeout: 20_000 })
    const trigger = page.locator('button[role="combobox"], [data-radix-select-trigger], [aria-haspopup="listbox"]').first()
    if (await trigger.count()) {
      await trigger.click().catch(() => {})
      await page.waitForTimeout(500)
    }
    const v = await styleViolations(page)
    expect(v, `coach hub + Select: no style-src violation — got ${JSON.stringify(v.slice(0, 4))}`).toEqual([])
  } finally {
    await ctx.close()
  }
})
