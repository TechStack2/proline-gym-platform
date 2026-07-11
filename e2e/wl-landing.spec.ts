import { test, expect, type Browser } from '@playwright/test'

/**
 * WL-LANDING — the public landing renders the RESOLVED gym's branding, not the
 * hardcoded Proline demo. One template, each gym's own name + brand color +
 * (logo/hero/tagline). A gym with brand_color/name SET renders it; UNSET → the
 * built-in Proline default (no regression).
 *
 * Two isolated gyms (service-role seed seed_e2e_wl_gym): one with a set brand
 * color + name, one left unset. Loaded anon via ?gym=<slug>.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.E2E_GYM_SLUG_BASE || 'local'
const SLUG_SET = `wl-set-${BASE}`
const SLUG_DEF = `wl-def-${BASE}`
const BRAND = '#0055ff'
const NAME_SET = 'Blue Belt Academy'
const NAME_DEF = 'Plain Combat Gym'
const DEFAULT_BRAND = '#cd1419'

async function seedWl(slug: string, brand: string | null, name: string) {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_e2e_wl_gym`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_brand_color: brand, p_name: name }),
  })
  if (!res.ok) throw new Error(`seed_e2e_wl_gym(${slug}) failed: ${res.status} ${await res.text()}`)
}

// PROLINE-LANDING-DATA (000078): the SET gym also gets its own public contact/
// social identity — the guard proves nav/footer/facility/hero render THESE, and
// the UNSET gym still renders today's built-in Proline defaults byte-identically.
const CONTACT_SET = {
  contact_whatsapp: '96171111222',
  contact_phone: '+961 3 111 222',
  contact_email: 'front@bluebelt.lb',
  instagram_handle: 'bluebelt.academy',
  instagram_followers: 512,
  facebook_handle: 'bluebelt.club',
  map_lat: 34.1,
  map_lng: 35.65,
  address_en: 'Blue Tower, Jbeil',
}

// SEO-PER-GYM: a per-gym share/OG image. A COMMITTED local asset (distinct from
// the default /landing/og.jpg) so next/image is happy and the head's og:image can
// prove it resolved the gym's hero, not the default card.
const SET_OG_IMAGE = '/landing/gym-1.jpg'

async function setContact(slug: string) {
  const res = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...CONTACT_SET, hero_image_url: SET_OG_IMAGE }),
  })
  if (!res.ok) throw new Error(`contact patch(${slug}) failed: ${res.status} ${await res.text()}`)
}

// LANDING-CONTENT (000079): the SET gym gets its OWN champion / gallery /
// affiliation images; the guard proves those three sections render THESE rows
// (not Proline's built-in /landing/* set), while the UNSET gym — with zero rows —
// keeps today's built-in sections byte-identically. Fixed row UUIDs + upsert
// (Prefer: ignore-duplicates on the PK) make the seed idempotent AND race-safe:
// wl-landing.spec runs under BOTH the `landing` (unanchored testMatch) and
// `wl-landing` projects, whose beforeAll's can hit this SHARED gym concurrently.
const LANDING_ROWS = [
  { id: 'a0000000-0000-4000-8000-000000000001', section: 'champions',    image_url: '/landing/champions-1.jpg',      caption_en: 'WL Champ Alpha',     sort_order: 0 },
  { id: 'a0000000-0000-4000-8000-000000000002', section: 'champions',    image_url: '/landing/champions-2.jpg',      caption_en: 'WL Champ Beta',      sort_order: 1 },
  { id: 'b0000000-0000-4000-8000-000000000001', section: 'gallery',      image_url: '/landing/gym-1.jpg',            caption_en: 'WL Mat One',         sort_order: 0 },
  { id: 'b0000000-0000-4000-8000-000000000002', section: 'gallery',      image_url: '/landing/gym-2.jpg',            caption_en: null,                 sort_order: 1 },
  { id: 'b0000000-0000-4000-8000-000000000003', section: 'gallery',      image_url: '/landing/gym-3.jpg',            caption_en: null,                 sort_order: 2 },
  { id: 'c0000000-0000-4000-8000-000000000001', section: 'affiliations', image_url: '/landing/affiliations/lmf.jpg', caption_en: 'WL Federation One',  sort_order: 0 },
  { id: 'c0000000-0000-4000-8000-000000000002', section: 'affiliations', image_url: '/landing/affiliations/ifma.png', caption_en: 'WL Federation Two', sort_order: 1 },
]

async function seedLandingImages(slug: string) {
  const gymRes = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(slug)}&select=id`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
  })
  const gymId = ((await gymRes.json()) as Array<{ id: string }>)[0]?.id
  if (!gymId) throw new Error(`seedLandingImages: gym ${slug} not found`)
  const res = await fetch(`${URL}/rest/v1/gym_landing_images`, {
    method: 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(LANDING_ROWS.map((r) => ({ ...r, gym_id: gymId, is_active: true }))),
  })
  if (!res.ok) throw new Error(`seedLandingImages(${slug}) failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-LANDING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  await seedWl(SLUG_SET, BRAND, NAME_SET)
  await seedWl(SLUG_DEF, null, NAME_DEF)
  await setContact(SLUG_SET)
  await seedLandingImages(SLUG_SET) // SLUG_DEF is left with ZERO rows (the built-in fallback)
})

test('WL-LANDING · a gym with brand_color + name set renders ITS branding on the landing', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }) // anon — the landing is public
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_SET)}`)
    // The resolved gym's NAME renders (not "PRO LINE Gym").
    await expect(page.getByTestId('hero-gym-name'), 'the gym name renders in the hero').toHaveText(NAME_SET, { timeout: 15_000 })
    // The hero brand glow uses the gym's brand color (SVG stop-color — CSP-safe).
    const glow = page.locator('[data-testid="hero-brand-glow"]')
    await expect(glow).toHaveAttribute('data-brand-color', BRAND)
    const stopColor = await page.locator('#wl-hero-glow stop').first().getAttribute('stop-color')
    expect(stopColor, 'the SVG glow renders in the gym brand color').toBe(BRAND)
  } finally {
    await ctx.close()
  }
})

test('WL-LANDING · a gym with brand_color UNSET falls back to the default look (no regression)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_DEF)}`)
    await expect(page.getByTestId('hero-gym-name')).toHaveText(NAME_DEF, { timeout: 15_000 })
    // Unset brand_color → the template default crimson.
    await expect(page.locator('[data-testid="hero-brand-glow"]')).toHaveAttribute('data-brand-color', DEFAULT_BRAND)
    const stopColor = await page.locator('#wl-hero-glow stop').first().getAttribute('stop-color')
    expect(stopColor, 'unset brand_color renders the default crimson').toBe(DEFAULT_BRAND)

    // TENANT-CONTENT (was PROLINE-LANDING-DATA): a NON-default gym that left its contact
    // NULL must NOT inherit the Proline founder identity. Every contact affordance HIDES
    // (honest empty), and no Proline email / phone / social / address / founder credit
    // appears anywhere on the page. Only the gym's OWN name renders.
    await expect(page.getByTestId('hero-wa-cta'), 'no Proline WhatsApp CTA').toHaveCount(0)
    await expect(page.getByTestId('hero-ig'), 'no Proline hero IG').toHaveCount(0)
    await expect(page.getByTestId('hero-ig-followers'), 'no follower count when unset').toHaveCount(0)
    await expect(page.getByTestId('facility-phone'), 'no Proline facility phone').toHaveCount(0)
    await expect(page.getByTestId('facility-email'), 'no Proline facility email').toHaveCount(0)
    await expect(page.getByTestId('facility-map'), 'no map without coordinates').toHaveCount(0)
    await expect(page.getByTestId('footer-wa'), 'no Proline footer WhatsApp').toHaveCount(0)
    await expect(page.getByTestId('footer-ig'), 'no Proline footer IG').toHaveCount(0)
    await expect(page.getByTestId('footer-fb'), 'no Proline footer FB').toHaveCount(0)
    await expect(page.getByTestId('footer-phone'), 'no Proline footer phone').toHaveCount(0)
    await expect(page.getByTestId('footer-email'), 'no Proline footer email').toHaveCount(0)
    await expect(page.getByTestId('footer-address'), 'no Proline footer address').toHaveCount(0)
    await expect(page.getByTestId('footer-brand-name'), 'footer shows the gym name').toHaveText(NAME_DEF)
    const body = page.locator('body')
    await expect(body, 'no founder email leaks').not.toContainText('alifakih998@gmail.com')
    await expect(body, 'no Proline address leaks').not.toContainText('Sky Business Center')
    await expect(body, 'no Proline founder credit leaks').not.toContainText('Fakih Brothers')
    await expect(body, 'no Proline phone leaks').not.toContainText('70 628 601')

    // M2-C GALLERY: SLUG_DEF is a NON-DEFAULT gym with ZERO landing images → the three
    // image sections show a tasteful EMPTY STATE, NEVER Proline's built-in champions /
    // gallery / affiliations (the demo set is now gated to slug === DEFAULT_GYM_SLUG).
    await expect(page.locator('#champions'), 'the champions section still renders (empty state)').toBeVisible()
    await expect(page.getByTestId('landing-champions-empty'), 'champions empty state — no Proline athletes').toBeVisible()
    await expect(page.locator('#champions figure'), 'no built-in Proline champion figures').toHaveCount(0)
    await expect(page.locator('#champions [data-testid="landing-champion"]'), 'no per-gym champion rows').toHaveCount(0)
    await expect(page.getByTestId('landing-gallery-empty'), 'gallery empty state').toBeVisible()
    await expect(page.locator('#gallery [data-testid="landing-gallery-tile"]'), 'no per-gym gallery rows').toHaveCount(0)
    await expect(page.getByTestId('landing-affiliations-empty'), 'affiliations empty state — no Proline logos').toBeVisible()
    await expect(page.locator('#affiliations [data-testid="affiliation-slot"]'), 'no built-in Proline affiliation slots').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})

test('LANDING-CONTENT · a gym with seeded champion/gallery/affiliation rows renders ITS images (not Proline\'s built-in set)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_SET)}`)
    // Champions: exactly the 2 seeded rows (not the built-in 4), with the gym's captions.
    await expect(page.locator('#champions [data-testid="landing-champion"]'), 'the gym champion rows render')
      .toHaveCount(2, { timeout: 15_000 })
    await expect(page.getByText('WL Champ Alpha'), 'a seeded champion caption renders').toBeVisible()
    await expect(page.getByText('WL Champ Beta')).toBeVisible()
    // Gallery: exactly the 3 seeded tiles (the rows branch), not the built-in 6.
    // The gallery is a pure photo mosaic (no visible captions, byte-identical to
    // the built-in) → the seeded caption flows to the tile image's alt; assert it
    // there (proves the gym's ROW data reached the tile, not just any 3 photos).
    await expect(page.locator('#gallery [data-testid="landing-gallery-tile"]'), 'the gym gallery rows render').toHaveCount(3)
    await expect(page.locator('#gallery [data-testid="landing-gallery-tile"]').first().locator('img'),
      'the first gallery tile carries the seeded caption as its alt').toHaveAttribute('alt', 'WL Mat One')
    // Affiliations: exactly the 2 seeded slots (the rows branch), not the built-in 4.
    await expect(page.locator('#affiliations [data-testid="affiliation-slot"]'), 'the gym affiliation rows render').toHaveCount(2)
    await expect(page.getByText('WL Federation One'), 'a seeded affiliation caption renders').toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('WL-LANDING · a gym with contact columns SET renders ITS identity in nav/hero/facility/footer', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_SET)}`)
    // Nav + footer brand = the gym's own name (the chrome renders from the page
    // now, following the ?gym/domain resolution — not the layout's default gym).
    await expect(page.getByTestId('landing-nav-name'), 'nav shows the gym name').toHaveText(NAME_SET, { timeout: 15_000 })
    await expect(page.getByTestId('footer-brand-name'), 'footer shows the gym name').toHaveText(NAME_SET)
    // Hero CTAs from data.
    await expect(page.getByTestId('hero-wa-cta'), 'hero wa.me is the gym one').toHaveAttribute('href', 'https://wa.me/96171111222')
    await expect(page.getByTestId('hero-ig'), 'hero IG is the gym one').toHaveAttribute('href', 'https://instagram.com/bluebelt.academy')
    await expect(page.getByTestId('hero-ig-followers'), 'the follower count renders when set').toHaveText(/512/)
    // Facility contact block + map from data.
    await expect(page.getByTestId('facility-phone')).toHaveAttribute('href', 'tel:+9613111222')
    await expect(page.getByTestId('facility-phone')).toContainText('+961 3 111 222')
    await expect(page.getByTestId('facility-email')).toHaveAttribute('href', 'mailto:front@bluebelt.lb')
    await expect(page.getByTestId('facility-ig')).toHaveAttribute('href', 'https://instagram.com/bluebelt.academy')
    const mapSrc = await page.getByTestId('facility-map').getAttribute('src')
    expect(mapSrc, 'map marker at the gym coordinates').toContain('marker=34.1000%2C35.6500')
    // Footer socials + contact + address from data.
    await expect(page.getByTestId('footer-wa')).toHaveAttribute('href', 'https://wa.me/96171111222')
    await expect(page.getByTestId('footer-ig')).toHaveAttribute('href', 'https://instagram.com/bluebelt.academy')
    await expect(page.getByTestId('footer-fb')).toHaveAttribute('href', 'https://facebook.com/bluebelt.club')
    await expect(page.getByTestId('footer-phone')).toHaveText('+961 3 111 222')
    await expect(page.getByTestId('footer-email')).toHaveText('front@bluebelt.lb')
    await expect(page.getByTestId('footer-address')).toHaveText('Blue Tower, Jbeil')
  } finally {
    await ctx.close()
  }
})

test('SEO-PER-GYM · a gym with name+contact set gets ITS <head> title/OG/JSON-LD', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' })
  const page = await ctx.newPage()
  try {
    await page.goto(`/en?gym=${encodeURIComponent(SLUG_SET)}`)
    // The <title> is the gym's OWN identity, and it's absolute → the app-wide
    // "%s | PRO LINE Gym" template must NOT leak the vendor brand into a tenant.
    await expect(page).toHaveTitle(/Blue Belt Academy/)
    await expect(page, 'the Proline brand template must not leak into a tenant title').not.toHaveTitle(/PRO LINE/i)

    // OpenGraph (the WhatsApp/Instagram share preview) follows the gym.
    const ogTitle = await page.locator('head meta[property="og:title"]').getAttribute('content')
    expect(ogTitle, 'og:title is the gym').toContain(NAME_SET)
    const ogSite = await page.locator('head meta[property="og:site_name"]').getAttribute('content')
    expect(ogSite, 'og:site_name is the gym').toBe(NAME_SET)
    const ogImage = await page.locator('head meta[property="og:image"]').first().getAttribute('content')
    expect(ogImage, 'per-gym OG image is the gym hero, not the default card').toContain(SET_OG_IMAGE)

    // JSON-LD resolves the gym's name + phone (contact_phone) + IG (instagram_handle)
    // + address (address_*) — no longer the hardcoded Proline block.
    const jsonld = JSON.parse((await page.locator('[data-testid="landing-jsonld"]').textContent()) as string)
    expect(jsonld['@type']).toBe('SportsActivityLocation')
    expect(jsonld.name, 'JSON-LD name is the gym').toBe(NAME_SET)
    expect(jsonld.telephone, 'JSON-LD telephone is the gym contact_phone').toBe(CONTACT_SET.contact_phone)
    expect(jsonld.sameAs, 'JSON-LD sameAs is the gym Instagram').toContain('https://instagram.com/bluebelt.academy')
    expect(jsonld.address?.addressLocality, 'JSON-LD locality derived from address_*').toBe('Jbeil')
    expect(jsonld.address?.streetAddress, 'JSON-LD street from address_*').toContain('Blue Tower')
  } finally {
    await ctx.close()
  }
})
