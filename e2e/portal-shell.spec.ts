import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';

/**
 * PORTAL-SHELL — responsive single title on the member/parent portal (the
 * SHELL-IA echo follow-up). The portal is a SINGLE shell (no mobile/desktop split
 * like the dashboard), so the NativeHeader large title rendered on BOTH
 * breakpoints and echoed each page's content H1. Fix (Option A): the chrome large
 * title is now MOBILE-ONLY (`titleMobileOnly`), and the page's content title is
 * `hidden md:block` — so exactly ONE title shows per breakpoint:
 *   - mobile  → the NativeHeader large title (content H1 hidden)
 *   - desktop → the content H1 (chrome large title hidden, never title-less)
 */
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function openPortal(browser: Browser, viewport: { width: number; height: number }, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.student.storage, locale, viewport });
  return { ctx, page: await ctx.newPage() };
}

for (const path of ['/en/portal/billing', '/en/portal/progress']) {
  test(`PORTAL-SHELL · one title per breakpoint on ${path} (no echo)`, async ({ browser }) => {
    // ── Mobile: chrome large title owns it; the content H1 is hidden ──
    const m = await openPortal(browser, MOBILE);
    try {
      await m.page.goto(path);
      await expect(m.page.locator('[data-testid="native-large-title"]'), 'mobile: chrome large title shows')
        .toBeVisible({ timeout: 15_000 });
      await expect(m.page.locator('[data-testid="portal-page-title"]'), 'mobile: the content H1 is hidden (no echo)')
        .toBeHidden();
    } finally {
      await m.ctx.close();
    }

    // ── Desktop: the content H1 owns it; the chrome large title is hidden ──
    const d = await openPortal(browser, DESKTOP);
    try {
      await d.page.goto(path);
      await expect(d.page.locator('[data-testid="portal-page-title"]'), 'desktop: the content H1 shows (never title-less)')
        .toBeVisible({ timeout: 15_000 });
      await expect(d.page.locator('[data-testid="native-large-title"]'), 'desktop: the chrome large title is hidden (no echo)')
        .toBeHidden();
    } finally {
      await d.ctx.close();
    }
  });
}

test('PORTAL-SHELL · /ar portal renders the responsive title RTL-clean (no missing keys)', async ({ browser }) => {
  const m = await openPortal(browser, MOBILE, 'ar');
  try {
    await m.page.goto('/ar/portal/billing');
    await m.page.waitForLoadState('networkidle').catch(() => {});
    await expect(m.page.locator('[data-testid="native-large-title"]'), '/ar mobile: chrome title shows').toBeVisible({ timeout: 15_000 });
    await expect(m.page.locator('[data-testid="portal-page-title"]'), '/ar mobile: content H1 hidden').toBeHidden();
    await expect(m.page.locator('body'), '/ar portal has no missing i18n keys').not.toContainText('MISSING_MESSAGE');
  } finally {
    await m.ctx.close();
  }
});

// MJ-4 FR COMPLETENESS: the portal renders French clean — no MISSING_MESSAGE (a
// missing fr key) AND no isRTL?ar:en English leak. The Classes tab is the sharpest
// probe (it held all five of the fixed content bypasses); its French subtitle must
// render and the English one must be absent.
test('PORTAL-SHELL · /fr portal renders French clean (no missing keys, no English leak)', async ({ browser }) => {
  const m = await openPortal(browser, MOBILE, 'fr');
  try {
    await m.page.goto('/fr/portal/classes');
    await m.page.waitForLoadState('networkidle').catch(() => {});
    await expect(m.page.locator('[data-testid="native-large-title"]'), '/fr mobile: chrome title shows').toBeVisible({ timeout: 15_000 });
    await expect(m.page.locator('body'), '/fr portal has no missing i18n keys').not.toContainText('MISSING_MESSAGE');
    await expect(m.page.locator('body'), '/fr Classes renders its French copy').toContainText('Inscrivez-vous');
    await expect(m.page.locator('body'), '/fr Classes does not fall back to the English subtitle').not.toContainText('Register for a recurring');
    await m.page.screenshot({ path: 'screenshots/mj4-fr-classes.png', fullPage: true }).catch(() => {}); // VISUAL: fr portal
    // VISUAL: the reordered portal home (next-session-first) in French.
    await m.page.goto('/fr/portal');
    await m.page.waitForLoadState('networkidle').catch(() => {});
    await m.page.screenshot({ path: 'screenshots/mj4-portal-home-fr.png', fullPage: true }).catch(() => {});
    // VISUAL: a guided empty state (progress tab leads with the "browse classes" action
    // when no rank is recorded). Best-effort — depends on the fixture's belt data.
    await m.page.goto('/en/portal/progress');
    await m.page.waitForLoadState('networkidle').catch(() => {});
    await m.page.screenshot({ path: 'screenshots/mj4-empty-progress.png', fullPage: true }).catch(() => {});
  } finally {
    await m.ctx.close();
  }
});
