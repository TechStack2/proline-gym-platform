import { test, expect, type Browser, type Page } from '@playwright/test'
import { ROLES, type Role } from './roles'
import { gymSlug } from './helpers'

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

// CI-HYGIENE: the recent-attendance proof-of-use previously depended on suite
// co-residents (activity-loop) having marked Karim's attendance earlier in the
// run — any TARGETED set without an attendance producer redded it. Self-seed the
// fixture: one 'present' row for Karim on his seeded class (service role,
// idempotent via the (class_id, student_id, attendance_date) unique key) so the
// spec passes in ANY set. No assertion changes — the populated-card assert is
// unchanged, it just owns its own data now.
test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return // legacy/local runs without a service key
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const gym = ((await (await fetch(`${url}/rest/v1/gyms?slug=eq.${encodeURIComponent(gymSlug())}&select=id`, { headers: H })).json()) as Array<{ id: string }>)[0]?.id
  if (!gym) return
  // Karim = the run gym's seeded student login profile (first_name_en Karim).
  const karim = ((await (await fetch(
    `${url}/rest/v1/students?gym_id=eq.${gym}&select=id,profiles!inner(first_name_en)&profiles.first_name_en=eq.Karim&limit=1`,
    { headers: H },
  )).json()) as Array<{ id: string }>)[0]?.id
  if (!karim) throw new Error('portal-fnd self-seed: Karim not found on the run gym')
  const enr = ((await (await fetch(
    `${url}/rest/v1/class_enrollments?student_id=eq.${karim}&is_active=eq.true&select=class_id&limit=1`,
    { headers: H },
  )).json()) as Array<{ class_id: string }>)[0]?.class_id
  if (!enr) throw new Error('portal-fnd self-seed: Karim has no enrollment on the run gym')
  const ins = await fetch(
    `${url}/rest/v1/attendance_records?on_conflict=class_id,student_id,attendance_date`,
    {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ class_id: enr, student_id: karim, attendance_date: new Date().toISOString().slice(0, 10), status: 'present' }),
    },
  )
  if (!ins.ok) throw new Error(`portal-fnd self-seed failed: ${ins.status} ${await ins.text()}`)
})

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

  // Not clipped: the shell settles fully WITHIN the viewport (no horizontal
  // overflow off either edge). Poll the live rect so we wait out the entrance
  // slide (PageTransition animates translateX over 300ms) before judging.
  await expect
    .poll(
      async () =>
        shell.first().evaluate((el) => {
          const r = (el as Element).getBoundingClientRect()
          return r.width > 100 && r.left >= -1 && Math.round(r.right) <= window.innerWidth + 2
        }),
      { timeout: 10_000, message: `${label}: the shell settles within the viewport (not clipped)` },
    )
    .toBe(true)

  // W2a (DS 2.0 §4.1) PREMISE UPDATE: desktop is no longer the max-w-3xl reading
  // column — the RULED first-class desktop composes a content grid capped at
  // 1200px (+ gutters), offset past the fixed side rail. The anti-sprawl claim
  // this guarded (DA-44's "full-bleed void") survives as: capped ≤1200+gutters
  // AND starting AFTER the rail (≥72px from the inline-start edge), never
  // under it (DA-4's class).
  const bb = await shell.first().boundingBox()
  if (viewport.width >= 768) {
    expect(bb!.width, `${label}: desktop shell is the capped §4.1 content grid, not full-bleed`).toBeLessThanOrEqual(1200 + 48 + 2)
    const railClear = await shell.first().evaluate((el) => {
      const r = (el as Element).getBoundingClientRect()
      const rtl = document.documentElement.dir === 'rtl'
      return rtl ? window.innerWidth - r.right : r.left
    })
    expect(railClear, `${label}: content starts after the rail (never under it)`).toBeGreaterThanOrEqual(72 - 2)
  }

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
