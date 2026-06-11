import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, visibleShell, expectNotification } from './helpers';

/**
 * IA-2 — Member-360 + unified Money (Cycle 5 / V1).
 *
 * Drives REAL flows in the ephemeral gym (B2 registration approve → invoice;
 * 22R PT request → inbox approve → package; D1 record payment), then asserts
 * the member file answers the gym's three daily questions from live data:
 * "registered where?" · "PT sessions left?" · "paid?" — plus the Money ledger
 * (Overview tally + Invoices tab + member deep-link), the Prospects re-home,
 * and the portal self-view card.
 */
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `IA2 Class ${RUN}`;
const PT_PACKAGE = '10 Sessions Pack';

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

test('IA-2 · member file answers paid?/PT-left?/registered-where? from live data + Money + portal self-view', async ({ browser }) => {
  test.setTimeout(280_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Drive state 1: class w/ fee → walk-in Karim → approve → active+invoice (B2) ──
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await owner.page.getByTestId('class-name-en').fill(CLASS_NAME);
    await owner.page.getByTestId('class-discipline').selectOption({ index: 1 });
    await owner.page.getByTestId('class-coach-select').selectOption({ index: 1 });
    await owner.page.getByTestId('class-capacity').fill('5');
    await owner.page.getByTestId('class-monthly-fee').fill('25');
    await owner.page.getByTestId('class-submit').click();
    await vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first().click();
    await expect(owner.page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const karimVal = await owner.page.locator('[data-testid="walkin-student"] option', { hasText: 'Karim' }).first().getAttribute('value');
    await vis(owner.page, '[data-testid="walkin-student"]').selectOption(karimVal!);
    await vis(owner.page, '[data-testid="walkin-register-btn"]').click();
    const req = vis(owner.page, '[data-testid="reg-row"][data-status="requested"]').filter({ hasText: 'Karim' }).first();
    await expect(req).toBeVisible({ timeout: 15_000 });
    await req.getByTestId('approve-btn').click();
    await expect(vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Karim' }).first())
      .toBeVisible({ timeout: 15_000 });

    // ── Drive state 2: Karim requests a PT package → owner approves from /inbox (22R) ──
    await student.page.goto('/en/portal/pt');
    const pkgCard = student.page.locator(`[data-testid="pt-package-card"][data-package-name="${PT_PACKAGE}"]`);
    await expect(pkgCard.first()).toBeVisible({ timeout: 15_000 });
    await pkgCard.first().getByRole('button', { name: /request this package/i }).click();
    await pkgCard.first().getByRole('button', { name: /send request/i }).click();
    await expectNotification(owner.page, 'pt_requested');
    await owner.page.goto('/en/inbox');
    const ptRow = vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE }).filter({ hasText: 'Karim' }).first();
    await expect(ptRow).toBeVisible({ timeout: 15_000 });
    await ptRow.getByTestId('inbox-pt-approve').click();
    await expect(
      vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE }),
      'approved PT request leaves the inbox',
    ).toHaveCount(0, { timeout: 15_000 });

    // ── Member-360: the three questions, from live data ──
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const memberUrl = owner.page.url();
    await expect(vis(owner.page, '[data-testid="member-name"]').first()).toContainText('Karim');

    // Q1 registered-where? — the active registration row names the class + fee.
    const regRow = vis(owner.page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first();
    await expect(regRow, 'registered-where? answered').toBeVisible();
    await expect(regRow).toContainText('$25');

    // Q2 PT-left? — the fresh package shows remaining/total = 10/10.
    const ptPanelRow = vis(owner.page, '[data-testid="member-pt-row"]').filter({ hasText: PT_PACKAGE }).first();
    await expect(ptPanelRow, 'PT-left? answered').toBeVisible();
    await expect(ptPanelRow.getByTestId('pt-remaining')).toContainText('10/10');

    // Q3 paid? — invoices render with status chips; the new ones are pending.
    await expect(vis(owner.page, '[data-testid="member-invoice-row"]').first()).toBeVisible();
    const pendingCount = await vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"]').count();
    expect(pendingCount, 'at least the two new invoices are pending').toBeGreaterThanOrEqual(2);
    // All six panels render; no i18n gaps.
    for (const p of ['panel-membership', 'panel-registrations', 'panel-pt', 'panel-billing', 'panel-attendance', 'panel-belts']) {
      await expect(vis(owner.page, `[data-testid="${p}"]`).first()).toBeVisible();
    }
    await noMissing(owner.page);

    // ── Record a payment via the existing D1 flow (invoice deep-link from the file) ──
    await vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"]').first()
      .locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await vis(owner.page, '[data-testid="pay-submit"]').click(); // amount pre-filled to the full balance
    await expect(vis(owner.page, '[data-testid="receipt"]')).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="receipt-status"]')).toHaveText(/Paid/i);

    // Back on the file: paid chip + the payment row (paid? now answered "yes").
    await owner.page.goto(memberUrl);
    await expect(vis(owner.page, '[data-testid="member-invoice-row"][data-status="paid"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="member-payment-row"]').first()).toBeVisible();

    // ── Money: Overview tally reflects the payment; Invoices tab deep-links back ──
    await owner.page.goto('/en/money');
    await expect(vis(owner.page, '[data-testid="money-tally"]').first()).toContainText('$', { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="money-outstanding"]').first()).toBeVisible();
    await vis(owner.page, '[data-testid="money-tab-invoices"]').first().click();
    await expect(vis(owner.page, '[data-testid="invoice-row"]').first()).toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="invoice-member-link"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="member-360"]').first()).toBeVisible();

    // Redirects: the old index routes land inside Money tabs.
    await owner.page.goto('/en/payments');
    await expect(owner.page).toHaveURL(/\/money\?.*tab=payments/, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="payments-history"]').first()).toBeVisible();
    await owner.page.goto('/en/invoices');
    await expect(owner.page).toHaveURL(/\/money\?.*tab=invoices/, { timeout: 15_000 });

    // ── Prospects re-home: tab renders the pipeline; /leads redirects ──
    await owner.page.goto('/en/students?tab=prospects');
    await expect(vis(owner.page, '[data-testid="leads-pipeline"]').first()).toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
    await owner.page.goto('/en/leads');
    await expect(owner.page).toHaveURL(/\/students\?.*tab=prospects/, { timeout: 15_000 });

    // ── Portal self-view: the member answers their own questions ──
    await expectNotification(student.page, 'pt_approved');
    await student.page.goto('/en/portal');
    const selfView = vis(student.page, '[data-testid="self-view"]').first();
    await expect(selfView).toBeVisible({ timeout: 15_000 });
    await expect(selfView.getByTestId('self-membership')).toBeVisible();
    await expect(selfView.getByTestId('self-pt-remaining')).toContainText(/\d+\/\d+/); // ≥ the fresh 10-pack
    await expect(selfView.getByTestId('self-next-class')).not.toHaveText('—'); // seeded class runs every day
    await noMissing(student.page);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});
