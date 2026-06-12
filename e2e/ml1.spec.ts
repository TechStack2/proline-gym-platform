import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification } from './helpers';

/**
 * ML-1 — membership lifecycle: auto-renew → dunning → lapse → reinstate +
 * bounded freeze + next-cycle plan change, BOTH monthly products.
 *
 * Seeded fixtures: Karim's membership ENDS TODAY (FD-1 seed — the clean
 * renewal path); Omar's membership ENDED -15d (lapse path); 'Lifecycle Class'
 * capacity 1 with Omar unpaid (paid_until -15d) and LINA WAITLISTED.
 * The tick is driven via the staff "Process renewals now" wrapper.
 *
 *  1. Tick: renewal issued for Karim (ending today) with the plan price +
 *     nudge + Renew on Today's expiring row; SAME tick lapses Omar, suspends
 *     his class seat and PROMOTES Lina; portal banner; re-run issues NOTHING
 *     (idempotency, asserted on the tick summary); paying Karim's renewal
 *     EXTENDS the period (+plan duration); plan change → renew-now carries
 *     the NEW plan price.
 *  2. Omar: lapsed card + chase list + check-in warning + reinstate;
 *     freeze 10d (period +10, tick stays silent), early unfreeze (period
 *     restored), 80d attempt fails with the policy message; Lina's promoted
 *     registration is ACTIVE on her file; Omar's shows SUSPENDED.
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function openFile(page: Page, name: string) {
  await page.goto(`/en/students?search=${encodeURIComponent(name)}`);
  await vis(page, '[data-testid="student-card"]').filter({ hasText: name }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
}

async function runTick(page: Page) {
  await page.goto('/en/money');
  await vis(page, '[data-testid="process-renewals-now"]').first().click();
  const toast = page.locator('[data-testid="app-toast"]').filter({ hasText: /issued/i }).first();
  await expect(toast).toBeVisible({ timeout: 20_000 });
  return (await toast.textContent()) ?? '';
}

const addDays = (days: number) =>
  new Date(Date.now() + days * 864e5 + 12 * 3600_000).toLocaleDateString('en-US');

test('ML-1 · tick issues+nudges+lapses+suspends+promotes; idempotent re-run; payment extends; plan change carries new price', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── First tick: everything fires in one pass ──
    const first = await runTick(owner.page);
    expect(first, 'first tick issues renewals').not.toMatch(/0 issued/);

    // Karim: the ending-today card shows the open renewal.
    await openFile(owner.page, 'Karim');
    const expCard = vis(owner.page, '[data-testid="membership-card"][data-state="expiring"]').first();
    await expect(expCard, 'ending-today membership reads EXPIRING').toBeVisible({ timeout: 15_000 });
    await expect(expCard.getByTestId('membership-renewal-open'), 'renewal invoice open on the card').toBeVisible();
    const periodBefore = (await expCard.getByTestId('membership-period').textContent())!.trim();

    // The renewal invoice carries the PLAN price ($50 + 11% TVA = $55.50).
    await expect(
      vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
        .filter({ hasText: '$55.50' }).first(),
      'renewal invoice at the plan price',
    ).toBeVisible({ timeout: 15_000 });

    // Member nudge + Today renew action + portal banner.
    await expectNotification(student.page, 'renewal_due');
    await owner.page.goto('/en/today');
    await expect(
      vis(owner.page, '[data-testid="expiring-row"]').filter({ hasText: 'Karim' }).first().getByTestId('expiring-renew'),
      'Expiring card gains the one-tap Renew',
    ).toBeVisible({ timeout: 15_000 });
    await student.page.goto('/en/portal');
    await expect(
      vis(student.page, '[data-testid="portal-lifecycle-banner"]').first(),
      'portal shows the renew-at-the-desk banner',
    ).toBeVisible({ timeout: 15_000 });

    // ── Idempotency: the second tick issues NOTHING new ──
    const second = await runTick(owner.page);
    expect(second, 'tick re-run is a no-op').toMatch(/0 issued/);
    expect(second).toMatch(/0 lapsed/);
    expect(second).toMatch(/0 suspended/);

    // ── Activation: pay the renewal → period extends by the plan duration ──
    await openFile(owner.page, 'Karim');
    await vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
      .filter({ hasText: '$55.50' }).first().locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await vis(owner.page, '[data-testid="pay-submit"]').first().click(); // full balance prefilled
    await owner.page.waitForTimeout(1500);
    await openFile(owner.page, 'Karim');
    await expect(
      vis(owner.page, '[data-testid="membership-period"]').filter({ hasText: addDays(30) }).first(),
      'payment extended the period by the plan duration (+30d)',
    ).toBeVisible({ timeout: 15_000 });
    expect(periodBefore).not.toContain(addDays(30));

    // ── Plan change (next cycle, no proration) → renew-now carries NEW price ──
    const activeCard = vis(owner.page, '[data-testid="membership-card"]')
      .filter({ has: owner.page.locator(`[data-testid="membership-period"]:has-text("${addDays(30)}")`) }).first();
    await activeCard.getByTestId('ms-change-plan-open').click();
    await owner.page.locator('[data-testid="ms-plan-chip"]').nth(1).click(); // the $130 plan
    await owner.page.getByTestId('ms-plan-submit').click();
    await expect(activeCard.getByTestId('membership-pending-plan'), 'pending next-cycle change recorded')
      .toBeVisible({ timeout: 15_000 });
    await activeCard.getByTestId('ms-renew-now').click();
    await expect(
      vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
        .filter({ hasText: '$144.30' }).first(),
      'the next renewal carries the NEW plan price (130 × 1.11 TVA)',
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});

test('ML-1 · lapse → chase + check-in warning + reinstate; suspended seat frees → waitlist promotion; bounded freeze', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    // ── Omar lapsed (the first tick in test 1 flipped him) ──
    await openFile(owner.page, 'Omar');
    const lapsedCard = vis(owner.page, '[data-testid="membership-card"][data-state="lapsed"]').first();
    await expect(lapsedCard, 'past-grace membership reads LAPSED').toBeVisible({ timeout: 15_000 });
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"][data-status="suspended"]').filter({ hasText: 'Lifecycle Class' }).first(),
      'unpaid registration SUSPENDED',
    ).toBeVisible({ timeout: 15_000 });

    // Lina was promoted off the waitlist into the freed seat (B2 machinery).
    await openFile(owner.page, 'Lina');
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: 'Lifecycle Class' }).first(),
      'waitlisted member PROMOTED into the freed seat',
    ).toBeVisible({ timeout: 15_000 });

    // ── Chase list + check-in warning ──
    await owner.page.goto('/en/today');
    const chaseRow = vis(owner.page, '[data-testid="chase-row"]').filter({ hasText: 'Omar' }).first();
    await expect(chaseRow, 'lapsed member lands on the chase list').toBeVisible({ timeout: 15_000 });
    await expect(chaseRow.getByTestId('chase-pay')).toBeVisible();
    await owner.page.goto('/en/attendance');
    await expect(
      vis(owner.page, '[data-testid="checkin-warning"]').first(),
      'check-in shows the non-blocking lapsed warning',
    ).toBeVisible({ timeout: 20_000 });

    // ── Reinstate ──
    await openFile(owner.page, 'Omar');
    await vis(owner.page, '[data-testid="ms-reinstate"]').first().click();
    await expect(vis(owner.page, '[data-testid="membership-card"][data-state="lapsed"]'))
      .toHaveCount(0, { timeout: 15_000 });

    // ── Freeze 10d on Karim's renewed card → +10, tick silent, restore on early unfreeze ──
    await openFile(owner.page, 'Karim');
    const card = vis(owner.page, '[data-testid="membership-card"][data-state="active"]').first();
    const periodBefore = (await card.getByTestId('membership-period').textContent())!.trim();
    const endBefore = periodBefore.split('→')[1].trim();
    await card.getByTestId('ms-freeze-open').click();
    await owner.page.getByTestId('ms-freeze-days').fill('10');
    await owner.page.getByTestId('ms-freeze-submit').click();
    const frozenCard = vis(owner.page, '[data-testid="membership-card"][data-state="frozen"]').first();
    await expect(frozenCard, 'membership FROZEN').toBeVisible({ timeout: 15_000 });
    await expect(frozenCard.getByTestId('membership-period'), 'end date extended by the frozen days')
      .not.toContainText(endBefore);

    // Frozen members are excluded: a tick now issues nothing anywhere.
    const after = await runTick(owner.page);
    expect(after, 'tick is silent with the membership frozen').toMatch(/0 issued/);

    // Early unfreeze (same day) → the unused days come back off the end date.
    await openFile(owner.page, 'Karim');
    await vis(owner.page, '[data-testid="ms-unfreeze"]').first().click();
    await expect(
      vis(owner.page, '[data-testid="membership-period"]').filter({ hasText: endBefore }).first(),
      'early unfreeze restores the period',
    ).toBeVisible({ timeout: 15_000 });

    // ── Bounds: an 80-day freeze fails with the policy message ──
    const card2 = vis(owner.page, '[data-testid="membership-card"][data-state="active"]').first();
    await card2.getByTestId('ms-freeze-open').click();
    await owner.page.getByTestId('ms-freeze-days').fill('80');
    await owner.page.getByTestId('ms-freeze-submit').click();
    await expect(
      owner.page.locator('[data-testid="app-toast"]').filter({ hasText: /freeze limit/i }).first(),
      '80d freeze rejected with the yearly-bounds policy message',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
  }
});
