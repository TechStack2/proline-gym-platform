import { test, expect, type Page } from '@playwright/test';
import { ROLES } from './roles';

/**
 * VISUAL-POLISH — the owner's pre-walkthrough visual-audit fixes, pinned as
 * BEHAVIOUR + evidence (not pixels):
 *
 *   R1 LATIN FONT: document.body resolves to the Geist next/font family on the
 *      landing + login + a dashboard page. Before the fix --font-latin was declared
 *      at :root referencing var(--font-geist-sans) — a var defined only on <body> —
 *      so it was invalid-at-computed-value-time and every Latin `font-family`
 *      collapsed to the UA system font. The :root→<body> re-anchor resolves it.
 *
 *   R3/R4 LANDING DARK + TOGGLE: the shared ThemeToggle is mounted in the landing
 *      nav; cycling it to dark puts .dark on <html> and the (landing-dark) hero still
 *      renders with LIGHT text on a dark ground — the headline computes to true white,
 *      NOT the DS-2 channel-var flip's near-black. Light is the default (every other
 *      landing spec in the suite runs light and is unaffected → no dark: leakage).
 *
 *   R5 STICKY HARDEN: a load MID-PAGE (an in-page anchor) starts the fixed nav SOLID
 *      (not transparent-over-content) — the on-mount scroll seed. The fix is a plain
 *      onScroll() init call, so it is browser-agnostic (WebKit verified manually — no
 *      WebKit project runs in CI).
 *
 *   R2/R3 EVIDENCE: dark screenshots (login typed, a dashboard input typed, the
 *      landing top+scrolled en/ar) into screenshots/ for the visual review.
 *
 * Anon + owner contexts opened internally → this spec must NOT pin a session.
 */

const GEIST = /GeistSans/i;

function bodyFont(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).fontFamily);
}

test('VISUAL-POLISH · R1 — body renders Geist (not the UA system font) on landing + login + dashboard', async ({ browser }) => {
  test.setTimeout(90_000);

  // Landing + login are anon.
  const anon = await browser.newContext({ locale: 'en' });
  try {
    const p = await anon.newPage();

    await p.goto('/en');
    await expect(p.locator('h1').first(), 'landing rendered').toBeVisible({ timeout: 15_000 });
    expect(await bodyFont(p), 'landing body font-family resolves to Geist').toMatch(GEIST);

    await p.goto('/en/auth/login');
    await expect(p.locator('#email'), 'login rendered').toBeVisible({ timeout: 15_000 });
    expect(await bodyFont(p), 'login body font-family resolves to Geist').toMatch(GEIST);
  } finally {
    await anon.close();
  }

  // One dashboard page (owner).
  const owner = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' });
  try {
    const p = await owner.newPage();
    await p.goto('/en/today');
    await expect(p.locator('[data-testid="shell-content"], main').first(), 'dashboard rendered').toBeVisible({ timeout: 20_000 });
    expect(await bodyFont(p), 'dashboard body font-family resolves to Geist').toMatch(GEIST);
  } finally {
    await owner.close();
  }
});

test('VISUAL-POLISH · R3/R4 — the landing is coherent under html.dark (toggle mounts; hero stays light-on-dark)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' }); // Playwright default colorScheme = light
  const page = await ctx.newPage();
  try {
    await page.goto('/en');
    const html = page.locator('html');
    await expect(html, 'default (system, light) — not dark').not.toHaveClass(/dark/);

    // R4: the toggle is mounted in the landing nav (desktop cluster).
    const toggle = page.getByTestId('theme-toggle').first();
    await expect(toggle, 'theme toggle is mounted on the landing nav').toBeVisible({ timeout: 15_000 });

    // Cycle system → light → dark.
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-theme-mode', 'dark');
    await expect(html, 'html.dark applied from the landing toggle').toHaveClass(/dark/);

    // R3: the hero (landing-dark) stays DARK with LIGHT text — the headline computes to
    // true white (the landing-dark channel-var reset), NOT the flipped near-black
    // (rgb(34, 34, 42)) that a naive channel-var flip would give.
    const h1 = page.locator('section.landing-dark h1').first();
    await expect(h1, 'hero headline present under dark').toBeVisible();
    const color = await h1.evaluate((el) => getComputedStyle(el).color);
    expect(color, `hero headline stays light on dark (was "${color}")`).toBe('rgb(255, 255, 255)');

    // Evidence: dark landing, top + scrolled.
    await page.screenshot({ path: 'screenshots/visual-polish-landing-dark-top.png', fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/visual-polish-landing-dark-scrolled.png', fullPage: false });
  } finally {
    await ctx.close();
  }
});

test('VISUAL-POLISH · R5 — a load mid-page starts the sticky nav SOLID (on-mount scroll seed)', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en' });
  const page = await ctx.newPage();
  try {
    // Load DIRECTLY at an in-page anchor: the browser jumps down on load, firing NO
    // scroll event. Without the on-mount seed the bar would start transparent
    // (unreadable light nav over a white content section); with it, it self-corrects.
    await page.goto('/en#facility');
    await expect(page.locator('nav').first(), 'landing nav present').toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500); // mount effect + scroll settle

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY, 'the anchor put us mid-page (>20)').toBeGreaterThan(20);

    const bg = await page.locator('nav').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, `the fixed nav is SOLID on a mid-page load (was "${bg}")`).not.toBe('rgba(0, 0, 0, 0)');
  } finally {
    await ctx.close();
  }
});

test('VISUAL-POLISH · R2 — dark-mode fields show typed text (login + a dashboard input) + /ar dark landing', async ({ browser }) => {
  test.setTimeout(90_000);

  // Login — typed email/password legible in dark (color-scheme + text-gray-900 flip).
  const anon = await browser.newContext({ locale: 'en' });
  await anon.addInitScript(() => localStorage.setItem('theme', 'dark'));
  try {
    const p = await anon.newPage();
    await p.goto('/en/auth/login');
    await expect(p.locator('#email')).toBeVisible({ timeout: 15_000 });
    await p.locator('#email').fill('owner@prolinegym.lb');
    await p.locator('#password').fill('a-visible-passphrase');
    // The typed text must be the light (flipped) gray-900 — not black-on-dark.
    const color = await p.locator('#email').evaluate((el) => getComputedStyle(el).color);
    expect(color, `login field text is light in dark (was "${color}")`).not.toBe('rgb(0, 0, 0)');
    await p.screenshot({ path: 'screenshots/visual-polish-login-dark-typed.png' });
  } finally {
    await anon.close();
  }

  // A dashboard input (the header search) typed, in dark.
  const owner = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' });
  await owner.addInitScript(() => localStorage.setItem('theme', 'dark'));
  try {
    const p = await owner.newPage();
    await p.goto('/en/today');
    const search = p.locator('input[type="search"]').first();
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill('Karim');
    await p.screenshot({ path: 'screenshots/visual-polish-dashboard-dark-typed.png' });
  } finally {
    await owner.close();
  }

  // /ar dark landing evidence (RTL + dark coherent).
  const ar = await browser.newContext({ locale: 'ar' });
  await ar.addInitScript(() => localStorage.setItem('theme', 'dark'));
  try {
    const p = await ar.newPage();
    await p.goto('/ar');
    await expect(p.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    await p.screenshot({ path: 'screenshots/visual-polish-landing-ar-dark.png', fullPage: false });
  } finally {
    await ar.close();
  }
});
