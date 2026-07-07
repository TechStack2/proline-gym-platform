import { test, expect } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'

/**
 * ONBOARDING-CHECKLIST — the /today setup card. Since J1 SETUP-HUB it is a COMPACT,
 * DERIVED progress summary (six milestones) that LINKS to the full guided hub at
 * /setup — no longer the inline 8-item list. It is still derived (no stored state):
 * the milestone dots auto-tick from light gym-scoped queries, and the whole card
 * hides once every milestone is done.
 *
 * The per-worker seed gym (seed_e2e_gym) ships fully configured EXCEPT branding —
 * so the "Your gym" milestone (name + contact + a brand signal) is incomplete and
 * the summary SHOWS. We set brand_color via service role → that milestone flips →
 * the "N of 6" progress increments, proving the derivation, then restore null so the
 * shared per-worker gym is untouched.
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

  test('is a compact summary that links to /setup and derives its milestone progress', async ({ page }) => {
    test.setTimeout(60_000)
    if (!URL || !KEY) throw new Error('ONBOARDING-CHECKLIST needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')

    // Force the known-incomplete start (the seed ships branding null, but a prior
    // run of this spec — or a branding spec — could have left it set).
    await setBrandColor(null)

    // ── INCOMPLETE: the summary shows, is a link to the six-milestone hub ──
    await page.goto('/en/today', { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-testid="setup-checklist"]:visible').first()
    await expect(card, 'summary shows while setup is incomplete').toBeVisible({ timeout: 15_000 })
    await expect(card, 'it links to the guided hub').toHaveAttribute('href', '/en/setup')
    await expect(card, 'six milestones, not eight items').toHaveAttribute('data-total', '6')
    // the gym milestone dot is not done (branding is the missing signal)
    await expect(page.locator('[data-testid="setup-dot-gym"]:visible').first()).toHaveAttribute('data-done', 'false')
    const before = Number(await card.getAttribute('data-done'))
    expect(before, 'starts incomplete (< 6 of 6)').toBeLessThan(6)

    // ── COMPLETE the last blocker via service role. Branding completes BOTH the
    //    gym AND go-live milestones, so the seed gym (coach + classes + offers +
    //    members already done) reaches 6/6 → the summary HIDES, proving derivation. ──
    await setBrandColor('#cd1419')
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('horizon-switcher'), 'Today still renders').toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-testid="setup-checklist"]'), 'the summary hides once every milestone is done')
        .toHaveCount(0)
    } finally {
      await setBrandColor(null) // restore the seed default for the shared per-worker gym
    }
  })
})
