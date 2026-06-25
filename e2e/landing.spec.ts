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

    // Brand (saga copy + Fakih Brothers).
    await expect(page.getByRole('heading', { name: /Train Like the Main Character/i })).toBeVisible();
    await expect(page.getByText(/Fakih Brothers/i).first()).toBeVisible();

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
