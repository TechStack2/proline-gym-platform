import { test } from '@playwright/test'

/**
 * LANDING-CUSTOM R4 — hero seam + dimensions evidence. Screenshots the DEFAULT gym
 * landing (no ?gym= → proline-gym, byte-identical to prod except this R4 fix) at the
 * wide-desktop widths where the dead-space + white-seam-against-the-dark-Affiliations-
 * band showed (1440, 1920) plus mobile (390), en + ar. Run on this branch = AFTER; the
 * same spec cherry-picked onto a main-based branch = BEFORE.
 *
 * No auth / no seed — a pure anon landing capture.
 */
const VIEWPORTS = [
  { w: 1440, h: 900, tag: '1440' },
  { w: 1920, h: 1080, tag: '1920' },
  { w: 390, h: 844, tag: '390' },
]

for (const loc of ['en', 'ar'] as const) {
  for (const vp of VIEWPORTS) {
    test(`hero seam · ${loc} · ${vp.tag}`, async ({ browser }) => {
      const ctx = await browser.newContext({ locale: loc, viewport: { width: vp.w, height: vp.h } })
      const page = await ctx.newPage()
      try {
        await page.goto(`/${loc}`, { waitUntil: 'domcontentloaded' })
        // let the hero image + brand vars settle so the seam is the real one.
        await page.waitForTimeout(700)
        // viewport-height capture shows the hero AND the top of the Affiliations band
        // (the seam) at each width.
        await page.screenshot({ path: `screenshots/hero-${loc}-${vp.tag}.png` }).catch(() => {})
      } finally {
        await ctx.close()
      }
    })
  }
}
