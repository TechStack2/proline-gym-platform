import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'

/**
 * MONDAY-HARDEN B — native <select> controls are dark-themed under html.dark. Native
 * controls are UA-rendered: class-based dark mode does NOT theme their option list /
 * arrow / focus ring → the UA paints them white in dark (the owner symptom). The
 * global `select` rule sets `color-scheme` (flips the whole native control including
 * the popup); the field surface flips via channel vars.
 *
 * PREMISE UPDATE (W4): the coach status FILTER this asserted is now chips (§2.6 —
 * list-surface filters are chips/searchable-Dialog; no filter renders a native
 * select anymore). The surviving native selects are DATA-ENTRY controls riding the
 * `ui/select` wrapper, whose `bg-background` (rgb(var(--c-bg))) flips to #131317 in
 * dark — the invariant this spec protects (dark field + dark popup via color-scheme,
 * original white in light) now lives there. Asserted on the profile language select.
 *
 * (PART A — the update prompt is now a custom banner, not a duration:Infinity sonner
 * toast; it's covered by pwa-session's `sw-update-toast` + Refresh assertions. The
 * resize-FREEZE itself is validated by a live prod resize test, per the slice.)
 */
const DARK_SURFACE = 'rgb(19, 19, 23)'   // bg-background = --c-bg flipped = #131317
const LIGHT_SURFACE = 'rgb(255, 255, 255)'

async function filterStyle(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en', colorScheme: 'light' })
  if (theme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const page = await ctx.newPage()
  try {
    await page.goto('/en/profile')
    const select = page.locator('select').first()
    await expect(select, 'the profile language <select> renders').toBeVisible({ timeout: 20_000 })
    const hasDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'))
    const style = await select.evaluate((el) => {
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, scheme: s.colorScheme }
    })
    return { hasDark, ...style }
  } finally {
    await ctx.close()
  }
}

test('MONDAY-HARDEN · the native status filter is dark under html.dark (light unchanged)', async ({ browser }) => {
  test.setTimeout(90_000)

  const dark = await filterStyle(browser, 'dark')
  expect(dark.hasDark, 'dark mode active').toBe(true)
  expect(dark.bg, 'the native <select> field is the dark surface, not UA white').toBe(DARK_SURFACE)
  expect(dark.scheme, 'color-scheme:dark → the native option list + focus ring render dark').toContain('dark')

  const light = await filterStyle(browser, 'light')
  expect(light.hasDark, 'default (system) stays light').toBe(false)
  expect(light.bg, 'the native <select> is the ORIGINAL white in light (no regression)').toBe(LIGHT_SURFACE)
  expect(light.scheme, 'color-scheme:light in light mode').toContain('light')
})
