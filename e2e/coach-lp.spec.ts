import { test, expect, type Browser } from '@playwright/test'
import { ROLES } from './roles'
import { vis, gymSlug, untilConsistent } from './helpers'

/**
 * COACH-LP — grandiose coach showcase on the landing + the coach-edit → admin-
 * publish workflow. Proves:
 *  1. Workflow E2E: coach (coach@ = Sami) edits their profile in the portal → it's
 *     PENDING (not on the anon landing); owner opens Coach-360 → sees the pending
 *     diff → Publish → the coach appears on the anon landing with the new bio.
 *  2. RLS leak guard: an active-but-not-landing_visible coach + a pending edit do
 *     NOT appear on the anon landing (anon reads ONLY published via the RPC).
 *  3. Coming soon: the seeded coming_soon coach (Nadia) renders in the future
 *     treatment.
 *  4. Permissions: reception can edit a draft but CANNOT publish; owner can.
 *  5. /ar landing showcase RTL-clean.
 *
 * NB Sami is deactivated by TEAM-1 (runs earlier, shared gym) — the workflow
 * reactivates him by id first (he's absent from the list while deleted_at is set,
 * so we navigate to his Coach-360 directly via the id the editor exposes).
 * Desktop Chrome; appended at the END.
 */
const RUN = Date.now().toString().slice(-6)
const NEW_BIO = `Championship striker COACHLP ${RUN}`
const FIXTURE = 'e2e/fixtures/avatar.png'

async function ctxFor(browser: Browser, role: keyof typeof ROLES, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale })
  return { ctx, page: await ctx.newPage() }
}
async function anonCtx(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ locale })
  return { ctx, page: await ctx.newPage() }
}
async function openLanding(page: any, locale = 'en') {
  await page.goto(`/${locale}?gym=${encodeURIComponent(gymSlug())}`)
  await page.waitForLoadState('networkidle').catch(() => {})
}

