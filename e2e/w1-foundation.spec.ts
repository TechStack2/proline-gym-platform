import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES, type Role } from './roles'
import { vis } from './helpers'

/**
 * W1-FOUNDATION — behavioural guards for the §2 primitive layer as adopted on the
 * STAFF shell:
 *   · TabBar   (§2.2) — real nav ARIA, ≤5 capacity, hide-on-scroll, routing intact
 *   · PageHeader (§2.1) — ONE h1 per breakpoint, one term across breakpoints (DA-29)
 *   · fmt/bidi (§2.7) — the DA-7 anchors are isolated, not merely dir'd
 *
 * Read-only apart from navigation; runs as the seeded owner.
 */
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

async function owner(browser: Browser, viewport: { width: number; height: number }, locale: 'en' | 'ar' = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale, viewport })
  return { ctx, page: await ctx.newPage() }
}

const scrollMain = (page: Page, top: number | 'end') =>
  page.evaluate((t) => {
    const m = document.querySelector('main')
    if (m) m.scrollTop = t === 'end' ? m.scrollHeight : (t as number)
  }, top)

test('W1 · TabBar is NAVIGATION: <nav> + aria-current, no bogus tablist ARIA (DA-60)', async ({ browser }) => {
  const { ctx, page } = await owner(browser, MOBILE)
  try {
    await page.goto('/en/today')
    const bar = vis(page, '[data-testid="tab-bar"]').first()
    await expect(bar, 'the staff bottom bar renders at 390').toBeVisible({ timeout: 15_000 })

    // It is a <nav>, and the old role="tablist"/"tab"/aria-controls is gone.
    expect(await bar.evaluate((el) => el.tagName.toLowerCase())).toBe('nav')
    await expect(bar.locator('[role="tab"]'), 'no role="tab" children').toHaveCount(0)
    await expect(page.locator('[aria-controls^="tabpanel-"]'), 'no dangling aria-controls').toHaveCount(0)

    // §2.2 capacity: exactly the 4 primary workspaces + More, never more.
    const tabs = bar.locator('[data-testid^="tab-"]')
    await expect(tabs, 'capacity is 5 including More').toHaveCount(5)

    // The active destination is announced, and only one is.
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(bar.locator('[data-testid="tab-today"][aria-current="page"]')).toBeVisible()

    // Routing still works through the primitive.
    await bar.locator('[data-testid="tab-members"]').click()
    await expect(page).toHaveURL(/\/en\/students/, { timeout: 15_000 })
    await expect(bar.locator('[data-testid="tab-members"][aria-current="page"]')).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('W1 · TabBar hides on scroll-down and returns on scroll-up (§2.2)', async ({ browser }) => {
  test.setTimeout(90_000)
  const { ctx, page } = await owner(browser, MOBILE)
  try {
    await page.goto('/en/students')
    const bar = vis(page, '[data-testid="tab-bar"]').first()
    await expect(bar).toBeVisible({ timeout: 15_000 })
    await expect(bar, 'shown at the top of the container').toHaveAttribute('data-hidden', 'false')

    // Enough content to scroll? The roster is long, but guard rather than flake.
    const scrollable = await page.evaluate(() => {
      const m = document.querySelector('main')
      return m ? m.scrollHeight - m.clientHeight : 0
    })
    test.skip(scrollable < 200, 'this gym seed renders a roster too short to scroll')

    await scrollMain(page, 'end')
    await expect(bar, 'scrolling DOWN hides the bar').toHaveAttribute('data-hidden', 'true', { timeout: 5_000 })
    // Transform-only: the bar is translated out, never unmounted (no layout shift).
    await expect(bar).toBeVisible()

    await scrollMain(page, 0)
    await expect(bar, 'scrolling UP brings it back').toHaveAttribute('data-hidden', 'false', { timeout: 5_000 })
  } finally {
    await ctx.close()
  }
})

test('W1 · PageHeader: ONE h1 per breakpoint, and the SAME term on both (DA-29/DA-60)', async ({ browser }) => {
  test.setTimeout(90_000)

  // Desktop: the content h1 is the only one, and it says the nav's term.
  const d = await owner(browser, DESKTOP)
  try {
    await d.page.goto('/en/students')
    const title = vis(d.page, '[data-testid="page-title"]').first()
    await expect(title).toBeVisible({ timeout: 15_000 })
    await expect(d.page.locator('h1:visible'), 'exactly one visible h1 at 1280').toHaveCount(1)
    // DA-29: the roster said "Students" on desktop and "Members" in the nav.
    await expect(title).toHaveText('Members')
    await d.page.goto('/en/coaches')
    await expect(vis(d.page, '[data-testid="page-title"]').first()).toHaveText('Team')
  } finally {
    await d.ctx.close()
  }

  // Mobile: the shell's large title owns it, the desktop header is not rendered,
  // and the term agrees with what desktop showed.
  const m = await owner(browser, MOBILE)
  try {
    await m.page.goto('/en/students')
    const large = vis(m.page, '[data-testid="native-large-title"]').first()
    await expect(large).toBeVisible({ timeout: 15_000 })
    await expect(large).toHaveText('Members')
    await expect(m.page.locator('h1:visible'), 'exactly one visible h1 at 390').toHaveCount(1)
  } finally {
    await m.ctx.close()
  }

  // 768–1023 band — PREMISE UPDATED (W2b / §4.1): the staff chrome now switches
  // at md, so this band is DESKTOP mode — the PageHeader h1 is the one title
  // (the mobile large title is not rendered). The invariant (exactly ONE visible
  // h1 in the once-double-h1 band) is unchanged.
  const t = await owner(browser, { width: 800, height: 900 })
  try {
    await t.page.goto('/en/students')
    await expect(vis(t.page, '[data-testid="page-title"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(t.page.locator('[data-testid="native-large-title"]'), 'no mobile large title at 800').toBeHidden()
    await expect(t.page.locator('h1:visible'), 'exactly one visible h1 at 800').toHaveCount(1)
  } finally {
    await t.ctx.close()
  }
})

test('W1 · DA-7 anchors are ISOLATED, not merely dir-attributed (§2.7)', async ({ browser }) => {
  test.setTimeout(120_000)
  const { ctx, page } = await owner(browser, DESKTOP, 'ar')
  try {
    // ── money: the amounts are LTR-isolated runs, so they cannot swap sides ──
    await page.goto('/ar/money')
    const outstanding = vis(page, '[data-testid="money-outstanding"]').first()
    await expect(outstanding).toBeVisible({ timeout: 20_000 })
    const isolated = outstanding.locator('[dir="ltr"]').first()
    await expect(isolated, 'the amount sits inside an isolate').toBeVisible()
    expect(
      await isolated.evaluate((el) => getComputedStyle(el).unicodeBidi),
      'unicode-bidi is a true isolate (dir alone only sets a base direction)',
    ).toContain('isolate')
    // Element isolation leaves textContent untouched — no stray control characters
    // leak into the DOM (which is what keeps every money assertion in the suite
    // passing through this migration).
    const raw = (await outstanding.textContent()) ?? ''
    expect(/[\u2066-\u2069]/.test(raw), 'no isolate control chars in textContent').toBe(false)
    expect(raw.trim().length, 'an amount actually rendered').toBeGreaterThan(0)

    // ── member-360: the membership range isolates BOTH sides (DA-7's headline) ──
    await page.goto('/ar/students')
    const card = vis(page, '[data-testid="student-card"]').first()
    await expect(card, 'the roster has at least one member').toBeVisible({ timeout: 20_000 })
    await card.click()
    const period = vis(page, '[data-testid="membership-period"]').first()
    if (await period.count()) {
      await expect(period.locator('[dir="ltr"]'), 'each date is its own isolate').toHaveCount(2)
    }
  } finally {
    await ctx.close()
  }
})

/**
 * §2.7 missing-key gate — the explicit sweep. In the CI build
 * (NEXT_PUBLIC_I18N_STRICT=1) a missing message renders `MISSING_MESSAGE:<key>`
 * instead of a bare key path that reads like copy, so this walks the surfaces
 * DA-5 would have hidden on and names the offender when one appears.
 */
const SWEEP: { role: Role; paths: string[] }[] = [
  { role: 'owner', paths: ['/today', '/inbox', '/students', '/students/guardians', '/schedule', '/money', '/coaches', '/settings', '/setup'] },
  { role: 'coach', paths: ['/coach', '/coach/pt', '/coach/students'] },
  { role: 'student', paths: ['/portal', '/portal/billing', '/portal/progress'] },
]

for (const locale of ['en', 'ar'] as const) {
  test(`W1 · no MISSING_MESSAGE anywhere on the swept surfaces · ${locale}`, async ({ browser }) => {
    test.setTimeout(180_000)
    const offenders: string[] = []
    for (const { role, paths } of SWEEP) {
      const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale, viewport: DESKTOP })
      const page = await ctx.newPage()
      try {
        for (const path of paths) {
          await page.goto(`/${locale}${path}`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const body = await page.locator('body').innerText()
          for (const hit of body.match(/MISSING_MESSAGE:[\w.]+/g) ?? []) {
            offenders.push(`${locale}${path} → ${hit}`)
          }
        }
      } finally {
        await ctx.close()
      }
    }
    expect(offenders, 'every rendered message resolves').toEqual([])
  })
}
