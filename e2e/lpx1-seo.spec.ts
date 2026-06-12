import { test, expect } from '@playwright/test';

/**
 * LPX-1 — Landing SEO smoke (logged-out, no visual assertions).
 *
 * Proves the share/search plumbing is LIVE in the production build:
 *   1. /en head carries localized title/description, canonical + hreflang, and the
 *      OpenGraph/Twitter cards pointing at the committed 1200×630 og.jpg.
 *   2. The JSON-LD SportsActivityLocation block is present and parseable.
 *   3. /sitemap.xml and /robots.txt respond 200 with the expected entries.
 */
test('LPX-1 · landing has meta + OG + JSON-LD; sitemap + robots respond', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto('/en');
    expect(resp?.status() ?? 0, 'landing should load').toBeLessThan(400);

    // ── Title + description ──
    await expect(page).toHaveTitle(/PRO LINE Gym/i);
    const description = await page.locator('head meta[name="description"]').first().getAttribute('content');
    expect(description, 'meta description present').toBeTruthy();

    // ── Canonical + hreflang alternates ──
    const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href');
    expect(canonical, 'canonical points at the /en landing').toContain('/en');
    const hreflangAr = await page.locator('head link[rel="alternate"][hreflang="ar"]').getAttribute('href');
    expect(hreflangAr, 'an Arabic hreflang alternate exists').toContain('/ar');

    // ── OpenGraph + Twitter card → committed og.jpg ──
    const ogTitle = await page.locator('head meta[property="og:title"]').getAttribute('content');
    expect(ogTitle, 'og:title present').toContain('PRO LINE');
    const ogImage = await page.locator('head meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage, 'og:image points at the committed share card').toContain('/landing/og.jpg');
    const twitterCard = await page.locator('head meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard, 'twitter large-image card').toBe('summary_large_image');

    // ── The og.jpg asset really resolves (WhatsApp would fetch it) ──
    const og = await page.request.get('/landing/og.jpg');
    expect(og.status(), 'og.jpg is served').toBe(200);

    // ── JSON-LD structured data ──
    const jsonldRaw = await page.locator('[data-testid="landing-jsonld"]').textContent();
    expect(jsonldRaw, 'JSON-LD script is present').toBeTruthy();
    const jsonld = JSON.parse(jsonldRaw as string);
    expect(jsonld['@type']).toBe('SportsActivityLocation');
    expect(jsonld.name, 'JSON-LD has a gym name').toBeTruthy();
    expect(jsonld.address?.addressLocality, 'JSON-LD has the locality').toBeTruthy();

    // ── sitemap.xml ──
    const sitemap = await page.request.get('/sitemap.xml');
    expect(sitemap.status(), 'sitemap responds 200').toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody, 'sitemap is a urlset').toContain('<urlset');
    for (const loc of ['/ar', '/en', '/fr']) {
      expect(sitemapBody, `sitemap lists the ${loc} landing`).toContain(`${loc}<`);
    }

    // ── robots.txt ──
    const robots = await page.request.get('/robots.txt');
    expect(robots.status(), 'robots responds 200').toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody, 'robots disallows private areas').toMatch(/Disallow:\s*\/\*\/dashboard/i);
    expect(robotsBody, 'robots disallows the api').toMatch(/Disallow:\s*\/api\//i);
    expect(robotsBody, 'robots references the sitemap').toMatch(/Sitemap:\s*https?:\/\//i);
  } finally {
    await ctx.close();
  }
});
