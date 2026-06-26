import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification, untilConsistent } from './helpers';

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

// v2.1: under full-gate saturation `goto`'s default 'load' wait stalls on slow
// resources; settle on DOM-ready (the SSR'd member cards/invoices are already in
// the markup) so each re-read samples FAST → the untilConsistent budget buys many
// attempts and catches the moment the tick's write becomes readable.
const nav = (page: Page, url: string) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

async function openFile(page: Page, name: string) {
  // ISO-DB v2: under FULL-suite load the search results / click→nav can lag well
  // past 40s; re-search + click until the member file opens (idempotent read path).
  await untilConsistent(async () => {
    await nav(page, `/en/students?search=${encodeURIComponent(name)}`);
    await vis(page, '[data-testid="student-card"]').filter({ hasText: name }).first().click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  }, { timeout: 90_000 });
}

async function runTick(page: Page) {
  await nav(page, '/en/money');
  await vis(page, '[data-testid="process-renewals-now"]').first().click();
  const toast = page.locator('[data-testid="app-toast"]').filter({ hasText: /issued/i }).first();
  // The renewal sweep runs server-side; under full load it + the toast lag.
  await expect(toast).toBeVisible({ timeout: 60_000 });
  return (await toast.textContent()) ?? '';
}

// Date-only arithmetic: anchor at UTC noon of TODAY'S DATE — adding hours to
// Date.now() rolled past midnight on afternoon runs (expected 7/13, got 7/12).
const addDays = (days: number) => {
  const t = new Date();
  const base = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toLocaleDateString('en-US', { timeZone: 'UTC' });
};

