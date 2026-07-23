import { test, expect, type Browser } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'

/**
 * J6 GO-LIVE-PANEL — the /publish page (owner/head_coach).
 *
 * Proves the guided panel drives the SAME publish gates the scattered per-Class /
 * per-Coach controls always did:
 *   1. A class visibility toggle flips `classes.show_on_landing`, and the anon
 *      `?gym=<slug>` landing reflects it — asserted both via the exact definer RPC
 *      the public schedule calls (`get_landing_schedule`, which gates on
 *      show_on_landing) AND on the rendered logged-out page. Toggled back to the
 *      seed baseline (all e2e classes are seeded published, 000036) in a finally so
 *      the shared per-worker gym stays clean for landing.spec regardless of order.
 *   2. A coach visibility toggle flips + persists across a reload (the
 *      set_coach_landing RPC), then is restored.
 *   3. The links panel renders the landing + member-login share links with copy.
 *   4. The platform-wide forgot-password link on /auth/login reaches a generic
 *      success (no account enumeration).
 *
 * Anchored testMatch (leading slash) so it never substring-collides.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SEEDED_CLASS = 'Muay Thai Beginner'

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
}
/** Call a definer landing RPC as a logged-out (anon) visitor — the exact path the public page uses. */
async function anonRpc<T = unknown>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`anon rpc ${fn}: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}
async function setClassPublished(classId: string, on: boolean) {
  await svc(`classes?id=eq.${classId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ show_on_landing: on }),
  })
}
/** Does the rendered anon landing list the class in its public schedule? */
async function landingRendersClass(browser: Browser, slug: string, name: string): Promise<boolean> {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(slug)}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    const schedule = page.locator('#schedule')
    // LANDING DA-13 (§115): zero published classes → the section COLLAPSES; an
    // absent schedule is the strongest possible "not rendered on the landing".
    if ((await schedule.count()) === 0) return false
    return (await schedule.getByText(name, { exact: false }).count()) > 0
  } finally {
    await ctx.close()
  }
}

