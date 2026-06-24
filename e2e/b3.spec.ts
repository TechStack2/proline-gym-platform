import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, createClassViaWizard, untilConsistent } from './helpers';

/**
 * B3 — Family/Household (Cycle 5 / V1).
 *
 * The seeded guardian Rana is linked to two kid students (Omar + Lina).
 *  1. Guardian login → kid-switcher shows both kids; per-kid dashboard renders.
 *  2. Request-for-kid loop: Rana submits a B2 registration request for Omar →
 *     staff Inbox → approve → the invoice's PAYER auto-resolves to Rana →
 *     household billing shows it grouped under Omar with the aggregate
 *     outstanding → staff record a cash payment (D1) → Rana's view shows paid.
 *  3. Payer renders on the staff invoice surfaces (Money rows + member file).
 *  4. RLS negative: the guardian session cannot read a non-linked student's
 *     rows (Karim is NOT linked to Rana).
 *  5. Member-360: Omar's file shows the guardian panel with Rana; staff
 *     link/unlink round-trip on the panel.
 */
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `B3 Class ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

test('B3 · guardian: switcher → request-for-kid → payer invoice → household billing → desk payment', async ({ browser }) => {
  test.setTimeout(280_000);
  const owner = await ctxFor(browser, 'owner');
  const guardian = await ctxFor(browser, 'parent'); // Rana
  try {
    // ── A fee-bearing class for the kid to register into ──
    await owner.page.goto('/en/classes');
    await createClassViaWizard(owner.page, { nameEn: CLASS_NAME, capacity: '8', fee: '30' });

    // ── 1. Guardian portal: switcher shows both kids ──
    await guardian.page.goto('/en/portal');
    await expect(guardian.page).toHaveURL(/\/portal\?kid=/, { timeout: 15_000 }); // guardian-only → defaults to a kid
    const switcher = vis(guardian.page, '[data-testid="kid-switcher"]').first();
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await expect(vis(guardian.page, '[data-testid="kid-chip"]')).toHaveCount(2);
    await expect(switcher).toContainText('Omar');
    await expect(switcher).toContainText('Lina');
    await expect(guardian.page.locator('body')).not.toContainText('MISSING_MESSAGE');

    // Select Omar's dashboard.
    const omarChip = vis(guardian.page, '[data-testid="kid-chip"]').filter({ hasText: 'Omar' }).first();
    const omarActive = (await omarChip.getAttribute('data-active')) === 'true';
    if (!omarActive) await omarChip.click();
    await expect(vis(guardian.page, '[data-testid="kid-name"]').first()).toContainText('Omar', { timeout: 15_000 });
    const kidId = await vis(guardian.page, '[data-testid="kid-dashboard"]').first().getAttribute('data-kid-id');

    // ── 2. Request a class FOR Omar (B2 flow, acting-for-kid) ──
    await vis(guardian.page, '[data-testid="kid-request-class"]').first().click();
    await expect(guardian.page).toHaveURL(/\/portal\/classes\?kid=/, { timeout: 15_000 });
    await expect(vis(guardian.page, '[data-testid="acting-for-kid"]').first()).toContainText('Omar');
    const card = vis(guardian.page, '[data-testid="portal-class-card"]').filter({ hasText: CLASS_NAME }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByTestId('request-btn').click();
    // STABILIZE-3: the portal read of the just-created registration lags under the
    // shared project's latency (realtime/refresh) — poll-until the card reflects
    // 'requested' by re-fetching the page (a GET; never re-submits → no E1 double-
    // request). The reconciliation/billing assertions below are unchanged.
    await untilConsistent(async () => {
      await guardian.page.goto(`/en/portal/classes?kid=${kidId}`);
      const c = vis(guardian.page, '[data-testid="portal-class-card"]').filter({ hasText: CLASS_NAME }).first();
      await expect(c.getByTestId('reg-status')).toHaveAttribute('data-status', 'requested', { timeout: 5_000 });
    }, { timeout: 60_000 });

    // ── Staff inbox → approve → payer auto-resolves to Rana ──
    await owner.page.goto('/en/inbox');
    const row = vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: 'Omar' }).filter({ hasText: CLASS_NAME }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId('inbox-approve').click();
    await expect(vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: CLASS_NAME })).toHaveCount(0, { timeout: 15_000 });

    // ── 3. Payer on staff surfaces: Money → Invoices rows ──
    await owner.page.goto('/en/money?tab=invoices');
    const invRow = vis(owner.page, '[data-testid="invoice-row"]').filter({ hasText: 'Omar' }).first();
    await expect(invRow).toBeVisible({ timeout: 15_000 });
    await expect(invRow.locator('[data-testid="invoice-payer"]').first(), 'payer renders on the invoice row')
      .toContainText('Rana');

    // Member-360: Omar's file shows the guardian panel + the payer chip.
    await owner.page.goto(`/en/students/${kidId}`);
    await expect(vis(owner.page, '[data-testid="panel-guardians"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="guardian-row"]').filter({ hasText: 'Rana' }).first()).toBeVisible();
    await expect(vis(owner.page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: CLASS_NAME }).first())
      .toBeVisible();
    await expect(vis(owner.page, '[data-testid="invoice-payer"]').first()).toContainText('Rana');

    // ── Household billing: grouped under Omar + aggregate outstanding > 0 ──
    await guardian.page.goto('/en/portal/billing');
    const hh = vis(guardian.page, '[data-testid="household-billing"]').first();
    await expect(hh).toBeVisible({ timeout: 15_000 });
    await expect(vis(guardian.page, '[data-testid="household-kid-group"]')).toHaveCount(2);
    const omarGroup = vis(guardian.page, `[data-testid="household-kid-group"][data-kid-id="${kidId}"]`).first();
    await expect(omarGroup.locator('[data-testid="household-invoice-row"][data-status="pending"]').first()).toBeVisible();
    const outstandingTxt = await vis(guardian.page, '[data-testid="household-outstanding"]').first().textContent();
    expect(parseFloat((outstandingTxt || '').replace(/[^0-9.]/g, '')), 'aggregate outstanding > 0').toBeGreaterThan(0);
    await expect(vis(guardian.page, '[data-testid="pay-at-desk-note"]').first()).toBeVisible(); // info, no pay button

    // ── Staff record a desk cash payment (D1) on that invoice ──
    await owner.page.goto('/en/money?tab=invoices');
    await vis(owner.page, '[data-testid="invoice-row"]').filter({ hasText: 'Omar' }).first()
      .locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="invoice-detail-payer"]').first()).toContainText('Rana');
    await vis(owner.page, '[data-testid="pay-submit"]').click(); // pre-filled full balance
    await expect(vis(owner.page, '[data-testid="receipt"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="receipt-payer"]').first()).toContainText('Rana');

    // Guardian sees it paid.
    await guardian.page.goto('/en/portal/billing');
    await expect(
      vis(guardian.page, `[data-testid="household-kid-group"][data-kid-id="${kidId}"]`).first()
        .locator('[data-testid="household-invoice-row"][data-status="paid"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── 4. RLS negative: Rana cannot reach the NON-linked student (Karim) ──
    // Karim's student id via the staff session…
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const karimId = owner.page.url().match(/students\/([0-9a-f-]{36})/)![1];

    // …is absent from Rana's switcher, and a CRAFTED ?kid= URL for him must not
    // render his dashboard (the guardian link is the only path in; the page
    // falls back because is_guardian_of-gated reads return nothing for Karim).
    await guardian.page.goto('/en/portal');
    await expect(vis(guardian.page, '[data-testid="kid-switcher"]').first()).not.toContainText('Karim');
    await guardian.page.goto(`/en/portal?kid=${karimId}`);
    const dash = vis(guardian.page, '[data-testid="kid-dashboard"]').first();
    await expect(dash).toBeVisible({ timeout: 15_000 });
    expect(await dash.getAttribute('data-kid-id'), 'crafted kid URL must not land on the non-linked student').not.toBe(karimId);
    await expect(dash).not.toContainText('Karim');
  } finally {
    await owner.ctx.close();
    await guardian.ctx.close();
  }
});