test('ML-1 · tick issues+nudges+lapses+suspends+promotes; idempotent re-run; payment extends; plan change carries new price', async ({ browser }) => {
  // v2.1: the heaviest full-suite runs push the tick's read-after-write past 90s
  // (run 28262907011), so the heavy reads run to 180s; raise the ceiling to match.
  test.setTimeout(1_080_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── First tick: everything fires in one pass ──
    await runTick(owner.page); // retry-tolerant: the issuance proof is the
    // invoice + the open-renewal card below, not the toast count

    // Open Karim's file once (resilient) + capture its URL for cheap re-reads.
    await openFile(owner.page, 'Karim');
    const karimUrl = owner.page.url();

    // ISO-DB resilience: the tick commits async, so under parallel-worker load the
    // EXPIRING card, the open-renewal, and the $55.50 plan-price invoice can each
    // lag a one-shot read. Re-read the member file until ALL are consistent — every
    // assertion is UNCHANGED, just retried (short inner timeout) until the writes
    // are visible (no weakening; we wait for consistency, we don't assert less).
    let periodBefore = '';
    await untilConsistent(async () => {
      await nav(owner.page, karimUrl);
      const expCard = vis(owner.page, '[data-testid="membership-card"][data-state="expiring"]').first();
      await expect(expCard, 'ending-today membership reads EXPIRING').toBeVisible({ timeout: 20_000 });
      await expect(expCard.getByTestId('membership-renewal-open'), 'renewal invoice open on the card').toBeVisible({ timeout: 20_000 });
      // The renewal invoice carries the PLAN price ($50 + 11% TVA = $55.50).
      await expect(
        vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
          .filter({ hasText: '$55.50' }).first(),
        'renewal invoice at the plan price',
      ).toBeVisible({ timeout: 20_000 });
      // (b) the period text is read only AFTER the card is asserted visible above,
      // and the whole block re-runs on a transient "context destroyed" nav race.
      periodBefore = (await expCard.getByTestId('membership-period').textContent())!.trim();
    }, { timeout: 180_000 });

    // Member nudge + Today renew action + portal banner (each re-read until the
    // tick's effect is visible under load).
    await expectNotification(student.page, 'renewal_due', { timeout: 60_000 });
    await untilConsistent(async () => {
      await nav(owner.page, '/en/today');
      await expect(
        vis(owner.page, '[data-testid="expiring-row"]').filter({ hasText: 'Karim' }).first().getByTestId('expiring-renew'),
        'Expiring card gains the one-tap Renew',
      ).toBeVisible({ timeout: 20_000 });
    }, { timeout: 120_000 });
    await untilConsistent(async () => {
      await nav(student.page, '/en/portal');
      await expect(
        vis(student.page, '[data-testid="portal-lifecycle-banner"]').first(),
        'portal shows the renew-at-the-desk banner',
      ).toBeVisible({ timeout: 20_000 });
    }, { timeout: 120_000 });

    // ── Idempotency: the second tick issues NOTHING new ──
    const second = await runTick(owner.page);
    expect(second, 'tick re-run is a no-op').toMatch(/0 issued/);
    expect(second).toMatch(/0 lapsed/);
    expect(second).toMatch(/0 suspended/);

    // ── Activation: pay the renewal → period extends by the plan duration ──
    await nav(owner.page, karimUrl);
    await vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
      .filter({ hasText: '$55.50' }).first().locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await vis(owner.page, '[data-testid="pay-submit"]').first().click(); // full balance prefilled
    // The payment commits async; re-read the member file until the period reflects
    // the +30d extension (replaces a fixed 1.5s wait that lost the race under load).
    await untilConsistent(async () => {
      await nav(owner.page, karimUrl);
      await expect(
        vis(owner.page, '[data-testid="membership-period"]').filter({ hasText: addDays(30) }).first(),
        'payment extended the period by the plan duration (+30d)',
      ).toBeVisible({ timeout: 20_000 });
    }, { timeout: 120_000 });
    expect(periodBefore).not.toContain(addDays(30));

    // ── Plan change (next cycle, no proration) → renew-now carries NEW price ──
    const activeCard = vis(owner.page, '[data-testid="membership-card"]')
      .filter({ has: owner.page.locator(`[data-testid="membership-period"]:has-text("${addDays(30)}")`) }).first();
    await activeCard.getByTestId('ms-change-plan-open').click();
    await owner.page.locator('[data-testid="ms-plan-chip"]').nth(1).click(); // the $130 plan
    await owner.page.getByTestId('ms-plan-submit').click();
    await expect(activeCard.getByTestId('membership-pending-plan'), 'pending next-cycle change recorded')
      .toBeVisible({ timeout: 60_000 }); // multi-step write under full load
    await activeCard.getByTestId('ms-renew-now').click();
    // The renew-now write commits async; re-read until the NEW-price invoice shows.
    // The most-saturated read (after pay + plan-change + renew-now) → longest budget.
    await untilConsistent(async () => {
      await nav(owner.page, karimUrl);
      await expect(
        vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"][data-type="membership"]')
          .filter({ hasText: '$144.30' }).first(),
        'the next renewal carries the NEW plan price (130 × 1.11 TVA)',
      ).toBeVisible({ timeout: 20_000 });
    }, { timeout: 180_000 });
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});

test('ML-1 · lapse → chase + check-in warning + reinstate; suspended seat frees → waitlist promotion; bounded freeze', async ({ browser }) => {
  // v2: post-tick reads also ride out full-suite render lag (15s→40s).
  test.setTimeout(720_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    // ── Omar lapsed (the first tick in test 1 flipped him) ──
    await openFile(owner.page, 'Omar');
    const lapsedCard = vis(owner.page, '[data-testid="membership-card"][data-state="lapsed"]').first();
    await expect(lapsedCard, 'past-grace membership reads LAPSED').toBeVisible({ timeout: 40_000 });
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"][data-status="suspended"]').filter({ hasText: 'Lifecycle Class' }).first(),
      'unpaid registration SUSPENDED',
    ).toBeVisible({ timeout: 40_000 });

    // Lina was promoted off the waitlist into the freed seat (B2 machinery).
    await openFile(owner.page, 'Lina');
    await expect(
      vis(owner.page, '[data-testid="member-reg-row"][data-status="active"]').filter({ hasText: 'Lifecycle Class' }).first(),
      'waitlisted member PROMOTED into the freed seat',
    ).toBeVisible({ timeout: 40_000 });

    // ── Chase list + check-in warning ──
    await nav(owner.page, '/en/today');
    const chaseRow = vis(owner.page, '[data-testid="chase-row"]').filter({ hasText: 'Omar' }).first();
    await expect(chaseRow, 'lapsed member lands on the chase list').toBeVisible({ timeout: 40_000 });
    await expect(chaseRow.getByTestId('chase-pay')).toBeVisible();
    await nav(owner.page, '/en/attendance');
    await expect(
      vis(owner.page, '[data-testid="checkin-warning"]').first(),
      'check-in shows the non-blocking lapsed warning',
    ).toBeVisible({ timeout: 40_000 });

    // ── Freeze 10d on Karim's renewed card → +10, tick silent, restore on early unfreeze ──
    // (Reinstate runs LAST: it re-opens Omar's renewal window, which makes the
    // next tick legitimately issue again — run 2 taught the order.)
    await openFile(owner.page, 'Karim');
    const card = vis(owner.page, '[data-testid="membership-card"][data-state="active"]').first();
    // (b) await the card render before the textContent evaluate, so the read never
    // races the file navigation (the "Execution context destroyed" class).
    await expect(card, 'active card present before reading the period').toBeVisible({ timeout: 40_000 });
    const periodBefore = (await card.getByTestId('membership-period').textContent())!.trim();
    const endBefore = periodBefore.split('→')[1].trim();
    await card.getByTestId('ms-freeze-open').click();
    await owner.page.getByTestId('ms-freeze-days').fill('10');
    await owner.page.getByTestId('ms-freeze-submit').click();
    const frozenCard = vis(owner.page, '[data-testid="membership-card"][data-state="frozen"]').first();
    await expect(frozenCard, 'membership FROZEN').toBeVisible({ timeout: 40_000 });
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
    ).toBeVisible({ timeout: 40_000 });

    // ── Bounds: an 80-day freeze fails with the policy message ──
    const card2 = vis(owner.page, '[data-testid="membership-card"][data-state="active"]').first();
    await card2.getByTestId('ms-freeze-open').click();
    await owner.page.getByTestId('ms-freeze-days').fill('80');
    await owner.page.getByTestId('ms-freeze-submit').click();
    await expect(
      owner.page.locator('[data-testid="app-toast"]').filter({ hasText: /freeze limit/i }).first(),
      '80d freeze rejected with the yearly-bounds policy message',
    ).toBeVisible({ timeout: 40_000 });

    // ── Reinstate (LAST — re-opens the renewal window by design) ──
    await openFile(owner.page, 'Omar');
    await vis(owner.page, '[data-testid="ms-reinstate"]').first().click();
    await expect(vis(owner.page, '[data-testid="membership-card"][data-state="lapsed"]'))
      .toHaveCount(0, { timeout: 40_000 });
  } finally {
    await owner.ctx.close();
  }
});
