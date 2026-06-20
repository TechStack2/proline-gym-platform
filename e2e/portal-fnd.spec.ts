import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES, type Role } from './roles'

/**
 * PORTAL-FND — the portal design-system + shell FOUNDATION.
 *
 * The visual "premium feel" is the operator's eye, but the structure the slice
 * built is testable, and that's what this pins:
 *  1. Both self-service homes (member `student@` + coach `coach@`) render the
 *     ONE unified shell (`portal-shell` from portal-kit's `PortalContent`) — on
 *     BOTH a desktop and a mobile viewport — rendered exactly once (no double
 *     shell) and not clipped out of the viewport (the "overlapping" fix), with a
 *     design-system card token (`portal-card` → the ui/* `<Card>`) and a brand
 *     token (`portal-brand`, brand-red) present.
 *  2. A portal page renders a `src/components/ui/*` component (PortalCard composes
 *     `<Card>`) AND the staff drillable-card kit (ActionCard + DrillDetails) imports
 *     + RENDERS portal-side — the recent-attendance proof-of-use (Karim has
 *     attendance by now: activity-loop marks him present/absent earlier in the run).
 *  3. `/ar` on a portal page is RTL-clean: `dir=rtl`, zero MISSING_MESSAGE.
 *
 * Switches roles internally (own context per role, like ax1-ar.spec) so the
 * project pins no single storageState.
 */

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }

async function open(browser: Browser, role: Role, viewport: { width: number; height: number }, url: string, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, viewport, locale })
  const page = await ctx.newPage()
  await page.goto(url)
  return { ctx, page }
}

/** Assert the unified, themed, non-overlapping shell on one home at one viewport. */
async function assertShell(page: Page, viewport: { width: number; height: number }, label: string) {
  const shell = page.locator('[data-testid="portal-shell"]')
  await expect(shell.first(), `${label}: the unified portal shell renders`).toBeVisible({ timeout: 15_000 })
  // Rendered exactly once — the portals don't double-mount the shell.
  await expect(shell, `${label}: the shell renders exactly once (no double-shell)`).toHaveCount(1)

  // Not clipped: the shell's box sits within the viewport (no horizontal overflow
  // off either edge — the centred max-width column + the rail-clearing margin).
  const bb = await shell.first().boundingBox()
  expect(bb, `${label}: the shell has a layout box`).toBeTruthy()
  expect(bb!.width, `${label}: the shell has real width`).toBeGreaterThan(100)
  expect(bb!.x, `${label}: the shell is not pushed off the left edge`).toBeGreaterThanOrEqual(0)
  expect(
    Math.round(bb!.x + bb!.width),
    `${label}: the shell is not clipped off the right edge`,
  ).toBeLessThanOrEqual(viewport.width + 2)

  // A design-system card token renders (PortalCard → the ui/* <Card>).
  await expect(
    page.locator('[data-testid="portal-card"]').first(),
    `${label}: a design-system card (ui/* <Card>) renders`,
  ).toBeVisible()

  // A brand token renders + actually computes to brand red (the "themeless" fix).
  const brand = page.locator('[data-testid="portal-brand"]').first()
  await expect(brand, `${label}: a brand-token element renders`).toBeVisible()
  const color = await brand.evaluate((el) => getComputedStyle(el as Element).color)
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  expect(m, `${label}: brand color parsed from "${color}"`).toBeTruthy()
  const [r, g, b] = [Number(m![1]), Number(m![2]), Number(m![3])]
  expect(
    r > 150 && g < 90 && b < 90,
    `${label}: the brand token computes to brand-red (got ${color})`,
  ).toBeTruthy()
}

test('PORTAL-FND · member + coach portals adopt the unified themed shell (desktop + mobile)', async ({ browser }) => {
  test.setTimeout(120_000)
  for (const vp of [DESKTOP, MOBILE]) {
    const tag = vp.width >= 768 ? 'desktop' : 'mobile'

    const member = await open(browser, 'student', vp, '/en/portal')
    try {
      await assertShell(member.page, vp, `member ${tag}`)
    } finally {
      await member.ctx.close()
    }

    const coach = await open(browser, 'coach', vp, '/en/coach')
    try {
      await assertShell(coach.page, vp, `coach ${tag}`)
    } finally {
      await coach.ctx.close()
    }
  }
})

test('PORTAL-FND · ui/* + ActionCard/DrillDetails kit render portal-side (proof-of-use)', async ({ browser }) => {
  const member = await open(browser, 'student', DESKTOP, '/en/portal')
  try {
    // A portal-kit testid is visible (the unified shell) …
    await expect(member.page.locator('[data-testid="portal-shell"]').first()).toBeVisible({ timeout: 15_000 })
    // … a src/components/ui/* component renders (PortalCard composes <Card>) …
    await expect(
      member.page.locator('[data-testid="portal-card"]').first(),
      'a ui/* <Card> renders portal-side',
    ).toBeVisible()
    // … the ActionCard framework renders portal-side …
    await expect(
      member.page.locator('[data-testid="card-portal-recent-attendance"]').first(),
      'ActionCard renders portal-side (populated — Karim has attendance by now)',
    ).toBeVisible()
    // … and the DrillDetails (the drillable proof-of-use) renders inside it.
    await expect(
      member.page.locator('[data-testid="portal-attendance-drill"]').first(),
      'DrillDetails renders portal-side',
    ).toBeVisible()
  } finally {
    await member.ctx.close()
  }
})

test('PORTAL-FND · /ar portal is RTL-clean (dir=rtl, no MISSING_MESSAGE)', async ({ browser }) => {
  const member = await open(browser, 'student', DESKTOP, '/ar/portal', 'ar')
  try {
    await expect(member.page.locator('[data-testid="portal-shell"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(member.page.locator('html'), 'the document mirrors to RTL').toHaveAttribute('dir', 'rtl')
    const body = await member.page.locator('body').innerText()
    expect(body, '/ar/portal must not leak a MISSING_MESSAGE').not.toContain('MISSING_MESSAGE')
  } finally {
    await member.ctx.close()
  }
})