test.describe('PUBLISH · J6 go-live panel', () => {
  test('class toggle reflects on the anon landing · coach toggle persists · links render', async ({ browser }) => {
    test.setTimeout(150_000)
    if (!URL || !KEY || !ANON) {
      throw new Error('PUBLISH needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }
    const slug = E2E_GYM_SLUG

    // Resolve the run gym + its seeded, scheduled class (service role).
    const gymRows = (await (await svc(`gyms?slug=eq.${encodeURIComponent(slug)}&select=id`)).json()) as { id: string }[]
    const gymId = gymRows[0]?.id
    expect(gymId, 'e2e run gym resolved').toBeTruthy()
    const classRows = (await (
      await svc(`classes?gym_id=eq.${gymId}&name_en=eq.${encodeURIComponent(SEEDED_CLASS)}&select=id`)
    ).json()) as { id: string }[]
    const classId = classRows[0]?.id
    expect(classId, `seeded "${SEEDED_CLASS}" resolved`).toBeTruthy()

    // Known baseline: published (the seed default) → we start from data-on=true.
    await setClassPublished(classId, true)

    // Captured inside the run so the finally can restore the coach regardless of
    // where an assertion fails.
    let coachId: string | null = null
    let coachBefore: string | null = null

    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
    const page = await ctx.newPage()
    try {
      await page.goto('/en/publish')
      await expect(page.getByTestId('publish-panel')).toBeVisible({ timeout: 15_000 })

      // (c) Links panel — landing + member-login share links, each with copy; preview.
      await expect(page.getByTestId('publish-links')).toBeVisible()
      await expect(page.getByTestId('publish-landing-url')).toContainText(`?gym=${slug}`)
      await expect(page.getByTestId('publish-landing-copy')).toBeVisible()
      await expect(page.getByTestId('publish-login-url')).toContainText('/auth/login')
      await expect(page.getByTestId('publish-login-copy')).toBeVisible()
      await expect(page.getByTestId('publish-preview')).toBeVisible()

      // (a) Class toggle — start published.
      const classToggle = page.locator(`[data-testid="publish-class-toggle"][data-id="${classId}"]`)
      await expect(classToggle).toBeVisible({ timeout: 15_000 })
      await expect(classToggle).toHaveAttribute('data-on', 'true')

      // ── Toggle OFF → the anon landing no longer lists the class ──
      await classToggle.click()
      await expect(classToggle).toHaveAttribute('data-on', 'false', { timeout: 15_000 })
      await expect
        .poll(
          async () => {
            const rows = await anonRpc<{ name_en: string }[]>('get_landing_schedule', { p_gym_id: gymId })
            return rows.some((r) => (r.name_en || '').includes(SEEDED_CLASS))
          },
          { timeout: 15_000, message: 'anon landing schedule drops the hidden class' },
        )
        .toBe(false)
      expect(await landingRendersClass(browser, slug, SEEDED_CLASS), 'rendered landing hides it').toBe(false)

      // ── Toggle ON → the anon landing lists it again ──
      await classToggle.click()
      await expect(classToggle).toHaveAttribute('data-on', 'true', { timeout: 15_000 })
      await expect
        .poll(
          async () => {
            const rows = await anonRpc<{ name_en: string }[]>('get_landing_schedule', { p_gym_id: gymId })
            return rows.some((r) => (r.name_en || '').includes(SEEDED_CLASS))
          },
          { timeout: 15_000, message: 'anon landing schedule shows the published class' },
        )
        .toBe(true)
      expect(await landingRendersClass(browser, slug, SEEDED_CLASS), 'rendered landing shows it').toBe(true)

      // (a) Coach toggle — flips + persists across a reload, then restored.
      const firstCoach = page.getByTestId('publish-coach-toggle').first()
      await expect(firstCoach, 'at least one coach to publish').toBeVisible({ timeout: 15_000 })
      coachId = await firstCoach.getAttribute('data-id')
      coachBefore = await firstCoach.getAttribute('data-on')
      const flipped = coachBefore === 'true' ? 'false' : 'true'
      const coachSel = `[data-testid="publish-coach-toggle"][data-id="${coachId}"]`
      await firstCoach.click()
      await expect(page.locator(coachSel)).toHaveAttribute('data-on', flipped, { timeout: 15_000 })
      // Wait for the set_coach_landing write to COMMIT before reloading (the toggle
      // is optimistic — the click returns before the server action resolves).
      await expect
        .poll(
          async () => {
            const rows = (await (await svc(`coaches?id=eq.${coachId}&select=landing_visible`)).json()) as { landing_visible: boolean }[]
            return String(!!rows[0]?.landing_visible)
          },
          { timeout: 15_000, message: 'coach landing_visible persisted to the DB' },
        )
        .toBe(flipped)
      await page.reload()
      await expect(page.locator(coachSel), 'coach visibility persisted across reload').toHaveAttribute('data-on', flipped, { timeout: 15_000 })
      await page.locator(coachSel).click() // restore in the UI
      await expect(page.locator(coachSel)).toHaveAttribute('data-on', coachBefore || 'false', { timeout: 15_000 })

      // (b) Status reflects live state (class published again → visible count > 0).
      await expect(page.getByTestId('publish-status')).toBeVisible()
    } finally {
      await setClassPublished(classId, true).catch(() => {}) // restore the seed baseline
      if (coachId) {
        // Restore the coach's visibility to its captured baseline (svc — independent
        // of where the UI restore landed).
        await svc(`coaches?id=eq.${coachId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ landing_visible: coachBefore === 'true' }),
        }).catch(() => {})
      }
      await ctx.close()
    }
  })

  test('forgot-password link on /auth/login → generic success (no enumeration)', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en' })
    const page = await ctx.newPage()
    try {
      await page.goto('/en/auth/login')
      const link = page.getByTestId('forgot-password-link')
      await expect(link).toBeVisible({ timeout: 15_000 })
      await link.click()
      await expect(page).toHaveURL(/\/auth\/forgot$/, { timeout: 15_000 })

      // A non-existent address must still land on the SAME generic success (no oracle).
      await page.getByTestId('forgot-email').fill(`nobody+${Date.now()}@example.com`)
      await page.getByTestId('forgot-submit').click()
      await expect(page.getByTestId('forgot-success')).toBeVisible({ timeout: 20_000 })
    } finally {
      await ctx.close()
    }
  })
})
