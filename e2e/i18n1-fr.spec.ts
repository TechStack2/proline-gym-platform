import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { ROLES } from './roles';
import fs from 'fs';
import path from 'path';

/**
 * I18N-1 — French completeness smoke (parallel track).
 *
 * Drives the main surfaces in `fr` as real logins and asserts that NO page renders
 * `MISSING_MESSAGE` (next-intl's missing-key marker) or leaks a raw i18n key as
 * visible text (e.g. `students.cancel`, `coach.attendance.title`). The raw-key
 * regex is built from the ACTUAL top-level namespaces in en.json, and requires a
 * lowercase letter IMMEDIATELY after the dot — so French prose ending in
 * "…la direction." can't false-positive (that's a dot + space).
 */

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/messages/en.json'), 'utf8'));
const NAMESPACES = Object.keys(en);
// A leaked key looks like `<namespace>.<lowercaseKeyStart>` with no space after the dot.
const KEY_LEAK = new RegExp(`\\b(${NAMESPACES.join('|')})\\.[a-z][a-zA-Z0-9_]+`);

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'fr' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function assertCleanFr(page: Page, label: string): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  // innerText = visible text only (excludes scripts/styles + the hidden double-shell copy).
  const body = await page.locator('body').innerText();
  expect(body, `${label}: must not render MISSING_MESSAGE`).not.toContain('MISSING_MESSAGE');
  const leak = body.match(KEY_LEAK);
  expect(leak, `${label}: leaked a raw i18n key as text → "${leak?.[0]}"`).toBeNull();
}

test('I18N-1 · fr renders with no MISSING_MESSAGE and no raw-key leak across the app', async ({ browser }) => {
  test.setTimeout(150_000);

  // ── Staff surfaces (owner) ──
  {
    const owner = await contextFor(browser, 'owner');
    try {
      for (const p of ['/fr/today', '/fr/inbox', '/fr/students', '/fr/schedule', '/fr/money', '/fr/settings']) {
        const resp = await owner.page.goto(p);
        expect(resp?.status() ?? 0, `${p} should load`).toBeLessThan(400);
        await assertCleanFr(owner.page, p);
      }
      // I18N-POLISH-1: the invoices surfaces (list + issue form) render FRENCH, not
      // English/Arabic fallbacks. assertCleanFr covers raw-key/MISSING_MESSAGE; the
      // explicit tokens prove the actual French copy renders (the inline t(en,ar,fr)).
      await owner.page.goto('/fr/invoices');
      await assertCleanFr(owner.page, '/fr/invoices');
      await expect(owner.page.getByText('Solde impayé'), '/fr invoices list is localized').toBeVisible({ timeout: 15_000 });
      await owner.page.goto('/fr/invoices/new');
      await assertCleanFr(owner.page, '/fr/invoices/new');
      await expect(owner.page.getByText('Émettre la facture'), '/fr issue form is localized').toBeVisible({ timeout: 15_000 });

      // I18N-POLISH-2: the payments surfaces (history/audit + record-payment) render
      // French — the inline t(en,ar,fr) helper + METHOD_LABEL.fr.
      await owner.page.goto('/fr/money?tab=payments');
      await assertCleanFr(owner.page, '/fr/money?tab=payments');
      // NB: assert a VISIBLE token (the Filtrer button) — the method <option>s carry
      // French too but options are never "visible" to Playwright.
      await expect(owner.page.getByRole('button', { name: 'Filtrer' }), '/fr payments view is localized').toBeVisible({ timeout: 15_000 });
      await owner.page.goto('/fr/payments/new');
      await assertCleanFr(owner.page, '/fr/payments/new');
      await expect(owner.page.getByText('Choisissez une facture ouverte à régler.'), '/fr record-payment is localized').toBeVisible({ timeout: 15_000 });

      // One member file (Member-360) — reached via the list's File action.
      await owner.page.goto('/fr/students');
      await owner.page.waitForLoadState('networkidle').catch(() => {});
      const file = owner.page.locator('[data-testid="row-file"]:visible').first();
      await expect(file, 'a member File link should exist').toBeVisible({ timeout: 15_000 });
      await file.click();
      await expect(owner.page, 'should land on a member file').toHaveURL(/\/students\/[0-9a-f-]{8,}/, { timeout: 15_000 });
      await assertCleanFr(owner.page, '/fr/students/[id] (member file)');
    } finally {
      await owner.ctx.close();
    }
  }

  // ── Portal home (student) ──
  {
    const s = await contextFor(browser, 'student');
    try {
      const resp = await s.page.goto('/fr/portal');
      expect(resp?.status() ?? 0, '/fr/portal should load').toBeLessThan(400);
      await assertCleanFr(s.page, '/fr/portal');
    } finally {
      await s.ctx.close();
    }
  }

  // ── Coach home (coach) ──
  {
    const c = await contextFor(browser, 'coach');
    try {
      const resp = await c.page.goto('/fr/coach');
      expect(resp?.status() ?? 0, '/fr/coach should load').toBeLessThan(400);
      await assertCleanFr(c.page, '/fr/coach');
    } finally {
      await c.ctx.close();
    }
  }

  // ── Logged-out /fr landing (anon) ──
  {
    const ctx = await browser.newContext({ locale: 'fr' });
    const page = await ctx.newPage();
    try {
      const resp = await page.goto('/fr');
      expect(resp?.status() ?? 0, '/fr landing should load').toBeLessThan(400);
      await assertCleanFr(page, '/fr (landing)');
    } finally {
      await ctx.close();
    }
  }
});
