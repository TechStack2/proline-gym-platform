import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES } from './roles'

/**
 * DS2-TOKENS — §1 token doctrine, asserted where it actually has to hold: in the
 * browser, on rendered pages, against computed style. A token layer that only type-
 * checks has proved nothing; the failures this guards against (a role that silently
 * follows the brand, a category hue that changes on hydrate, a fixed surface that
 * flips anyway) are all invisible to the compiler.
 *
 *  (a) §1.3 THE ROLES ARE ACTUALLY SEPARATE — danger resolves to its own fixed ramp,
 *      not to the brand's, and the status hues resolve to the exact values they
 *      rendered before this slice (the §6.2 byte-identity claim, measured).
 *  (b) §1.3 DISC-COLOR — the timetable renders a TINT, not the old saturated fill,
 *      and the same class keeps the same hue across reloads (the hash is stable).
 *      This is DA-31: a normal class must not read as an alarm.
 *  (c) §1.2 FIXED SURFACES — .surface-fixed-dark stays dark under html.dark (the
 *      landing hero AND the Affiliations band, which is DA-27's fix), and
 *      .surface-paper keeps the receipt on the light ramp from a dark session.
 */

// The exact values these roles rendered BEFORE the slice, read off the pre-change
// tailwind.config.ts literals. If a refactor ever moves one, that is a repaint, and
// this suite should be the thing that says so.
const DANGER_500 = 'rgb(239, 68, 68)'   // was destructive.DEFAULT #ef4444
const SUCCESS_700 = 'rgb(21, 128, 61)'  // was success.700 #15803d
const WARNING_600 = 'rgb(217, 119, 6)'  // was warning.600 #d97706
const INFO_500 = 'rgb(59, 130, 246)'    // was info.500 #3b82f6
const WHATSAPP = 'rgb(37, 211, 102)'    // was the bare #25D366 literal

async function staffPage(browser: Browser, theme: 'light' | 'dark' = 'light') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, colorScheme: 'light' })
  if (theme === 'dark') await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
  return { ctx, page: await ctx.newPage() }
}

/** Resolve a token by painting it on a throwaway probe element — the honest read. */
async function resolveVar(page: Page, cssVar: string) {
  return page.evaluate((v) => {
    const el = document.createElement('div')
    el.style.color = `rgb(var(${v}))`
    document.body.appendChild(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  }, cssVar)
}

test('DS2-TOKENS · (a) the five roles are separate, and the fixed ones did not repaint', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await staffPage(browser)
  try {
    await page.goto('/en/today')
    await expect(page.locator('[data-testid="shell-content"], main').first()).toBeVisible({ timeout: 20_000 })

    // The status + destructive ramps must be EXACTLY what they were. This is the
    // §6.2 byte-identity claim stated as an assertion rather than a promise.
    expect(await resolveVar(page, '--c-danger-500'), 'danger 500 == the former destructive DEFAULT').toBe(DANGER_500)
    expect(await resolveVar(page, '--c-success-700'), 'success 700 unchanged').toBe(SUCCESS_700)
    expect(await resolveVar(page, '--c-warning-600'), 'warning 600 unchanged').toBe(WARNING_600)
    expect(await resolveVar(page, '--c-info-500'), 'info 500 unchanged').toBe(INFO_500)
    expect(await resolveVar(page, '--c-whatsapp'), 'the WhatsApp green is now a token').toBe(WHATSAPP)

    // THE POINT OF THE SPLIT: danger is not the brand. Proline's brand IS crimson, so
    // these two are near neighbours — which is exactly the case where a shared ramp
    // hides a destructive action. They must still be distinct tokens.
    const brand = await resolveVar(page, '--c-brand-700')
    const danger = await resolveVar(page, '--c-danger-500')
    expect(brand, 'brand and danger are separate tokens even for a red-branded gym').not.toBe(danger)

    // …and danger must not move when the brand does. Repaint the brand to teal and
    // re-read: a per-gym brand override must leave the destructive ramp alone.
    await page.evaluate(() => document.documentElement.style.setProperty('--c-brand-700', '13 148 136'))
    expect(await resolveVar(page, '--c-brand-700'), 'the brand override took').toBe('rgb(13, 148, 136)')
    expect(await resolveVar(page, '--c-danger-500'), 'danger is FIXED — a rebrand cannot reach it').toBe(DANGER_500)
  } finally {
    await ctx.close()
  }
})

