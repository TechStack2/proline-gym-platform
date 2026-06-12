import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, gymSlug, expectNotification } from './helpers';

/**
 * PT-1 — catalog → landing → desk sale → use → refill → re-sell → expiry/extend
 * (Cycle 5/V1). Seeded by 000042: Karim carries an EXPIRED-but-active
 * '5 Sessions Pack' (4/5 left, validity ended yesterday).
 *
 *  1. Catalog + landing + sale + package-first: Settings-create the run's
 *     10-pack ($300/10/60d) → staged (absent from the anon landing) → publish
 *     toggle → anon landing PT card; desk sale to Karim (coach + 10% discount)
 *     → Member-360 package card (10/10, validity, discounted invoice
 *     $299.70 = 300×0.9×1.11 TVA) → portal card shows "10 of 10 sessions
 *     remaining" and EVERY session row is nested inside a package card.
 *  2. Use→refill→expiry: coach logs 8 deliveries (10→2 crosses the threshold)
 *     → Inbox renewals row + Today refill card + member pt_refill_due
 *     notification → one-tap re-sell (modal pre-filled) → second package +
 *     invoice; the seeded EXPIRED package blocks log-on-delivery with a clear
 *     message → staff Extend +30d un-freezes → delivery works again.
 */
const RUN = Date.now().toString().slice(-6);
const TYPE_NAME = `PT1 Pack ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function openKarimFile(page: Page): Promise<string> {
  await page.goto('/en/students?search=Karim');
  await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  return page.url().split('?')[0];
}

test('PT-1 · catalog → publish gate → desk sale → package-first cards (no flat lists)', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  const anon = await (async () => { const ctx = await browser.newContext({ locale: 'en' }); return { ctx, page: await ctx.newPage() }; })();
  try {
    // ── Settings: create the type ──
    await owner.page.goto('/en/settings?tab=ptpackages');
    await vis(owner.page, '[data-testid="ptpkg-add-en"]').fill(TYPE_NAME);
    await vis(owner.page, '[data-testid="ptpkg-add-sessions"]').fill('10');
    await vis(owner.page, '[data-testid="ptpkg-add-price"]').fill('300');
    await vis(owner.page, '[data-testid="ptpkg-add-validity"]').fill('60');
    await vis(owner.page, '[data-testid="ptpkg-add-btn"]').click();
    const row = vis(owner.page, `[data-testid="ptpkg-row"][data-name-en="${TYPE_NAME}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ── Staged: the anon landing does NOT show it ──
    await anon.page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await anon.page.waitForLoadState('networkidle').catch(() => {});
    await expect(anon.page.locator(`[data-testid="landing-pt-card"][data-name-en="${TYPE_NAME}"]`)).toHaveCount(0);

    // ── Publish → the anon landing shows it ──
    await row.getByTestId('ptpkg-landing-toggle').click();
    await expect(vis(owner.page, `[data-testid="ptpkg-row"][data-name-en="${TYPE_NAME}"]`).first()
      .getByTestId('ptpkg-landing-toggle')).toHaveAttribute('data-on', 'true', { timeout: 15_000 });
    await anon.page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await anon.page.waitForLoadState('networkidle').catch(() => {});
    await expect(
      anon.page.locator(`[data-testid="landing-pt-card"][data-name-en="${TYPE_NAME}"]`).first(),
      'published PT type renders on the anon landing',
    ).toBeVisible({ timeout: 15_000 });

    // ── Desk sale: Member-360 sell modal, coach + 10% discount ──
    await openKarimFile(owner.page);
    await vis(owner.page, '[data-testid="pt-sell-open"]').first().click();
    await owner.page.locator('[data-testid="pt-type-chip"]').filter({ hasText: TYPE_NAME }).first().click();
    await owner.page.locator('[data-testid="pt-coach-chip"]').first().click();
    await owner.page.getByTestId('pt-sell-discount-pct').fill('10');
    await owner.page.getByTestId('pt-sell-submit').click();

    const card = vis(owner.page, '[data-testid="member-pt-row"]').filter({ hasText: TYPE_NAME }).first();
    await expect(card, 'the sold package lands on the file as a card').toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute('data-status', 'active');
    await expect(card.getByTestId('pt-remaining')).toContainText('10/10');
    await expect(card.getByTestId('pt-card-invoice'), 'the card deep-links its invoice + payment state').toBeVisible();
    await expect(
      vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"]').filter({ hasText: '$299.70' }).first(),
      'discounted PT invoice: 300 × 0.9 × 1.11 TVA',
    ).toBeVisible({ timeout: 15_000 });

    // ── Portal: the same card, package-first (sessions only ever NESTED) ──
    await student.page.goto('/en/portal/pt');
    const portalCard = student.page.locator('[data-testid="pt-my-request"]').filter({ hasText: TYPE_NAME }).first();
    await expect(portalCard).toBeVisible({ timeout: 15_000 });
    await expect(portalCard.getByTestId('pt-remaining')).toContainText('10 of 10 sessions remaining');
    const allSessions = await student.page.locator('[data-testid="portal-pt-session"]').count();
    const nestedSessions = await student.page.locator('[data-testid="pt-my-request"] [data-testid="portal-pt-session"]').count();
    expect(nestedSessions, 'NO flat session list — every session row nests inside a package card').toBe(allSessions);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
    await anon.ctx.close();
  }
});

