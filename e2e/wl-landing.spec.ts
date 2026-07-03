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

async function setContact(slug: string) {
  const res = await fetch(`${URL}/rest/v1/gyms?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(CONTACT_SET),
  })
  if (!res.ok) throw new Error(`contact patch(${slug}) failed: ${res.status} ${await res.text()}`)
}

test.beforeAll(async () => {
  if (!URL || !KEY) throw new Error('WL-LANDING needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL')
  await seedWl(SLUG_SET, BRAND, NAME_SET)
  await seedWl(SLUG_DEF, null, NAME_DEF)
  await setContact(SLUG_SET)
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

    // PROLINE-LANDING-DATA: NULL contact columns → today's built-in defaults,
    // byte-identical (the demo regression check).
    await expect(page.getByTestId('hero-wa-cta'), 'default hero wa.me').toHaveAttribute('href', 'https://wa.me/96170628601')
    await expect(page.getByTestId('hero-ig'), 'default hero IG').toHaveAttribute('href', 'https://instagram.com/prolinegym.lb')
    await expect(page.getByTestId('hero-ig-followers'), 'no follower count when unset').toHaveCount(0)
    await expect(page.getByTestId('facility-phone'), 'default facility tel:').toHaveAttribute('href', 'tel:+96170628601')
    await expect(page.getByTestId('facility-email'), 'default facility mailto').toHaveAttribute('href', 'mailto:alifakih998@gmail.com')
    await expect(page.getByTestId('facility-map'), 'default map coordinates (byte-identical URL)')
      .toHaveAttribute('src', 'https://www.openstreetmap.org/export/embed.html?bbox=35.5390%2C33.8290%2C35.5490%2C33.8390&layer=mapnik&marker=33.8340%2C35.5440')
    await expect(page.getByTestId('footer-wa'), 'default footer wa.me').toHaveAttribute('href', 'https://wa.me/96170628601')
    await expect(page.getByTestId('footer-ig'), 'default footer IG').toHaveAttribute('href', 'https://instagram.com/prolinegym.lb')
    await expect(page.getByTestId('footer-fb'), 'default footer FB').toHaveAttribute('href', 'https://facebook.com/prolinegym.lb')
    await expect(page.getByTestId('footer-phone'), 'default footer phone').toHaveText('+961 70 628 601')
    await expect(page.getByTestId('footer-email'), 'default footer email').toHaveText('alifakih998@gmail.com')
    await expect(page.getByTestId('footer-address'), 'default footer address').toHaveText('Sky Business Center, Baabda')
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
