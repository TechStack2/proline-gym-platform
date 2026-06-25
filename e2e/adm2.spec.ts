import { test, expect, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, visibleShell } from './helpers';

/**
 * ADM-2 — belt-promotion repair + archived-picker sweep + avatars (Cycle 5/V1).
 *
 *  1. Sweep: a Settings-created-then-ARCHIVED discipline is absent from the
 *     belt-promotion picker, the class-wizard chips and the coach specialty
 *     chips (the operator's "archived disciplines resurface" defect).
 *  2. Belt: promote the seeded student from the Member-360 belt panel
 *     (active-only discipline chips; the target rank defaults to the NEXT rank
 *     in the ladder) → the previously-failing save round-trips via
 *     promote_student → persists across reload → renders in portal progress.
 *  3. Avatars: a fixture upload for the seeded coach renders on the coach
 *     detail, the class-wizard coach chip and the diary header (img loads);
 *     a member photo set from Member-360 renders on the guardian kid-switcher.
 */
const RUN = Date.now().toString().slice(-6);
const DISC_NAME = `BeltX ${RUN}`;
const FIXTURE = 'e2e/fixtures/avatar.png';

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

test('ADM-2 · archived discipline absent everywhere; Member-360 promotion saves; portal reflects', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Create + archive a discipline (Settings CRUD; ADM-2 also seeds its ladder) ──
    await owner.page.goto('/en/settings?tab=disciplines');
    await vis(owner.page, '[data-testid="discipline-add-en"]').fill(DISC_NAME);
    await vis(owner.page, '[data-testid="discipline-add-btn"]').click();
    const row = vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC_NAME}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId('discipline-archive-btn').click();
    await expect(vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC_NAME}"]`).first())
      .toHaveAttribute('data-active', 'false', { timeout: 15_000 });

    // ── Sweep assertions: archived discipline absent from all three pickers ──
    await owner.page.goto('/en/belts');
    const beltDiscSelect = vis(owner.page, '[data-testid="be-discipline"]').first();
    await expect(beltDiscSelect).toBeVisible({ timeout: 15_000 });
    await expect(beltDiscSelect.locator('option', { hasText: DISC_NAME })).toHaveCount(0);

    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await expect(owner.page.locator('[data-testid="wizard-discipline-chip"]').filter({ hasText: DISC_NAME })).toHaveCount(0);

    await owner.page.goto('/en/coaches/add');
    await expect(vis(owner.page, '[data-testid="coach-form"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(owner.page.locator('[data-testid="coach-specialty-chip"]').filter({ hasText: DISC_NAME })).toHaveCount(0);

    // ── Member-360 promotion (the operator's "doesn't save") ──
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const fileUrl = owner.page.url();

    await vis(owner.page, '[data-testid="promote-open"]').first().click();
    // Active-only chips: the archived discipline is absent here too.
    await expect(owner.page.locator('[data-testid="promote-discipline-chip"]').filter({ hasText: DISC_NAME })).toHaveCount(0);
    await vis(owner.page, '[data-testid="promote-discipline-chip"]').filter({ hasText: 'Muay Thai' }).first().click();
    // The NEXT rank in the ladder is preselected; capture it for the assertions.
    const picked = vis(owner.page, '[data-testid="promote-rank-pill"]').first();
    await expect(picked).toBeVisible({ timeout: 15_000 });
    const newRank = (await picked.getAttribute('data-rank'))!;
    const newRankLabel = newRank.replace(/_/g, ' ');
    await vis(owner.page, '[data-testid="promote-submit"]').first().click();

    // Persists: history row renders, and survives a hard reload.
    await expect(
      vis(owner.page, '[data-testid="member-belt-row"]').filter({ hasText: new RegExp(newRankLabel, 'i') }).first(),
      'promotion lands in the history',
    ).toBeVisible({ timeout: 15_000 });
    await owner.page.goto(fileUrl);
    await expect(
      vis(owner.page, '[data-testid="member-belt-row"]').filter({ hasText: new RegExp(newRankLabel, 'i') }).first(),
      'promotion persists across reload',
    ).toBeVisible({ timeout: 15_000 });

    // Portal progress reflects the new CURRENT rank.
    await student.page.goto('/en/portal/progress');
    await expect(vis(student.page, '[data-testid="progress-rank"]').first())
      .toHaveText(new RegExp(`^${newRankLabel}$`, 'i'), { timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});

test('ADM-2 · avatar upload renders on coach detail + wizard chip + diary; member photo on kid-switcher', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const guardian = await ctxFor(browser, 'parent'); // Rana
  try {
    // ── Coach photo: upload from the edit form (immediate upsert) ──
    await owner.page.goto('/en/coaches');
    await vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: 'Sami' }).first().click();
    await expect(owner.page).toHaveURL(/\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const coachDetailUrl = owner.page.url();
    await vis(owner.page, '[data-testid="coach-edit-btn"]').first().click();
    await expect(owner.page).toHaveURL(/\/edit/, { timeout: 15_000 });
    // The form is a PAGE (double-shell renders two copies). The file inputs are
    // CSS-hidden by design, so scope to the VISIBLE shell to drive the instance
    // the user actually sees.
    await visibleShell(owner.page).locator('[data-testid="avatar-file-input"]').first()
      .setInputFiles(FIXTURE);
    await expect(vis(owner.page, '[data-testid="avatar-upload"] [data-testid="avatar-img"]').first())
      .toBeVisible({ timeout: 20_000 });

    // Renders on the coach detail…
    await owner.page.goto(coachDetailUrl);
    const detailImg = vis(owner.page, '[data-testid="avatar-img"]').first();
    await expect(detailImg).toBeVisible({ timeout: 15_000 });
    expect(await detailImg.evaluate((el: HTMLImageElement) => el.naturalWidth), 'detail avatar loads (no 404)').toBeGreaterThan(0);

    // …the class-wizard coach chip…
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    const chipImg = owner.page.locator('[data-testid="wizard-coach-chip"]').filter({ hasText: 'Sami' }).first()
      .locator('[data-testid="avatar-img"]');
    await expect(chipImg).toBeVisible({ timeout: 15_000 });

    // …and the diary column header.
    await owner.page.goto('/en/schedule?view=day');
    const diaryImg = vis(owner.page, '[data-testid="diary-coach-header"]').filter({ hasText: 'Sami' }).first()
      .locator('[data-testid="avatar-img"]');
    await expect(diaryImg).toBeVisible({ timeout: 15_000 });

    // ── Member photo from Member-360 → guardian kid-switcher ──
    await owner.page.goto('/en/students?search=Omar');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Omar' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await visibleShell(owner.page).locator('[data-testid="avatar-file-input"]').first()
      .setInputFiles(FIXTURE);
    await expect(vis(owner.page, '[data-testid="avatar-upload"] [data-testid="avatar-img"]').first())
      .toBeVisible({ timeout: 20_000 });

    await guardian.page.goto('/en/portal');
    await expect(
      vis(guardian.page, '[data-testid="kid-chip"]').filter({ hasText: 'Omar' }).first().locator('[data-testid="avatar-img"]'),
      'kid-switcher chip shows the member photo',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await guardian.ctx.close();
  }
});
