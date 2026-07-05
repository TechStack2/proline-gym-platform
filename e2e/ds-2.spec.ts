import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * DS-2 — dark mode. Asserts the load-bearing behaviour, not pixels:
 *   (a) DARK RENDERS on all three shells (staff/coach/portal), /en + /ar: the
 *       nonce'd init script puts .dark on <html> BEFORE paint (this runs under the
 *       local stack's PROD CSP, so it also proves the inline script is CSP-clean),
 *       and the channel-var flip actually changes the computed body background from
 *       the light ground to the dark ground — i.e. a var flip, not a per-component
 *       restyle.
 *   (b) LIGHT IS UNCHANGED: with no stored theme (default = system, Playwright
 *       colorScheme=light) the same body renders the ORIGINAL light ground.
 *   (c) The light/dark/system TOGGLE persists across a reload (system → dark stays
 *       dark, re-applied before paint → no flash).
 */
const LIGHT_GROUND = 'rgb(249, 250, 251)' // bg-gray-50 light = #f9fafb (unchanged)
const DARK_GROUND = 'rgb(26, 26, 32)'     // bg-gray-50 dark  = --c-gray-50 flip

const SURFACES = [
  { role: 'owner' as const, path: (l: string) => `/${l}/today`, label: 'staff' },
  { role: 'coach' as const, path: (l: string) => `/${l}/coach`, label: 'coach' },
  { role: 'student' as const, path: (l: string) => `/${l}/portal`, label: 'portal' },
]

function bodyBg(browser: Browser) {
  return async (role: keyof typeof ROLES, url: string, theme: 'light' | 'dark') => {
    const ctx = await browser.newContext({ storageState: ROLES[role].storage, colorScheme: 'light' })
    // Persist the choice BEFORE first paint — the layout's nonce'd init script reads it.
    if (theme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
    const page = await ctx.newPage()
    try {
      await page.goto(url)
      await expect(page.locator('[data-testid="shell-content"], main').first()).toBeVisible({ timeout: 20_000 })
      const hasDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'))
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      return { hasDark, bg }
    } finally {
      await ctx.close()
    }
  }
}

test('DS-2 · dark renders on all three shells (/en + /ar); light is unchanged', async ({ browser }) => {
  test.setTimeout(180_000)
  const measure = bodyBg(browser)
  for (const s of SURFACES) {
    for (const locale of ['en', 'ar']) {
      const url = s.path(locale)
      const dark = await measure(s.role, url, 'dark')
      expect(dark.hasDark, `${s.label} ${url}: html.dark applied before paint (CSP-clean)`).toBe(true)
      expect(dark.bg, `${s.label} ${url}: body flipped to the dark ground`).toBe(DARK_GROUND)

      const light = await measure(s.role, url, 'light')
      expect(light.hasDark, `${s.label} ${url}: default (system) stays light`).toBe(false)
      expect(light.bg, `${s.label} ${url}: light body is the ORIGINAL ground (no regression)`).toBe(LIGHT_GROUND)
    }
  }
})

test('DS-2 · the theme toggle persists across a reload (system → dark, no flash)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, colorScheme: 'light' })
  const page = await ctx.newPage()
  try {
    await page.goto('/en/portal')
    const html = page.locator('html')
    const toggle = page.getByTestId('theme-toggle').first()
    await expect(toggle, 'the theme toggle is in the shell header').toBeVisible({ timeout: 20_000 })
    // Default = system; Playwright colorScheme=light → not dark yet.
    await expect(html).not.toHaveClass(/dark/)
    await expect(toggle).toHaveAttribute('data-theme-mode', 'system')

    // Cycle system → light → dark.
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-theme-mode', 'light')
    await expect(html).not.toHaveClass(/dark/)
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-theme-mode', 'dark')
    await expect(html, 'dark applied on select').toHaveClass(/dark/)
    expect(await page.evaluate(() => localStorage.getItem('theme')), 'choice persisted').toBe('dark')

    // Reload → the init script re-applies dark before paint (persisted, no flash).
    await page.reload()
    await expect(html, 'dark survives the reload').toHaveClass(/dark/)
    await expect(page.getByTestId('theme-toggle').first(), 'toggle restores the stored mode')
      .toHaveAttribute('data-theme-mode', 'dark')
  } finally {
    await ctx.close()
  }
})
