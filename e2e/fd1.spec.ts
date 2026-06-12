import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, createClassViaWizard } from './helpers';

/**
 * FD-1 — Front-Desk Cockpit (Cycle 5/V1): Today 2.0 ActionCards · Member-360
 * member-contextual modals · workable lists.
 *
 * Seeded by 000040 in EVERY run gym: Karim has an active membership ENDING
 * TODAY (Expiring card) and an open $45 invoice DUE TODAY (Money card, owing
 * chip, payment-modal pre-selection).
 *
 *  1. Today: Expiring lists Karim → drill lands on his file; Money lists the
 *     due-today invoice; the Inbox card collapses to "✓ none" after the queue
 *     is drained on /inbox (staff actions on the real surface — fd1 runs LAST).
 *     Lists: phone search finds Karim; owing chip keeps Karim, drops Lina;
 *     prospects stage chips render counts.
 *  2. Member-360: register-to-class modal (fresh wizard class, 20% discount) →
 *     active registration + a new open invoice on the file; record-payment
 *     modal pre-selects the seeded due-today invoice → payment lands on the
 *     file, the Money card loses the due row, and the day's tally MOVES.
 */
const RUN = Date.now().toString().slice(-6);

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

/** Parse the cash-USD figure out of the Money card's collected tally. */
async function cashUsd(page: Page): Promise<number> {
  await page.goto('/en/today');
  const tally = vis(page, '[data-testid="today-tally"]').first();
  await expect(tally).toBeVisible({ timeout: 15_000 });
  const text = (await tally.textContent()) ?? '';
  const m = text.match(/Cash \(USD\): \$([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

test('FD-1 · Today cards actionable (expiring/money/inbox-collapse) + lists workable', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    // ── Today: the seeded fixtures surface on the cards ──
    await owner.page.goto('/en/today');
    await expect(
      vis(owner.page, '[data-testid="expiring-row"]').filter({ hasText: 'Karim' }).first(),
      'Expiring card lists the seeded ending-today membership',
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      vis(owner.page, '[data-testid="money-due-row"]').filter({ hasText: 'Karim' }).first(),
      'Money card lists the seeded due-today invoice',
    ).toBeVisible({ timeout: 15_000 });

    // ── Collapse: drain the approval queue on /inbox (reject leftovers), then
    //    the Inbox card must collapse to the single ✓ line. fd1 runs last, so
    //    no later spec depends on pending requests. ──
    await owner.page.goto('/en/inbox');
    for (let i = 0; i < 12; i++) {
      const decline = owner.page.locator(
        '[data-testid="inbox-decline"]:visible, [data-testid="inbox-pt-decline"]:visible',
      ).first();
      if (!(await decline.isVisible().catch(() => false))) break;
      await decline.click();
      await owner.page.waitForTimeout(1200);
    }
    await owner.page.goto('/en/today');
    await expect(
      vis(owner.page, '[data-testid="card-empty-inbox"]').first(),
      'Inbox card collapses to the ✓ none line when the queue is empty',
    ).toBeVisible({ timeout: 15_000 });

    // ── Expiring drill-down lands on the member file ──
    await vis(owner.page, '[data-testid="expiring-row"]').filter({ hasText: 'Karim' }).first()
      .locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // ── Members list: server-side PHONE search ──
    await owner.page.goto('/en/students?search=70000001');
    await expect(
      vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first(),
      'phone search finds the member',
    ).toBeVisible({ timeout: 15_000 });

    // ── Owing chip: keeps Karim (open seeded invoice), drops Lina (no invoices) ──
    await owner.page.goto('/en/students');
    await expect(vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Lina' }).first())
      .toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="chip-owing"]').first().click();
    await expect(vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first())
      .toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Lina' }))
      .toHaveCount(0);

    // ── Prospects: stage chips with counts (23R statuses) ──
    await owner.page.goto('/en/students?tab=prospects');
    for (const k of ['all', 'new', 'contacted', 'trial_scheduled', 'converted']) {
      const chip = vis(owner.page, `[data-testid="prospect-chip-${k}"]`).first();
      await expect(chip).toBeVisible({ timeout: 15_000 });
      expect(Number(await chip.getAttribute('data-count'))).toBeGreaterThanOrEqual(0);
    }
  } finally {
    await owner.ctx.close();
  }
});

test('FD-1 · Member-360 modals: register-to-class round-trip + pre-selected payment moves the tally', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  // Retry-unique: a retry must not collide with attempt 1's open registration.
  const CLASS_NAME = `FD Class ${RUN}r${testInfo.retry}`;
  const owner = await ctxFor(browser, 'owner');
  try {
    const cashBefore = await cashUsd(owner.page);

    // Fresh class so the registration guard (one open registration per class)
    // can't collide with earlier specs' work on the seeded class.
    await owner.page.goto('/en/classes');
    await createClassViaWizard(owner.page, { nameEn: CLASS_NAME, capacity: '10', fee: '50', presetTime: '20:00' });

    // ── Open Karim's file ──
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const fileUrl = owner.page.url();

    // ── Register-to-class modal: pick the fresh class, 20% discount, approve ──
    await vis(owner.page, '[data-testid="m360-register-open"]').first().click();
    await owner.page.locator('[data-testid="m360-class-option"]').filter({ hasText: CLASS_NAME }).first().click();
    await owner.page.getByTestId('m360-discount').fill('20');
    await owner.page.getByTestId('m360-register-submit').click();
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first(),
      'staff-direct registration lands ACTIVE on the file',
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"]').filter({ hasText: CLASS_NAME }).first(),
    ).toContainText('−20%');
    await owner.page.goto(fileUrl); // hard reload — server truth, not optimistic UI
    // The approval issued the discounted invoice: $50 × 0.8 × 1.11 TVA = $44.40.
    // (The billing panel windows to the 10 newest rows, so COUNTS are
    // non-monotonic by fd1 time — assert the artifact, not a count.)
    await expect(
      vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="class_registration"]')
        .filter({ hasText: '$44.40' }).first(),
      'the approval issued the discounted class invoice on the file',
    ).toBeVisible({ timeout: 15_000 });

    // ── Record-payment modal: the seeded due-today invoice is PRE-selected
    //    (oldest due date first); amount defaults to its full balance. ──
    await vis(owner.page, '[data-testid="m360-pay-open"]').first().click();
    const amountField = owner.page.getByTestId('m360-pay-amount');
    await expect(amountField).toBeVisible({ timeout: 15_000 });
    const prefilled = parseFloat(await amountField.inputValue());
    expect(prefilled, 'amount pre-filled with the selected invoice balance').toBeGreaterThan(0);
    await owner.page.getByTestId('m360-pay-submit').click();
    await expect(
      vis(owner.page, '[data-testid="member-payment-row"]').filter({ hasText: `$${prefilled.toFixed(2)}` }).first(),
      'the recorded payment lands on the file (windowed list — assert the artifact)',
    ).toBeVisible({ timeout: 20_000 });
    await owner.page.goto(fileUrl);
    await expect(
      vis(owner.page, '[data-testid="member-payment-row"]').filter({ hasText: `$${prefilled.toFixed(2)}` }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── Money card: the due-today row is settled away and the tally MOVED ──
    const cashAfter = await cashUsd(owner.page);
    expect(cashAfter, 'collected-today tally moved by the recorded payment').toBeGreaterThanOrEqual(cashBefore + prefilled - 0.01);
    await expect(vis(owner.page, '[data-testid="money-due-row"]').filter({ hasText: 'Karim' }))
      .toHaveCount(0);
  } finally {
    await owner.ctx.close();
  }
});
