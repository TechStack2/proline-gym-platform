import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { ROLES } from './roles';
import fs from 'fs';
import path from 'path';

/**
 * AX-1 — Arabic-active smoke (the permanent regression guard).
 *
 * The client's demo verdict was "Arabic is not fully active on multiple pages
 * and the font is not the best." This pins the fix three ways, per shell:
 *  1. A KNOWN ARABIC string renders on every shell's key surface (presence of
 *     the ar value proves the page is NOT falling back to English) + the
 *     I18N-1 cleanliness asserts (no MISSING_MESSAGE, no raw-key leak).
 *  2. The landing hero heading computes to IBM Plex Sans Arabic (the next/font
 *     self-hosted family) and the page's cumulative layout shift stays within
 *     budget (the size-adjusted fallback must keep swap CLS-free).
 *  3. Each shell's header carries its identity: the labeled shell badge and
 *     the per-shell PWA theme-color.
 */

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/messages/en.json'), 'utf8'));
const KEY_LEAK = new RegExp(`\\b(${Object.keys(en).join('|')})\\.[a-z][a-zA-Z0-9_]+`);

async function ctxFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'ar' });
  return { ctx, page: await ctx.newPage() };
}

async function assertArabicActive(page: Page, label: string, knownArabic: string) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const body = await page.locator('body').innerText();
  expect(body, `${label}: the known Arabic string must render (no English fallback)`).toContain(knownArabic);
  expect(body, `${label}: must not render MISSING_MESSAGE`).not.toContain('MISSING_MESSAGE');
  const leak = body.match(KEY_LEAK);
  expect(leak, `${label}: leaked a raw i18n key → "${leak?.[0]}"`).toBeNull();
}

// DS-2: the PWA theme-color is now per light/dark (two media-scoped meta tags).
// Select by scheme so we can assert BOTH the light identity color and the shared
// dark-ground (#131317) status-bar color.
async function themeColor(page: Page, scheme: 'light' | 'dark' = 'light'): Promise<string | null> {
  return page
    .locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`)
    .first()
    .getAttribute('content');
}

test('AX-1 · /ar renders Arabic on every shell + brand font without layout shift + shell identity badges', async ({ browser }) => {
  test.setTimeout(240_000);

  // ── Landing (anon): Arabic copy through i18n (the hero was an isRTL bypass) ──
  {
    const ctx = await browser.newContext({ locale: 'ar' });
    const page = await ctx.newPage();
    try {
      await page.goto('/ar');
      await assertArabicActive(page, '/ar (landing)', 'تدرّب كبطل القصة'); // hero headline
      await assertArabicActive(page, '/ar (landing pricing)', 'خطط العضوية'); // pricing title

      // Brand font: the hero h1 computes to the next/font-hosted IBM Plex Sans
      // Arabic family (next/font mangles the name — match loosely).
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();
      const family = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family, `hero font-family was "${family}"`).toMatch(/IBM[ _]?Plex[ _]?Sans[ _]?Arabic/i);

      // CLS budget: the size-adjusted fallback must make the swap shift-free.
      const cls = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let total = 0;
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as any[]) {
                if (!e.hadRecentInput) total += e.value;
              }
            }).observe({ type: 'layout-shift', buffered: true } as any);
            setTimeout(() => resolve(total), 1500);
          }),
      );
      expect(cls, `landing CLS ${cls} must stay under 0.1 (good-CLS budget)`).toBeLessThan(0.1);
    } finally {
      await ctx.close();
    }
  }

  // ── Staff shell (owner): Arabic + staff badge + red theme-color ──
  {
    const owner = await ctxFor(browser, 'owner');
    try {
      await owner.page.goto('/ar/today');
      await assertArabicActive(owner.page, '/ar/today', 'اليوم');
      await expect(
        owner.page.locator('[data-testid="shell-badge"][data-shell="staff"]:visible').first(),
        'staff header carries the labeled shell badge',
      ).toBeVisible({ timeout: 15_000 });
      expect(await themeColor(owner.page, 'light'), 'staff PWA theme-color (light)').toBe('#cd1419');
      expect(await themeColor(owner.page, 'dark'), 'staff PWA theme-color (dark)').toBe('#131317');

      await owner.page.goto('/ar/money');
      await assertArabicActive(owner.page, '/ar/money', 'المال');
    } finally {
      await owner.ctx.close();
    }
  }

  // ── Coach shell: Arabic + gold-on-black badge + black theme-color ──
  {
    const coach = await ctxFor(browser, 'coach');
    try {
      await coach.page.goto('/ar/coach');
      await assertArabicActive(coach.page, '/ar/coach', 'طلابي'); // COACH360-PORTAL hub: "My students" (stat + card)
      await expect(
        coach.page.locator('[data-testid="shell-badge"][data-shell="coach"]:visible').first(),
        'coach header carries the labeled shell badge',
      ).toBeVisible({ timeout: 15_000 });
      expect(await themeColor(coach.page, 'light'), 'coach PWA theme-color (light)').toBe('#111111');
      expect(await themeColor(coach.page, 'dark'), 'coach PWA theme-color (dark)').toBe('#131317');
    } finally {
      await coach.ctx.close();
    }
  }

  // ── Member portal: Arabic (was the biggest isRTL-bypass page) + teal identity ──
  {
    const student = await ctxFor(browser, 'student');
    try {
      await student.page.goto('/ar/portal');
      await assertArabicActive(student.page, '/ar/portal', 'حالتي'); // portalHome.myStatus
      await expect(
        student.page.locator('[data-testid="shell-badge"][data-shell="portal"]:visible').first(),
        'portal header carries the labeled shell badge',
      ).toBeVisible({ timeout: 15_000 });
      expect(await themeColor(student.page, 'light'), 'portal PWA theme-color (light)').toBe('#0e7490');
      expect(await themeColor(student.page, 'dark'), 'portal PWA theme-color (dark)').toBe('#131317');

      await student.page.goto('/ar/portal/billing');
      await assertArabicActive(student.page, '/ar/portal/billing', 'سجل المدفوعات'); // payment history
    } finally {
      await student.ctx.close();
    }
  }
});