test('DS2-TOKENS · (b) DISC-COLOR paints a stable tint, not the old alarm fill', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await staffPage(browser)
  try {
    await page.goto('/en/schedule')
    const chip = page.getByTestId('week-chip').first()
    await expect(chip, 'the week grid renders class chips').toBeVisible({ timeout: 20_000 })

    const paint = await chip.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, color: cs.color, cat: el.getAttribute('data-cat') }
    })

    // The hue comes from the palette, addressed by the hash.
    expect(paint.cat, 'the chip carries a category slot').toMatch(/^[1-8]$/)

    // DA-31: a TINT, not a saturated fill. The old chip was an opaque brand-red block
    // with white text; the new one is a low-alpha wash with dark text on it.
    expect(paint.bg, 'the cell is a translucent tint, not an opaque fill').toMatch(/^rgba\(/)
    const alpha = Number(paint.bg.match(/[\d.]+\)$/)?.[0].replace(')', ''))
    expect(alpha, 'tint strength stays in the calm band').toBeGreaterThan(0)
    expect(alpha, 'tint strength stays in the calm band').toBeLessThan(0.3)
    expect(paint.color, 'the label is the hue text, not white on a fill').not.toBe('rgb(255, 255, 255)')

    // Still coloured at all — the assertion RESPONSIVE-CSP made, kept honest here now
    // that the colour comes from a static stylesheet rather than a nonce'd <style>.
    expect(paint.bg, 'the chip is actually painted').not.toBe('rgba(0, 0, 0, 0)')

    // STABILITY: the hash is pure, so a reload must not re-hue the same class. A drift
    // here would mean a chip changing colour under the user between navigations.
    await page.reload()
    await expect(page.getByTestId('week-chip').first()).toBeVisible({ timeout: 20_000 })
    const again = await page.getByTestId('week-chip').first().evaluate((el) => ({
      cat: el.getAttribute('data-cat'),
      bg: getComputedStyle(el).backgroundColor,
    }))
    expect(again.cat, 'the same discipline keeps its hue across reloads').toBe(paint.cat)
    expect(again.bg, 'and paints identically').toBe(paint.bg)

    // The nonce'd per-discipline stylesheet is gone — nothing dynamic reaches the CSP.
    await expect(page.getByTestId('schedule-cellbg'), 'no injected palette stylesheet remains').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('DS2-TOKENS · (c) fixed surfaces stay fixed under html.dark', async ({ browser }) => {
  test.setTimeout(150_000)

  // The landing hero + the Affiliations band (DA-27) are DESIGNED-dark: they must read
  // dark in BOTH themes. Before this slice the band flipped to light and broke the
  // hero→band rhythm; the hero was already pinned, ad hoc.
  {
    const ctx = await browser.newContext({ colorScheme: 'light' })
    await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'))
    const page = await ctx.newPage()
    try {
      await page.goto('/en')
      const hero = page.locator('section.surface-fixed-dark').first()
      await expect(hero, 'the hero wears the fixed-surface utility').toBeVisible({ timeout: 20_000 })
      expect(
        await page.locator('html').evaluate((el) => el.classList.contains('dark')),
        'the page really is in dark mode (otherwise this proves nothing)',
      ).toBe(true)

      const band = page.locator('#affiliations')
      await band.scrollIntoViewIfNeeded()
      const bandBg = await band.evaluate((el) => getComputedStyle(el).backgroundColor)
      // bg-secondary-950 pinned = rgb(31,31,31); flipped it would be near-white.
      const [r, g, b] = bandBg.match(/\d+/g)!.map(Number)
      expect(
        (r + g + b) / 3,
        `DA-27: the Affiliations band stays designed-dark in dark mode (was ${bandBg})`,
      ).toBeLessThan(80)
    } finally {
      await ctx.close()
    }
  }

  // The receipt is paper: it must print and preview on the LIGHT ramp even when the
  // staff member is working in dark mode, or a print from a dark session comes out
  // as dark-on-light garbage.
  {
    const { ctx, page } = await staffPage(browser, 'dark')
    try {
      await page.goto('/en/invoices')
      await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 })
      const probe = await page.evaluate(() => {
        const el = document.createElement('div')
        el.className = 'surface-paper'
        el.style.backgroundColor = 'rgb(var(--c-white))'
        el.style.color = 'rgb(var(--c-gray-900))'
        document.body.appendChild(el)
        const cs = getComputedStyle(el)
        const out = { bg: cs.backgroundColor, ink: cs.color }
        el.remove()
        return out
      })
      expect(probe.bg, 'surface-paper keeps white paper in a dark session').toBe('rgb(255, 255, 255)')
      expect(probe.ink, 'surface-paper keeps dark ink in a dark session').toBe('rgb(17, 24, 39)')
    } finally {
      await ctx.close()
    }
  }
})
