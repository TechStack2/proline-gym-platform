import { test, expect } from '@playwright/test'
import { ROLES, E2E_GYM_SLUG } from './roles'

/**
 * M2-C GALLERY — the "Public page photos" manager (Settings › Your gym & public
 * page) + the anon-landing render.
 *   1. A seeded champion row renders on the anon ?gym= landing; the manager LISTS
 *      it; deleting it via the manager returns the landing to the empty state (never
 *      Proline's built-in athletes — the run gym is a NON-DEFAULT gym).
 *   2. The manager UPLOADS a real image → a new row appears (gym-landing bucket +
 *      gym_landing_images insert, admin-write RLS).
 * Anchored testMatch. Cleans up the run gym's champion rows in a finally so the
 * shared per-worker gym stays at its zero-images baseline for landing/adm1/wl-landing.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FIXTURE = 'e2e/fixtures/avatar.png'
const PROBE = 'M2C Probe Champ'

const svcHeaders = { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function svc(path: string, init?: RequestInit) {
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init?.headers || {}) } })
}
async function resolveGymId(slug: string): Promise<string> {
  const rows = (await (await svc(`gyms?slug=eq.${encodeURIComponent(slug)}&select=id`)).json()) as { id: string }[]
  return rows[0]?.id
}
async function clearChampions(gymId: string) {
  await svc(`gym_landing_images?gym_id=eq.${gymId}&section=eq.champions`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  }).catch(() => {})
}

test.describe('M2C-GALLERY · public page photos manager', () => {
  test('seeded champion renders on the anon landing; manager lists + deletes it → empty state', async ({ browser }) => {
    test.setTimeout(120_000)
    if (!URL || !KEY) throw new Error('M2C-GALLERY needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
    const slug = E2E_GYM_SLUG
    const gymId = await resolveGymId(slug)
    expect(gymId, 'run gym resolved').toBeTruthy()
    await clearChampions(gymId) // known zero-images baseline
    try {
      // ── seed one champion row (service-role; a committed asset path renders as-is) ──
      await svc('gym_landing_images', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ gym_id: gymId, section: 'champions', image_url: '/landing/champions-1.jpg', caption_en: PROBE, sort_order: 0, is_active: true }),
      })

      // ── (a) the anon ?gym= landing shows the gym's OWN champion (not the built-in set) ──
      {
        const ctx = await browser.newContext({ locale: 'en' })
        const page = await ctx.newPage()
        try {
          await page.goto(`/en?gym=${encodeURIComponent(slug)}`)
          await page.waitForLoadState('networkidle').catch(() => {})
          await expect(page.locator('#champions [data-testid="landing-champion"]'), 'the seeded champion row renders').toHaveCount(1, { timeout: 15_000 })
          await expect(page.getByText(PROBE), 'the seeded caption renders').toBeVisible()
        } finally {
          await ctx.close()
        }
      }

      // ── (b) the manager lists the row, then DELETES it ──
      {
        const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
        const page = await ctx.newPage()
        try {
          await page.goto('/en/settings?tab=gym')
          await expect(page.getByTestId('landing-photos-manager'), 'the manager renders in the gym section').toBeVisible({ timeout: 15_000 })
          const row = page.locator('[data-testid="lp-section-champions"] [data-testid="lp-row"]')
          await expect(row, 'the seeded row is listed').toHaveCount(1, { timeout: 15_000 })
          await expect(row.first().getByTestId('lp-caption-en'), 'the caption is editable in the manager').toHaveValue(PROBE)
          await row.first().getByTestId('lp-delete').click()
          await expect(page.getByTestId('lp-empty-champions'), 'the section is empty after delete').toBeVisible({ timeout: 15_000 })
        } finally {
          await ctx.close()
        }
      }

      // ── (c) after delete, the anon landing shows the empty state (NO Proline athletes) ──
      {
        const ctx = await browser.newContext({ locale: 'en' })
        const page = await ctx.newPage()
        try {
          await page.goto(`/en?gym=${encodeURIComponent(slug)}`)
          await page.waitForLoadState('networkidle').catch(() => {})
          await expect(page.getByTestId('landing-champions-empty'), 'champions empty state').toBeVisible({ timeout: 15_000 })
          await expect(page.locator('#champions [data-testid="landing-champion"]'), 'no champion rows').toHaveCount(0)
          await expect(page.locator('#champions figure'), 'no built-in Proline champions').toHaveCount(0)
        } finally {
          await ctx.close()
        }
      }
    } finally {
      await clearChampions(gymId)
    }
  })

  test('the manager uploads a real image → a new row appears', async ({ browser }) => {
    test.setTimeout(120_000)
    if (!URL || !KEY) throw new Error('M2C-GALLERY needs SUPABASE env')
    const slug = E2E_GYM_SLUG
    const gymId = await resolveGymId(slug)
    await clearChampions(gymId)
    const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' })
    const page = await ctx.newPage()
    try {
      await page.goto('/en/settings?tab=gym')
      await expect(page.getByTestId('landing-photos-manager')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('lp-empty-champions'), 'starts empty').toBeVisible()
      // Real upload: downscale (browser canvas) → gym-landing bucket → gym_landing_images insert.
      await page.getByTestId('lp-upload-champions').setInputFiles(FIXTURE)
      await expect(
        page.locator('[data-testid="lp-section-champions"] [data-testid="lp-row"]'),
        'the uploaded photo appears as a manager row',
      ).toHaveCount(1, { timeout: 25_000 })
    } finally {
      await clearChampions(gymId)
      await ctx.close()
    }
  })
})
