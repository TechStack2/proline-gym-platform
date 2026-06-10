import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification } from './helpers';

/**
 * Recurring-Class Registration vertical slice (Cycle 5 / V1 / B2).
 *
 * The group-class analog of PT acquisition: request → approve → bill → roster,
 * with capacity + a waitlist that auto-promotes & notifies. Drives the whole
 * loop against the ephemeral run gym on a fresh capacity-1 class:
 *
 *   - owner creates a class (capacity 1, $40/mo).
 *   - owner registers Omar (walk-in) → approves → ACTIVE (free spot) + invoice +
 *     roster projection (B1 class_enrollments).            [class_approved → Omar]
 *   - Karim (login) requests in the portal → requested      [class_requested → staff]
 *   - owner approves Karim → class is FULL → WAITLISTED #1, NO invoice
 *     (capacity never exceeded: active stays 1).            [class_waitlisted → Karim]
 *   - owner cancels Omar (active) → the lowest waitlisted (Karim) is ATOMICALLY
 *     promoted → ACTIVE + invoice + roster swap.            [waitlist_promoted → Karim]
 *
 * Notifications asserted via /notifications for the login actors (owner, Karim);
 * the login-less actor (Omar) is asserted via resulting state (its notifications
 * persist via the FK→profiles fix, proven separately). No MISSING_MESSAGE.
 */
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `B2 Class ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

test('B2 · request → approve(free)→active+invoice+roster → full→waitlist → cancel→auto-promote', async ({ browser }, testInfo) => {
  test.setTimeout(200_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim (has a login)
  try {
    // ── Owner creates a capacity-1, $40/mo class ──────────────────────────────
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await owner.page.getByTestId('class-name-en').fill(CLASS_NAME);
    await owner.page.getByTestId('class-discipline-trigger').click();
    await owner.page.getByRole('option', { name: 'Muay Thai' }).first().click();
    await owner.page.getByTestId('class-coach-trigger').click();
    await owner.page.getByRole('option', { name: 'Sami' }).first().click();
    await owner.page.getByTestId('class-capacity').fill('1');
    await owner.page.getByTestId('class-monthly-fee').fill('40');
    await owner.page.getByTestId('class-submit').click();

    // Open the new class → capture its detail URL.
    await expect(vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first())
      .toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first().click();
    await expect(owner.page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const detailUrl = owner.page.url();

    // ── Walk-in register Omar (login-less) → approve → ACTIVE (free spot) ──────
    const omarVal = await owner.page.locator('[data-testid="walkin-student"] option', { hasText: 'Omar' }).first().getAttribute('value');
    await vis(owner.page, '[data-testid="walkin-student"]').selectOption(omarVal!);
    await vis(owner.page, '[data-testid="walkin-register-btn"]').click();
    let omarReq = vis(owner.page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: 'Omar' }).first();
    await expect(omarReq).toBeVisible({ timeout: 15_000 });
    await omarReq.getByTestId('approve-btn').click();
    // Omar is now active + invoiced; the roster (B1) gained Omar.
    const omarActive = vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Omar' }).first();
    await expect(omarActive).toBeVisible({ timeout: 15_000 });
    await expect(omarActive).toContainText('Invoiced');
    await expect(vis(owner.page, '[data-testid="enrolled-student"]').filter({ hasText: 'Omar' }).first()).toBeVisible();
    await noMissing(owner.page);

    // ── Karim requests in the portal ──────────────────────────────────────────
    await student.page.goto('/en/portal/classes');
    const karimCard = vis(student.page, '[data-testid="portal-class-card"]').filter({ hasText: CLASS_NAME }).first();
    await expect(karimCard).toBeVisible({ timeout: 15_000 });
    await karimCard.getByTestId('request-btn').click();
    await expect(karimCard.getByTestId('reg-status')).toHaveAttribute('data-status', 'requested', { timeout: 15_000 });
    await noMissing(student.page);
    // Staff received class_requested.
    await expectNotification(owner.page, 'class_requested');

    // ── Owner approves Karim → FULL → WAITLISTED #1 (no invoice) ───────────────
    await owner.page.goto(detailUrl);
    const karimReq = vis(owner.page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: 'Karim' }).first();
    await expect(karimReq).toBeVisible({ timeout: 15_000 });
    await karimReq.getByTestId('approve-btn').click();
    const karimWait = vis(owner.page, '[data-testid="reg-row"][data-status="waitlisted"]').filter({ hasText: 'Karim' }).first();
    await expect(karimWait).toBeVisible({ timeout: 15_000 });
    await expect(karimWait).toHaveAttribute('data-position', '1');
    await expect(karimWait).not.toContainText('Invoiced'); // E5: waitlisted is NOT billed
    // E2: capacity never exceeded — exactly ONE active (Omar) despite the approval.
    await expect(vis(owner.page, '[data-testid="reg-row"][data-status="active"]')).toHaveCount(1);
    await expectNotification(student.page, 'class_waitlisted');

    // ── Cancel Omar (active) → ATOMIC auto-promote of Karim → ACTIVE + invoice ─
    await owner.page.goto(detailUrl);
    await vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Omar' }).first()
      .getByTestId('cancel-reg-btn').click();
    const karimActive = vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Karim' }).first();
    await expect(karimActive).toBeVisible({ timeout: 15_000 });
    await expect(karimActive).toContainText('Invoiced'); // promotion billed
    await expect(vis(owner.page, '[data-testid="reg-row"][data-status="waitlisted"]')).toHaveCount(0);
    await expect(vis(owner.page, '[data-testid="reg-row"][data-status="active"]')).toHaveCount(1); // never exceeded
    // Roster swapped (B1): Karim in, Omar out.
    await expect(vis(owner.page, '[data-testid="enrolled-student"]').filter({ hasText: 'Karim' }).first()).toBeVisible();
    await expect(vis(owner.page, '[data-testid="enrolled-student"]').filter({ hasText: 'Omar' })).toHaveCount(0);
    await noMissing(owner.page);

    // Karim was promoted off the waitlist + billed.
    await expectNotification(student.page, 'waitlist_promoted');
    await expectNotification(student.page, 'invoice_issued');
    await student.page.goto('/en/portal/classes');
    await expect(
      vis(student.page, '[data-testid="portal-class-card"]').filter({ hasText: CLASS_NAME }).first().getByTestId('reg-status'),
    ).toHaveAttribute('data-status', 'active', { timeout: 15_000 });
    await noMissing(student.page);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});
