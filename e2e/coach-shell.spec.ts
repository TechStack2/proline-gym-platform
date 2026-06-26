import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';

/**
 * COACH-SHELL — responsive single title on the coach shell (the PORTAL-SHELL /
 * SHELL-IA echo follow-up). Like the portal, the coach shell is a SINGLE shell
 * (no mobile/desktop split), so the NativeHeader large title rendered on BOTH
 * breakpoints and echoed each coach page's content H1. Fix (same Option A): the
 * coach shell opts into `titleMobileOnly` (chrome large title mobile-only) and
 * the page's content title is `hidden md:block` — so exactly ONE title per
 * breakpoint:
 *   - mobile  → the NativeHeader large title (content title hidden)
 *   - desktop → the content title (chrome large title hidden, never title-less)
 */
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function openCoach(browser: Browser, viewport: { width: number; height: number }, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.coach.storage, locale, viewport });
  return { ctx, page: await ctx.newPage() };
}

for (const path of ['/en/coach/attendance', '/en/coach/students']) {
  test(`COACH-SHELL · one title per breakpoint on ${path} (no echo)`, async ({ browser }) => {
    // ── Mobile: chrome large title owns it; the content title is hidden ──
    const m = await openCoach(browser, MOBILE);
    try {
      await m.page.goto(path);
      await expect(m.page.locator('[data-testid="native-large-title"]'), 'mobile: chrome large title shows')
        .toBeVisible({ timeout: 15_000 });
      await expect(m.page.locator('[data-testid="coach-page-title"]'), 'mobile: the content title is hidden (no echo)')
        .toBeHidden();
    } finally {
      await m.ctx.close();
    }

    // ── Desktop: the content title owns it; the chrome large title is hidden ──
    const d = await openCoach(browser, DESKTOP);
    try {
      await d.page.goto(path);
      await expect(d.page.locator('[data-testid="coach-page-title"]'), 'desktop: the content title shows (never title-less)')
        .toBeVisible({ timeout: 15_000 });
      await expect(d.page.locator('[data-testid="native-large-title"]'), 'desktop: the chrome large title is hidden (no echo)')
        .toBeHidden();
    } finally {
      await d.ctx.close();
    }
  });
}

test('COACH-SHELL · /ar coach renders the responsive title RTL-clean (no missing keys)', async ({ browser }) => {
  const m = await openCoach(browser, MOBILE, 'ar');
  try {
    await m.page.goto('/ar/coach/attendance');
    await m.page.waitForLoadState('networkidle').catch(() => {});
    await expect(m.page.locator('[data-testid="native-large-title"]'), '/ar mobile: chrome title shows').toBeVisible({ timeout: 15_000 });
    await expect(m.page.locator('[data-testid="coach-page-title"]'), '/ar mobile: content title hidden').toBeHidden();
    await expect(m.page.locator('body'), '/ar coach has no missing i18n keys').not.toContainText('MISSING_MESSAGE');
  } finally {
    await m.ctx.close();
  }
});
