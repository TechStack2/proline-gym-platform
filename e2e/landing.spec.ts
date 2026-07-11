import { test, expect } from '@playwright/test';
import { gymSlug } from './helpers';

/**
 * Public landing — logged-out catalog visibility (Cycle 5 / V1 / LP).
 *
 * The proof for the anon public-read policies (000035): a visitor with NO session
 * (anon role) lands on the run gym's page and sees the LIVE catalog — disciplines,
 * the weekly schedule grid, and membership pricing — plus the branded sections.
 * Pre-000035 the data sections were empty for anon (RLS required `authenticated`).
 * Targets the ephemeral run gym via ?gym=<slug> (prod defaults to the demo gym).
 */
test('LP · logged-out landing renders live schedule + pricing + disciplines + brand', async ({ browser }) => {
  // Fresh context with NO storageState → the anon role.
  const ctx = await browser.newContext({ locale: 'en' });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    expect(resp?.status() ?? 0, 'landing should load for a logged-out visitor').toBeLessThan(400);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Brand (saga copy). TENANT-CONTENT: the run gym is NON-default, so the Proline
    // founders' credit ("By Fakih Brothers") must NOT leak onto its footer.
    await expect(page.getByRole('heading', { name: /Train Like the Main Character/i })).toBeVisible();
    await expect(page.getByText(/Fakih Brothers/i), 'no Proline founder credit on a tenant landing').toHaveCount(0);

    // Disciplines — seeded Muay Thai is gym-scoped + active (anon-readable).
    await expect(page.locator('#disciplines')).toContainText(/Muay Thai/i);

    // Schedule — the run gym seeds the class on EVERY weekday, so the grid renders a
    // column for each day the gym actually schedules (LANDING-CLASSES: data-driven
    // columns, not a hardcoded Mon/Wed/Fri subset). The class name shows anon.
    const schedule = page.locator('#schedule');
    await expect(schedule.locator('table')).toBeVisible();
    await expect(schedule).toContainText(/Muay Thai/i);
    // Days beyond Mon/Wed/Fri must render — guards the day-filter regression that
    // silently dropped Tue/Thu/Sat classes from the public schedule on prod.
    await expect(schedule).toContainText(/Tuesday/i);
    await expect(schedule).toContainText(/Saturday/i);

    // Pricing — seeded membership plans render from the DB (not just a static stub).
    await expect(page.locator('[data-testid="pricing-plans"]')).toBeVisible();
    await expect(page.locator('#pricing')).toContainText(/Monthly|Quarterly|Annual/i);

    // Branded sections present (affiliations strip with graceful logo fallback).
    await expect(page.locator('#affiliations')).toBeVisible();

    // No i18n gaps on any rendered landing copy.
    await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
    await expect(page.locator('body')).not.toContainText('landing.schedule');
  } finally {
    await ctx.close();
  }
});

/**
 * HERO-FIX guard — the hero stays a BALANCED full-bleed overlay at ultra-wide.
 *
 * 3rd recurrence of the "sidelined hero". Root cause: next/image `fill` applies
 * its absolute full-bleed positioning via an inline `style` attribute, and the
 * prod CSP (`style-src 'self' 'strict-dynamic' 'nonce-…'`, no 'unsafe-inline' —
 * and neither nonce nor strict-dynamic covers inline style ATTRIBUTES) strips it.
 * The image then collapses to `position:static` → an in-flow flex child of the
 * `justify-center` hero → it bounds to the left and shoves the centered content
 * to the right. The fix moves the positioning onto CSS CLASSES (CSP-safe).
 *
 * This runs under CI's prod webServer (`next start` → prod CSP), so it reproduces
 * the bug: the old inline-only code FAILS here; the class-based fix PASSES.
 */
test('LP · hero is a balanced full-bleed overlay at ultra-wide (centering guard)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 2880, height: 1620 }, locale: 'en' });
  const page = await ctx.newPage();
  try {
    await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const m = await page.evaluate(() => {
      const hero = document.querySelector('h1')?.closest('section');
      const img = hero?.querySelector('img[aria-hidden]') || hero?.querySelector('img');
      const content = document.querySelector('h1')?.closest('div'); // centered content block
      const r = (el: Element | null | undefined) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, w: b.width, cx: b.x + b.width / 2 };
      };
      return { vw: window.innerWidth, img: r(img), content: r(content) };
    });

    // Image is full-bleed (covers the section edge-to-edge), not a left-bounded band.
    expect(m.img, 'hero background image present').not.toBeNull();
    expect(m.img!.w, `hero image must be full-bleed at ${m.vw}px (sidelined bug → ~863px)`).toBeGreaterThanOrEqual(m.vw - 2);

    // Content block is horizontally centered on the page (not sidelined to one side).
    expect(m.content, 'hero content block present').not.toBeNull();
    const offset = Math.abs(m.content!.cx - m.vw / 2);
    expect(offset, `hero content must be centered, not sidelined (off by ${Math.round(offset)}px)`).toBeLessThanOrEqual(24);
  } finally {
    await ctx.close();
  }
});
