import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis } from './helpers';

/**
 * Admin Presentation Repair verification (Cycle 5 / V1 / AR).
 *
 * The admin layer was uniformly DOA against the real normalized schema (names on
 * profiles; is_active not .status; no top-level .or() over embedded columns). This
 * drives the repaired surfaces as the owner against the ephemeral run gym and
 * asserts they now render REAL data:
 *   - classes list renders the coach NAME (Sami) + a real enrollment count (n/20)
 *   - class detail renders the coach + enrolled-student NAMES (Karim, Omar)
 *   - students search returns the seeded student by NAME and by PHONE (and filters)
 *   - payments-history shows a recorded payment (member · method · amount · invoice)
 * …and that no surface leaks a MISSING_MESSAGE i18n error.
 */
const RUN = Date.now().toString().slice(-6);

async function ownerPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function expectNoMissingMessage(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

test('AR · classes list renders coach name + counts; class detail shows enrolled NAMES', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await ownerPage(browser);
  try {
    await page.goto('/en/classes');
    await expect(vis(page, '[data-testid="class-card"]').first()).toBeVisible({ timeout: 15_000 });
    // Coach NAME (via profiles) — not blank.
    await expect(vis(page, '[data-testid="class-coach"]').first()).toContainText('Sami');
    // Enrollment count is a real number out of capacity (n/20), not undefined/NaN.
    await expect(vis(page, '[data-testid="class-count"]').first()).toContainText(/\d+\/20/);
    await expectNoMissingMessage(page);

    // Open the seeded class → detail.
    await vis(page, '[data-testid="class-card"]').filter({ hasText: 'Muay Thai' }).first().click();
    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(vis(page, '[data-testid="detail-coach"]')).toContainText('Sami');
    // Enrolled student NAMES render (seed enrolls Karim + Omar).
    const names = vis(page, '[data-testid="enrolled-student"]');
    await expect(names.first()).toBeVisible();
    await expect(names.filter({ hasText: 'Karim' }).first()).toBeVisible();
    await expectNoMissingMessage(page);
  } finally {
    await ctx.close();
  }
});

test('AR · students search returns the seeded student by name and by phone', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await ownerPage(browser);
  try {
    // By name — Karim matches, Omar is filtered out (proves search actually filters).
    await page.goto('/en/students?search=Karim');
    const cards = vis(page, '[data-testid="student-card"]');
    await expect(cards.filter({ hasText: 'Karim' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(cards.filter({ hasText: 'Omar' })).toHaveCount(0);
    await expectNoMissingMessage(page);

    // By phone — Karim's seeded number.
    await page.goto(`/en/students?search=${encodeURIComponent('+96170000001')}`);
    await expect(vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first())
      .toBeVisible({ timeout: 15_000 });
    await expectNoMissingMessage(page);
  } finally {
    await ctx.close();
  }
});

test('AR · payments-history shows a recorded payment (member · method · amount · invoice)', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await ownerPage(browser);
  try {
    // Self-contained: issue an invoice for Karim, then settle it (D1 flow), so a
    // payment exists to render — independent of other specs' ordering.
    await page.goto('/en/invoices/new');
    const karim = await page.locator('[data-testid="inv-student"] option', { hasText: 'Karim' }).first().getAttribute('value');
    await vis(page, '[data-testid="inv-student"]').selectOption(karim!);
    await vis(page, '[data-testid="inv-amount-usd"]').fill('30');
    await vis(page, '[data-testid="issue-submit"]').click();
    await expect(vis(page, '[data-testid="invoice-number"]')).toBeVisible({ timeout: 15_000 });
    const invNum = (await vis(page, '[data-testid="invoice-number"]').textContent())!.trim();
    await vis(page, '[data-testid="pay-method"]').selectOption('cash_usd');
    await vis(page, '[data-testid="pay-submit"]').click(); // default amount = full balance → paid → receipt
    await expect(vis(page, '[data-testid="receipt"]')).toBeVisible({ timeout: 15_000 });

    // Payments-history renders the row with member + method + amount + invoice link.
    await page.goto('/en/payments');
    const row = vis(page, '[data-testid="payment-row"]').filter({ hasText: invNum }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Karim');
    await expect(row).toContainText('33.30'); // 30 + 11% TVA
    await expectNoMissingMessage(page);

    // Method filter (pairs with D1's tally) keeps the cash payment.
    await page.goto('/en/payments?method=cash_usd');
    await expect(vis(page, '[data-testid="payment-row"]').filter({ hasText: invNum }).first())
      .toBeVisible({ timeout: 15_000 });
    await expectNoMissingMessage(page);
  } finally {
    await ctx.close();
  }
});