test.describe.serial('COACH-LP · landing showcase + coach-edit→admin-publish', () => {
  test('coach edits → PENDING (not leaked) → owner publishes → coach on anon landing', async ({ browser }) => {
    test.setTimeout(150_000)
    const coach = await ctxFor(browser, 'coach') // Sami
    const owner = await ctxFor(browser, 'owner')
    const anon = await anonCtx(browser)
    try {
      // ── Coach self-edit in the portal → saved as a PENDING draft ──
      await coach.page.goto('/en/coach/profile')
      const editor = vis(coach.page, '[data-testid="coach-profile-editor"]').first()
      await expect(editor).toBeVisible({ timeout: 15_000 })
      const coachId = (await editor.getAttribute('data-coach-id')) || ''
      expect(coachId, 'the editor exposes the coach id').toBeTruthy()
      await editor.getByTestId('coach-edit-bio-en').fill(NEW_BIO)
      await editor.getByTestId('coach-save-draft').click()
      await expect(editor.getByTestId('coach-saved'), 'draft saved').toBeVisible({ timeout: 15_000 })
      await coach.page.reload()
      await expect(vis(coach.page, '[data-testid="coach-pending-badge"]').first(), 'pending badge after save').toBeVisible({ timeout: 15_000 })

      // ── Owner opens Coach-360 by id (Sami is deactivated → not in the list) → reactivate ──
      await owner.page.goto(`/en/coaches/${coachId}`)
      await expect(vis(owner.page, '[data-testid="coach-publish-panel"]').first()).toBeVisible({ timeout: 15_000 })
      const reactivate = vis(owner.page, '[data-testid="coach-reactivate-btn"]')
      if (await reactivate.count()) {
        await reactivate.first().click()
        await expect(vis(owner.page, '[data-testid="coach-active-badge"]').first()).toContainText(/active/i, { timeout: 15_000 })
      }

      // ── LEAK GUARD: active-but-hidden coach + the pending edit are NOT on the anon landing ──
      await openLanding(anon.page)
      await expect(anon.page.getByText(NEW_BIO), 'pending edit must not leak to anon').toHaveCount(0)
      await expect(vis(anon.page, '[data-testid="landing-coach-card"]').filter({ hasText: 'Sami' }),
        'a not-landing_visible coach is absent from the anon showcase').toHaveCount(0)

      // ── Owner sees the pending diff → Publish ──
      await expect(vis(owner.page, '[data-testid="coach360-pending-diff"]').first(), 'pending diff in Coach-360').toBeVisible({ timeout: 15_000 })
      await expect(vis(owner.page, '[data-testid="coach360-draft-bio"]').first()).toContainText(NEW_BIO)
      await vis(owner.page, '[data-testid="coach360-publish"]').first().click()
      await expect(vis(owner.page, '[data-testid="coach360-landing-status"]').first(),
        'publish makes the coach landing-visible').toHaveAttribute('data-visible', 'true', { timeout: 15_000 })

      // ── The coach now appears on the anon landing with the published bio ──
      await untilConsistent(async () => {
        await openLanding(anon.page)
        const sami = vis(anon.page, '[data-testid="landing-coach-card"]').filter({ hasText: 'Sami' }).first()
        await expect(sami, 'published coach on the anon showcase').toBeVisible({ timeout: 6_000 })
        await expect(sami, 'with the published bio').toContainText(NEW_BIO)
        await expect(sami).toHaveAttribute('data-status', 'active')
      }, { timeout: 45_000 })
    } finally {
      await coach.ctx.close(); await owner.ctx.close(); await anon.ctx.close()
    }
  })

  // COACH-PHOTO-GATE — the headshot flows through the SAME admin gate as the text.
  test('coach uploads photo → PENDING (live avatar unchanged + draft not anon-readable) → reception can\'t publish → owner publishes → new photo live', async ({ browser }) => {
    test.setTimeout(180_000)
    const coach = await ctxFor(browser, 'coach') // Sami
    const reception = await ctxFor(browser, 'reception')
    const owner = await ctxFor(browser, 'owner')
    const anon = await anonCtx(browser)
    // the published Sami card on the anon showcase
    const samiCard = (p: any) => vis(p, '[data-testid="landing-coach-card"]').filter({ hasText: 'Sami' }).first()
    const avatarSrc = async (p: any): Promise<string | null> => {
      const img = samiCard(p).locator('img')
      return (await img.count()) ? await img.first().getAttribute('src') : null
    }
    try {
      // Sami is landing-visible from the previous test. Record his current avatar.
      await openLanding(anon.page)
      await expect(samiCard(anon.page), 'Sami is on the showcase').toBeVisible({ timeout: 15_000 })
      const beforeSrc = await avatarSrc(anon.page)

      // ── Coach stages a NEW photo (portal self-editor) → recorded as a DRAFT ──
      await coach.page.goto('/en/coach/profile')
      const editor = vis(coach.page, '[data-testid="coach-profile-editor"]').first()
      await expect(editor).toBeVisible({ timeout: 15_000 })
      const coachId = (await editor.getAttribute('data-coach-id')) || ''
      // the file input is CSS-hidden (single-shell coach app) — set files directly
      await coach.page.locator('[data-testid="coach-photo-draft-input"]').first().setInputFiles(FIXTURE)
      await expect(vis(coach.page, '[data-testid="coach-photo-pending"]').first(), 'photo marked pending approval').toBeVisible({ timeout: 20_000 })
      const draftPath = (await coach.page.locator('[data-testid="coach-photo-draft"]').first().getAttribute('data-path')) || ''
      expect(draftPath, 'draft object path exposed').toBeTruthy()

      // ── GATE: the live landing avatar is UNCHANGED (the draft is not live) ──
      await openLanding(anon.page)
      expect(await avatarSrc(anon.page), 'live landing avatar unchanged before publish').toBe(beforeSrc)

      // ── LEAK GUARD: the draft object is NOT anon-readable (private bucket) ──
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      expect(base, 'supabase url available to the test').toBeTruthy()
      const draftPublicUrl = `${base}/storage/v1/object/public/coach-avatar-drafts/${draftPath}`
      const leak = await anon.page.request.get(draftPublicUrl)
      expect(leak.status(), `draft photo not anon-readable (${draftPublicUrl})`).not.toBe(200)

      // ── Reception can REVIEW the photo diff but CANNOT publish it ──
      await reception.page.goto(`/en/coaches/${coachId}`)
      await expect(vis(reception.page, '[data-testid="coach360-photo-diff"]').first(), 'reception sees the photo diff').toBeVisible({ timeout: 15_000 })
      await expect(reception.page.locator('[data-testid="coach360-publish"]'), 'reception cannot publish the photo').toHaveCount(0)

      // ── Owner reviews the photo diff in Coach-360 → Publish ──
      await owner.page.goto(`/en/coaches/${coachId}`)
      await expect(vis(owner.page, '[data-testid="coach360-photo-diff"]').first(), 'owner sees the photo before/after').toBeVisible({ timeout: 15_000 })
      await expect(vis(owner.page, '[data-testid="coach360-photo-draft"]').first(), 'the staged photo renders in the diff').toBeVisible()
      await vis(owner.page, '[data-testid="coach360-publish"]').first().click()
      await expect(vis(owner.page, '[data-testid="coach360-landing-status"]').first()).toHaveAttribute('data-visible', 'true', { timeout: 15_000 })

      // ── The NEW photo is now LIVE on the anon landing ──
      await untilConsistent(async () => {
        await openLanding(anon.page)
        const img = samiCard(anon.page).locator('img').first()
        await expect(img, 'Sami now has a live photo').toBeVisible({ timeout: 6_000 })
        const src = await img.getAttribute('src')
        expect(src && src !== beforeSrc, 'landing avatar updated to the published photo').toBeTruthy()
        expect(src, 'published from the public avatars bucket').toContain('/avatars/')
        expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth), 'published photo loads (no 404)').toBeGreaterThan(0)
      }, { timeout: 45_000 })
    } finally {
      await coach.ctx.close(); await reception.ctx.close(); await owner.ctx.close(); await anon.ctx.close()
    }
  })

  test('coming-soon coach renders in the future treatment on the anon landing', async ({ browser }) => {
    const anon = await anonCtx(browser)
    try {
      await openLanding(anon.page)
      await expect(vis(anon.page, '#coaches').first(), 'the coach showcase renders').toBeVisible({ timeout: 15_000 })
      const nadia = vis(anon.page, '[data-testid="landing-coach-card"]').filter({ hasText: 'Nadia' }).first()
      await expect(nadia, 'the coming-soon coach is shown').toBeVisible()
      await expect(nadia).toHaveAttribute('data-status', 'coming_soon')
      await expect(nadia.getByTestId('coach-coming-soon-badge'), 'coming-soon treatment').toBeVisible()
    } finally {
      await anon.ctx.close()
    }
  })

  test('reception can edit a draft but CANNOT publish; owner-only gate', async ({ browser }) => {
    const reception = await ctxFor(browser, 'reception')
    try {
      // Sami is active + landing-visible now → reachable from the team list.
      await reception.page.goto('/en/coaches')
      await vis(reception.page, '[data-testid="coach-card"]').filter({ hasText: 'Sami' }).first().click()
      await expect(reception.page).toHaveURL(/\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 })
      await expect(vis(reception.page, '[data-testid="coach-publish-panel"]').first()).toBeVisible({ timeout: 15_000 })
      // publish + admin controls are owner/head_coach-only → hidden for reception
      await expect(reception.page.locator('[data-testid="coach360-publish"]'), 'reception sees no publish').toHaveCount(0)
      await expect(reception.page.locator('[data-testid="coach360-admin-controls"]'), 'reception sees no admin controls').toHaveCount(0)
      // …but reception CAN write a draft
      await vis(reception.page, '[data-testid="coach360-edit-toggle"]').first().click()
      await vis(reception.page, '[data-testid="coach360-edit-bio-en"]').first().fill(`Reception draft ${RUN}`)
      await vis(reception.page, '[data-testid="coach360-save-draft"]').first().click()
      await expect(reception.page.locator('[data-testid="coach-publish-error"]'), 'reception draft writes cleanly').toHaveCount(0, { timeout: 10_000 })
    } finally {
      await reception.ctx.close()
    }
  })

  test('/ar landing coach showcase renders RTL-clean (no missing keys)', async ({ browser }) => {
    const anon = await anonCtx(browser, 'ar')
    try {
      await openLanding(anon.page, 'ar')
      await expect(vis(anon.page, '#coaches').first(), 'showcase renders on /ar').toBeVisible({ timeout: 15_000 })
      await expect(vis(anon.page, '[data-testid="landing-coach-card"]').first()).toBeVisible()
      expect(await anon.page.locator('text=MISSING_MESSAGE').count(), 'no MISSING_MESSAGE').toBe(0)
      expect(await anon.page.locator('text=landing.coachesSec').count(), 'no unresolved key').toBe(0)
    } finally {
      await anon.ctx.close()
    }
  })
})
