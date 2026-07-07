import { test, expect } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'

/**
 * ONBOARDING-CHECKLIST — the derived first-run setup card on /today. It is
 * DERIVED (no stored state): each item auto-ticks from a light gym-scoped
 * count/exists query, and the whole card hides once every applicable item is done.
 *
 * The per-worker seed gym (seed_e2e_gym) ships fully configured EXCEPT branding —
 * phone, 2 disciplines, a coach, plans, PT packages, an exchange rate and members
 * are all seeded, but brand_color/hero_image_url/tagline are null. So it is 7/8 and
 * the card SHOWS. We then set a brand field via service role → 8/8 → the card HIDES,
 * proving the derivation, and restore null so the shared per-worker gym is untouched.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** service_role PATCH of the run gym's brand_color (plain fetch — supabase-js's
 *  Realtime client throws on CI Node). null = restore the seed default. */
async function setBrandColor(color: string | null) {
  const res = await fetch(`${URL}/rest/v1/gyms?slug=eq.${E2E_GYM_SLUG}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY as string,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ brand_color: color }),
  })
  if (!res.ok) throw new Error(`brand_color update failed: ${res.status} ${await res.text()}`)
}

test.describe('ONBOARDING-CHECKLIST', () => {
  test.use({ storageState: ROLES.owner.storage })

  test('shows for an incomplete gym and hides once every item is done', async ({ page }) => {
    test.setTimeout(60_000)
    if (!URL || !KEY) throw new Error('ONBOARDING-CHECKLIST needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')

    // Force the known-incomplete start (the seed ships branding null, but a prior
    // run of this spec — or a branding spec — could have left it set).
    await setBrandColor(null)

    // ── INCOMPLETE: the seed gym is 7/8, branding is the only missing item ──
    await page.goto('/en/today', { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-testid="setup-checklist"]:visible').first()
    await expect(card, 'checklist shows while setup is incomplete').toBeVisible({ timeout: 15_000 })
    // J4 CLASS-SURFACE: the denominator gained a `class` item (9 total). The seed
    // ships an active class with weekday schedules (000029), so that item is DONE →
    // branding is still the only missing one → 8/9.
    await expect(card).toHaveAttribute('data-total', '9') // profile+branding+discipline+coach+class+plan+ptpackage+exchange+member
    await expect(card).toHaveAttribute('data-done', '8')
    // the one missing item is branding; it deep-links to the Settings Branding section
    const branding = page.locator('[data-testid="setup-item-branding"]:visible').first()
    await expect(branding).toHaveAttribute('data-done', 'false')
    await expect(branding).toHaveAttribute('href', '/en/settings?tab=gym#branding')
    // the new class item is ticked (the seed's class-with-schedule) and lands on /classes
    const klass = page.locator('[data-testid="setup-item-class"]:visible').first()
    await expect(klass).toHaveAttribute('data-done', 'true')
    await expect(klass).toHaveAttribute('href', '/en/classes')
    // the coach item now deep-links to the Add-Coach form (not the roster)
    await expect(page.locator('[data-testid="setup-item-coach"]:visible').first()).toHaveAttribute('href', '/en/coaches/add')
    // a seeded item is ticked (proves the derivation reads real data, not a stub)
    await expect(page.locator('[data-testid="setup-item-member"]:visible').first()).toHaveAttribute('data-done', 'true')

    // ── COMPLETE the last item via service role → all 8 done → the card hides ──
    await setBrandColor('#cd1419')
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('horizon-switcher'), 'Today still renders').toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-testid="setup-checklist"]'), 'checklist hides once setup is complete').toHaveCount(0)
    } finally {
      await setBrandColor(null) // restore the seed default for the shared per-worker gym
    }
  })
})