test('PT-1 · use→refill (inbox+today+nudge) → one-tap re-sell; expiry freeze → extend un-freezes', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach'); // Sami
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Coach logs 8 deliveries on the run's 10-pack (10 → 2 = the threshold) ──
    await coach.page.goto('/en/coach/pt');
    const roster = coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${TYPE_NAME}"]:visible`).first();
    await expect(roster).toBeVisible({ timeout: 15_000 });
    for (let remaining = 10; remaining > 2; remaining--) {
      await roster.getByTestId('pt-log').click();
      await expect(
        coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${TYPE_NAME}"]:visible`).first(),
      ).toHaveAttribute('data-remaining', String(remaining - 1), { timeout: 20_000 });
    }

    // ── Refill surfaces: Inbox section · Today card · member nudge ──
    await owner.page.goto('/en/inbox');
    await expect(
      vis(owner.page, '[data-testid="inbox-renewal-row"]').filter({ hasText: TYPE_NAME }).first(),
      'renewal-due row lands in the Inbox',
    ).toBeVisible({ timeout: 15_000 });
    await owner.page.goto('/en/today');
    const refillRow = vis(owner.page, '[data-testid="refill-row"]').filter({ hasText: TYPE_NAME }).first();
    await expect(refillRow, 'the PT refill Today card lists the member').toBeVisible({ timeout: 15_000 });
    await expectNotification(student.page, 'pt_refill_due');

    // ── One-tap re-sell: Today action → sell modal PRE-FILLED with the type ──
    await refillRow.getByTestId('refill-resell').click();
    await expect(owner.page).toHaveURL(/sellpt=/, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="pt-sell-modal"]').first()).toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="pt-coach-chip"]').first().click();
    await vis(owner.page, '[data-testid="pt-sell-submit"]').first().click();
    await expect(
      vis(owner.page, '[data-testid="member-pt-row"]').filter({ hasText: TYPE_NAME }),
      'the re-sell issues a SECOND package of the same type',
    ).toHaveCount(2, { timeout: 20_000 });
    await expect(
      vis(owner.page, '[data-testid="member-invoice-row"][data-status="pending"]').filter({ hasText: '$333.00' }).first(),
      're-sell invoice at full price (300 × 1.11 TVA)',
    ).toBeVisible({ timeout: 15_000 });

    // ── Expiry freeze (the seeded expired 5-pack): delivery is BLOCKED ──
    await coach.page.goto('/en/coach/pt');
    const frozen = coach.page.locator('[data-testid="pt-roster-row"][data-package-en="5 Sessions Pack"]:visible').first();
    await expect(frozen).toBeVisible({ timeout: 15_000 });
    await frozen.getByTestId('pt-log').click();
    await expect(
      coach.page.locator('[data-sonner-toast]').filter({ hasText: /expired/i }).first(),
      'expired package rejects delivery with a clear message',
    ).toBeVisible({ timeout: 15_000 });

    // ── Staff Extend +30d un-freezes (audited in the RPC) ──
    const fileUrl = await openKarimFile(owner.page);
    const expiredCard = vis(owner.page, '[data-testid="member-pt-row"][data-status="expired"]').filter({ hasText: '5 Sessions Pack' }).first();
    await expect(expiredCard, 'the expired package renders FROZEN on the file').toBeVisible({ timeout: 15_000 });
    await expiredCard.getByTestId('pt-extend-btn').click();
    await owner.page.goto(fileUrl);
    await expect(
      vis(owner.page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: '5 Sessions Pack' }).first(),
      'Extend +30d un-freezes the package',
    ).toBeVisible({ timeout: 20_000 });

    // …and delivery works again (4 → 3).
    await coach.page.goto('/en/coach/pt');
    const thawed = coach.page.locator('[data-testid="pt-roster-row"][data-package-en="5 Sessions Pack"]:visible').first();
    await thawed.getByTestId('pt-log').click();
    await expect(
      coach.page.locator('[data-testid="pt-roster-row"][data-package-en="5 Sessions Pack"]:visible').first(),
    ).toHaveAttribute('data-remaining', '3', { timeout: 20_000 });
  } finally {
    await owner.ctx.close();
    await coach.ctx.close();
    await student.ctx.close();
  }
});
