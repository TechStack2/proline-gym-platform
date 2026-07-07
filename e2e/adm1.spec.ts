import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, gymSlug, createClassViaWizard, untilConsistent } from './helpers';

/**
 * ADM-1 — catalog management (Cycle 5 / V1).
 *
 *  1. Class lifecycle + PUBLISH GATE: wizard-create (staged by default) →
 *     visible in the admin timetable but ABSENT from the anon landing →
 *     staff flip "Show on landing" → PRESENT anon-side → edit (rename) →
 *     propagates to timetable + landing → archive → gone everywhere.
 *  2. Coach lifecycle: add (localized names + discipline-chip specialty, the
 *     repaired profiles+coaches write) → appears in the wizard coach chips →
 *     deactivating the SEEDED coach warns (active class + PT) → cancel →
 *     deactivate the new coach → gone from chips.
 *  3. Disciplines SSOT: Settings-created discipline appears in the wizard
 *     chips AND the anon landing; archived → leaves the chips.
 *  4. The four real affiliation logos load (no 404).
 */
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `ADM Class ${RUN}`;
const CLASS_NAME_V2 = `ADM Class ${RUN} v2`;
const COACH_NAME = `CoachX ${RUN}`;
const DISC_NAME = `Grappling ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function anonCtx(browser: Browser) {
  const ctx = await browser.newContext({ locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function openLanding(page: Page) {
  await page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
  await page.waitForLoadState('networkidle').catch(() => {});
}
async function openClassWizard(page: Page) {
  await page.goto('/en/classes');
  await vis(page, '[data-testid="add-class-btn"]').click();
}

test('ADM-1 · class lifecycle: staged → publish → edit → archive, proven anon-side', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const anon = await anonCtx(browser);
  try {
    // Create through the wizard — show_on_landing defaults FALSE (staged).
    await owner.page.goto('/en/classes');
    await createClassViaWizard(owner.page, { nameEn: CLASS_NAME, capacity: '10', fee: '20', presetTime: '19:00' });

    // Staff timetable sees it…
    await owner.page.goto('/en/schedule');
    await expect(vis(owner.page, `[data-testid="week-chip"][data-class-en="${CLASS_NAME}"]`).first())
      .toBeVisible({ timeout: 15_000 });
    // …the anon landing does NOT (publish gate).
    await openLanding(anon.page);
    await expect(anon.page.locator('#schedule')).toBeVisible({ timeout: 15_000 });
    await expect(anon.page.locator('#schedule'), 'staged class hidden from the public landing')
      .not.toContainText(CLASS_NAME);
    // CATALOG-SCOPE-FIX: the staged class carries a monthly fee, so it must ALSO be
    // hidden from the public per-class fees section (get_landing_class_fees publish
    // gate — the second leak the schedule-only assertion didn't cover).
    await expect(anon.page.locator('#pricing')).toBeVisible({ timeout: 15_000 });
    await expect(anon.page.locator('#pricing'), 'staged priced class hidden from the public fees section')
      .not.toContainText(CLASS_NAME);

    // Flip the publish switch on the class detail.
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first().click();
    await expect(owner.page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const detailUrl = owner.page.url();
    const toggle = vis(owner.page, '[data-testid="class-publish-toggle"]').first();
    await expect(toggle).toHaveAttribute('data-on', 'false');
    await toggle.click();
    await expect(vis(owner.page, '[data-testid="class-publish-toggle"]').first())
      .toHaveAttribute('data-on', 'true', { timeout: 15_000 });

    // Now the anon landing shows it. ROOT RACE: the landing is ISR/cache-backed,
    // so the publish revalidation is eventually-consistent — re-navigate until it
    // reflects the write (a one-shot goto + in-place poll can sit on a stale page).
    await untilConsistent(async () => {
      await openLanding(anon.page);
      await expect(anon.page.locator('#schedule'), 'published class visible on the public landing')
        .toContainText(CLASS_NAME, { timeout: 5_000 });
      // CATALOG-SCOPE-FIX: once published, the priced class also surfaces in the
      // public per-class fees section (proves the gate lets published rows through).
      await expect(anon.page.locator('#pricing'), 'published priced class visible in the public fees section')
        .toContainText(CLASS_NAME, { timeout: 5_000 });
    });

    // Edit (rename) via the wizard in edit mode → propagates everywhere.
    await owner.page.goto(detailUrl);
    await vis(owner.page, '[data-testid="class-edit-btn"]').first().click();
    await expect(owner.page.getByTestId('class-wizard')).toBeVisible({ timeout: 15_000 });
    await owner.page.getByTestId('class-name-en').fill(CLASS_NAME_V2);
    await owner.page.getByTestId('wizard-next').click();
    await owner.page.getByTestId('wizard-next').click();
    await owner.page.getByTestId('wizard-next').click();
    await owner.page.getByTestId('class-submit').click();
    await expect(owner.page.getByTestId('wizard-success')).toBeVisible({ timeout: 15_000 });
    await owner.page.goto('/en/schedule');
    await expect(vis(owner.page, `[data-testid="week-chip"][data-class-en="${CLASS_NAME_V2}"]`).first())
      .toBeVisible({ timeout: 15_000 });
    await untilConsistent(async () => {
      await openLanding(anon.page);
      await expect(anon.page.locator('#schedule')).toContainText(CLASS_NAME_V2, { timeout: 5_000 });
    });

    // Archive (no active registrations → plain confirm) → gone everywhere.
    await owner.page.goto(detailUrl);
    await vis(owner.page, '[data-testid="class-archive-btn"]').first().click();
    await expect(vis(owner.page, '[data-testid="archive-confirm-box"]').first()).toBeVisible();
    await vis(owner.page, '[data-testid="class-archive-confirm"]').first().click();
    await expect(owner.page).toHaveURL(/\/en\/classes/, { timeout: 15_000 });
    await owner.page.goto('/en/schedule');
    await expect(vis(owner.page, `[data-testid="week-chip"][data-class-en="${CLASS_NAME_V2}"]`)).toHaveCount(0, { timeout: 15_000 });
    // Archived → drops off the landing (eventually-consistent revalidation).
    await untilConsistent(async () => {
      await openLanding(anon.page);
      await expect(anon.page.locator('#schedule')).not.toContainText(CLASS_NAME_V2);
    });

    // Affiliations: the four real logos respond 200 (no 404 placeholders).
    for (const f of ['lmf.jpg', 'ifma.png', 'lmmaf.png', 'mma-lebanon.jpg']) {
      const res = await anon.page.request.get(`/landing/affiliations/${f}`);
      expect(res.status(), `${f} loads`).toBe(200);
    }
    await expect(anon.page.locator('[data-testid="affiliation-slot"]')).toHaveCount(4);
  } finally {
    await owner.ctx.close();
    await anon.ctx.close();
  }
});

test('ADM-1 · coach lifecycle: repaired add → wizard chips → warn-on-assigned → deactivate', async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    // Add a coach through the REPAIRED form (profiles + coaches, chip specialty).
    // /coaches/add is a PAGE (double-shell renders it twice) — scope to :visible.
    await owner.page.goto('/en/coaches/add');
    // UX-2: the repaired form is now the shared FormWizard (identity → specialty → review).
    await vis(owner.page, '[data-testid="coach-first-en"]').fill(COACH_NAME);
    await vis(owner.page, '[data-testid="coach-last-en"]').fill('E2E');
    await vis(owner.page, '[data-testid="wizard-next"]').click();
    await vis(owner.page, '[data-testid="coach-specialty-chip"]').first().click();
    await vis(owner.page, '[data-testid="coach-bio-en"]').fill('ADM-1 e2e coach');
    await vis(owner.page, '[data-testid="wizard-next"]').click();
    await vis(owner.page, '[data-testid="wizard-submit"]').click();
    // J3 PT-GUARDS: a NEW coach now lands on their availability panel (the guided
    // next step — members can't book PT until it's set), not the roster. Assert we
    // reached the new coach's page, then open the roster to check the card.
    await expect(owner.page).toHaveURL(/\/en\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await owner.page.goto('/en/coaches');
    await expect(vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: COACH_NAME }).first())
      .toBeVisible({ timeout: 15_000 });

    // Appears in the class-wizard coach chips (SSOT read).
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await expect(owner.page.locator('[data-testid="wizard-coach-chip"]').filter({ hasText: COACH_NAME }).first())
      .toBeVisible({ timeout: 15_000 });
    await owner.page.keyboard.press('Escape').catch(() => {});
    await owner.page.goto('/en/coaches');

    // Deactivating the SEEDED coach (has the seeded class + PT) warns → cancel.
    await vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: 'Sami' }).first().click();
    await expect(owner.page).toHaveURL(/\/coaches\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await vis(owner.page, '[data-testid="coach-deactivate-btn"]').first().click();
    const warning = vis(owner.page, '[data-testid="coach-deactivate-warning"]').first();
    await expect(warning).toBeVisible();
    await expect(warning, 'assigned coach warns with counts').toContainText(/active class/i);
    await vis(owner.page, '[data-testid="coach-deactivate-cancel"]').first().click();

    // Deactivate the NEW coach (no obligations) → gone from list + wizard chips.
    await owner.page.goto('/en/coaches');
    await vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: COACH_NAME }).first().click();
    await vis(owner.page, '[data-testid="coach-deactivate-btn"]').first().click();
    await vis(owner.page, '[data-testid="coach-deactivate-confirm"]').first().click();
    await expect(owner.page).toHaveURL(/\/en\/coaches$/, { timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="coach-card"]').filter({ hasText: COACH_NAME })).toHaveCount(0, { timeout: 15_000 });
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await expect(owner.page.locator('[data-testid="wizard-coach-chip"]').filter({ hasText: COACH_NAME })).toHaveCount(0);
  } finally {
    await owner.ctx.close();
  }
});

test('ADM-1 · disciplines SSOT: settings-created → wizard chips + anon landing; archive → gone', async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await ctxFor(browser, 'owner');
  const anon = await anonCtx(browser);
  try {
    // Create a discipline in Settings (the new CRUD).
    await owner.page.goto('/en/settings?tab=disciplines');
    await vis(owner.page, '[data-testid="discipline-add-en"]').fill(DISC_NAME);
    await vis(owner.page, '[data-testid="discipline-add-btn"]').click();
    await expect(
      vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC_NAME}"]`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // It appears in the class-wizard discipline chips… ROOT RACE (the named adm1
    // flake): the SSOT read after the Settings write is eventually-consistent;
    // re-open the wizard until the new chip surfaces.
    await untilConsistent(async () => {
      await openClassWizard(owner.page);
      await expect(owner.page.locator('[data-testid="wizard-discipline-chip"]').filter({ hasText: DISC_NAME }).first())
        .toBeVisible({ timeout: 5_000 });
    });

    // …and on the anon landing Disciplines section (000035 anon read) — same ISR
    // cache lag → re-navigate until it reflects the new discipline.
    await untilConsistent(async () => {
      await openLanding(anon.page);
      await expect(anon.page.locator('#disciplines'), 'new discipline live on the public landing')
        .toContainText(DISC_NAME, { timeout: 5_000 });
    });

    // Archive it → leaves the wizard chips.
    await owner.page.goto('/en/settings?tab=disciplines');
    await vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC_NAME}"]`).first()
      .getByTestId('discipline-archive-btn').click();
    await expect(
      vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC_NAME}"]`).first(),
    ).toHaveAttribute('data-active', 'false', { timeout: 15_000 });
    await untilConsistent(async () => {
      await openClassWizard(owner.page);
      // chips loaded (seeded disciplines present) → guards against a false 0 on
      // an unpopulated wizard; THEN the archived discipline must be gone.
      await expect(owner.page.locator('[data-testid="wizard-discipline-chip"]').first()).toBeVisible({ timeout: 5_000 });
      await expect(owner.page.locator('[data-testid="wizard-discipline-chip"]').filter({ hasText: DISC_NAME })).toHaveCount(0);
    });
  } finally {
    await owner.ctx.close();
    await anon.ctx.close();
  }
});
