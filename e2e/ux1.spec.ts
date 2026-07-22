import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, createClassViaWizard } from './helpers';

/**
 * UX-1 — bell realtime crash fix + touch-first Add-Class wizard (Cycle 5 / V1).
 *
 *  1. The owner creates a class ENTIRELY through the wizard (discipline chip,
 *     coach chip, Mon+Wed+Fri day pills, 17:00 preset, capacity stepper input,
 *     fee) → it appears in /classes AND as chips in the IA-3 week Timetable on
 *     all three days at the chosen slot.
 *  2. Zero unhandled page errors across the staff navigation sequence
 *     (login-session → /today → /inbox → /schedule). Pre-fix, the bell's reused
 *     realtime topic threw "cannot add postgres_changes callbacks after
 *     subscribe()" on the double-mounted shells — page.on('pageerror') catches
 *     exactly that class of regression.
 *  3. /ar wizard renders clean (RTL + no MISSING_MESSAGE).
 */
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `UX1 Class ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

test('UX-1 · wizard-created class lands in list + timetable; zero page errors; /ar clean', async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await ctxFor(browser, 'owner');
  const pageErrors: string[] = [];
  owner.page.on('pageerror', (err) => pageErrors.push(err.message));
  try {
    // ── Zero-pageerror navigation sweep (the bell crash regression trap) ──
    for (const path of ['/en/today', '/en/inbox', '/en/schedule']) {
      await owner.page.goto(path);
      await owner.page.waitForLoadState('networkidle').catch(() => {});
    }

    // ── Create a class fully through the wizard ──
    await owner.page.goto('/en/classes');
    // Mon is preselected; add Wed (3) + Fri (5); 17:00 preset → 17:00–18:00.
    await createClassViaWizard(owner.page, {
      nameEn: CLASS_NAME, capacity: '15', fee: '35', extraDays: [3, 5], presetTime: '17:00',
    });

    // In the /classes list.
    await expect(
      vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first(),
      'wizard-created class appears in the list',
    ).toBeVisible({ timeout: 15_000 });

    // In the IA-3 week Timetable: one chip per selected day at the chosen slot.
    await owner.page.goto('/en/schedule');
    const chips = vis(owner.page, `[data-testid="week-chip"][data-class-en="${CLASS_NAME}"]`);
    await expect(chips, 'chips on Mon, Wed and Fri').toHaveCount(3, { timeout: 15_000 });
    // W4: the grid's time column rides fmtTimeRange, which wraps each side in
    // LRI/PDI bidi isolates (DA-7) — regex-match around them, never exact-equality.
    await expect(vis(owner.page, '[data-testid="week-grid"]').first()).toContainText(/17:00.*–.*18:00/);

    // ── No unhandled errors anywhere in the sweep or the wizard flow ──
    expect(pageErrors, `unhandled page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await owner.ctx.close();
  }

  // ── /ar wizard renders clean (RTL) ──
  const ar = await ctxFor(browser, 'owner');
  try {
    await ar.page.goto('/ar/classes');
    await vis(ar.page, '[data-testid="add-class-btn"]').click();
    await expect(ar.page.getByTestId('class-wizard')).toBeVisible({ timeout: 15_000 });
    await expect(ar.page.locator('[data-testid="wizard-discipline-chip"]').first()).toBeVisible();
    await expect(ar.page.locator('body')).not.toContainText('MISSING_MESSAGE');
    await expect(ar.page.locator('body')).not.toContainText('classes.wizard');
  } finally {
    await ar.ctx.close();
  }
});
