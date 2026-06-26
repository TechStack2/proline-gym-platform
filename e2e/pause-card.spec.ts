import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, runId } from './helpers';

/**
 * PAUSE-CARD — the Today page surfaces currently-paused (frozen) memberships with
 * a resume date + days held + one-tap Resume. The freeze infra already ships
 * (000047: freeze/unfreeze RPCs, calculated value-hold); this card is the only
 * new surface. Frontend-only — no schema/RPC change.
 *
 * Self-sufficient: creates its OWN member with a membership (so it never touches
 * the seeded Karim that ml1 freezes), freezes it, asserts it on Today's Paused
 * card (/en + /ar), then one-tap Resume removes it.
 */
const RUN = runId().replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6);
const MEMBER = `Pause Member ${RUN}`;

async function ownerCtx(browser: Browser, locale = 'en') {
  const ctx = await browser.newContext({ storageState: ROLES.owner.storage, locale });
  return { ctx, page: await ctx.newPage() };
}

test('PAUSE-CARD · frozen member surfaces on Today + one-tap Resume (en + /ar)', async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await ownerCtx(browser);
  try {
    // ── 1. Create a dedicated member WITH a membership (wizard plan step) ──
    await owner.page.goto('/en/students/add');
    const w = (tid: string) => owner.page.locator(`[data-testid="${tid}"]:visible`).first();
    await w('sw-name-en').fill(MEMBER);
    await w('sw-phone').fill(`+96176${RUN}`);
    await w('wizard-next').click(); // identity → (adult: no guardian) → plan
    // Plan step: pick the first available plan → the wizard inserts an active membership.
    await expect(w('sw-plan-chip'), 'a plan is offered in the wizard').toBeVisible({ timeout: 15_000 });
    await w('sw-plan-chip').click();
    await w('wizard-next').click(); // → review
    await expect(w('sw-review'), 'wizard reached review').toContainText(MEMBER);
    await w('wizard-submit').click();
    await expect(owner.page, 'wizard lands on the new member file').toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const memberUrl = owner.page.url();

    // ── 2. Freeze the membership (the existing member-360 freeze flow) ──
    const card = vis(owner.page, '[data-testid="membership-card"]').first();
    await expect(card, 'the new member has an active membership card').toBeVisible({ timeout: 15_000 });
    await card.getByTestId('ms-freeze-open').click();
    await owner.page.getByTestId('ms-freeze-days').fill('14');
    await owner.page.getByTestId('ms-freeze-submit').click();
    await expect(
      vis(owner.page, '[data-testid="membership-card"][data-state="frozen"]').first(),
      'membership is now FROZEN/paused',
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Today's Paused card lists the member + resume date + days held ──
    await owner.page.goto('/en/today');
    const pausedCard = vis(owner.page, '[data-testid="card-paused"]').first();
    await expect(pausedCard, 'the Paused card renders on Today').toBeVisible({ timeout: 15_000 });
    const row = vis(owner.page, '[data-testid="paused-row"]').filter({ hasText: MEMBER }).first();
    await expect(row, 'the paused member appears on the Paused card').toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId('paused-resumes'), 'shows the resume date').toBeVisible();
    await expect(row.getByTestId('paused-days'), 'shows days held').toContainText('14');

    // ── 4. /ar renders the Paused card localized (RTL, no missing keys) ──
    const ar = await ownerCtx(browser, 'ar');
    try {
      await ar.page.goto('/ar/today');
      await expect(vis(ar.page, '[data-testid="card-paused"]').first(), 'Paused card renders under /ar').toBeVisible({ timeout: 15_000 });
      await expect(
        vis(ar.page, '[data-testid="paused-row"]').filter({ hasText: MEMBER }).first(),
        'the paused member appears on the /ar Paused card',
      ).toBeVisible({ timeout: 15_000 });
      await expect(ar.page.locator('body'), '/ar has no missing i18n keys on Today').not.toContainText('MISSING_MESSAGE');
    } finally {
      await ar.ctx.close();
    }

    // ── 5. One-tap Resume → the member leaves the card (reuses unfreeze_membership) ──
    await row.getByTestId('paused-resume').click();
    await expect(
      vis(owner.page, '[data-testid="paused-row"]').filter({ hasText: MEMBER }),
      'after Resume the member is no longer on the Paused card',
    ).toHaveCount(0, { timeout: 15_000 });

    // …and the membership is active again on the member file.
    await owner.page.goto(memberUrl);
    await expect(
      vis(owner.page, '[data-testid="membership-card"][data-state="frozen"]'),
      'membership is no longer frozen after Resume',
    ).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await owner.ctx.close();
  }
});
