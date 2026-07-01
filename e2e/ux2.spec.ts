import { test, expect, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';
import { vis, runId, expectNotification } from './helpers';

/**
 * UX-2 — uniform entry (FormWizard) + trials loop-closure + settings completion.
 *
 *  1. Mobile nav: Settings reachable from the PWA tab bar's More sheet at a
 *     phone viewport (the operator's "Settings missing" was a stale prod SW
 *     serving a pre-IA-1 shell — nav-config itself was correct; this pins it).
 *     Student wizard with the guardian step (minor → search-by-phone → create
 *     new guardian) → lands on the member with the guardian linked; lead
 *     wizard → Prospects with the derived next-action; plans CRUD wizard →
 *     the new plan reaches ML-1's plan-change picker; new discipline → ladder
 *     editor (archive/reorder/rename) → promote a student to the ladder's
 *     first ACTIVE rank (archived rank must NOT be offered).
 *  2. Trials round-trip BOTH outcomes: staff schedule (today) → coach
 *     notified → coach's day surface shows it → coach marks Showed(+note+
 *     interested) / No-show → lead stage flips (trial_completed / contacted)
 *     + staff notified (trial_outcome) + Prospects reflects it.
 */
const RUN = runId().replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6);
const COACH_EN = 'Sami'; // run-gym coach login (seed_e2e_gym)

async function ctxFor(browser: Browser, role: keyof typeof ROLES, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({
    storageState: ROLES[role].storage,
    locale: 'en',
    ...(viewport ? { viewport } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

const today = () => new Date().toISOString().slice(0, 10);

async function addLeadViaWizard(page: import('@playwright/test').Page, first: string, last: string, phone: string) {
  await page.goto('/en/leads');
  await page.locator('[data-testid="add-lead-button"]:visible').first().click();
  const modal = page.locator('[data-testid="add-lead-modal"]:visible');
  await expect(modal).toBeVisible();
  await modal.getByTestId('lead-first-name').fill(first);
  await modal.getByTestId('lead-last-name').fill(last);
  await modal.getByTestId('lead-phone').fill(phone);
  await modal.getByTestId('wizard-next').click();
  await modal.locator('[data-testid="lead-source-chip"][data-value="walk_in"]').click();
  await modal.getByTestId('wizard-next').click();
  await expect(modal.getByTestId('lead-review')).toContainText(first);
  await modal.getByTestId('wizard-submit').click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

test('UX-2 · mobile Settings nav + wizard convention (student w/ guardian, lead) + plans→ML-1 picker + ladder editor→promotion', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);

  // ── Settings visible in the PWA/mobile nav (viewport assert) ──
  const phone = await ctxFor(browser, 'owner', { width: 390, height: 844 });
  try {
    await phone.page.goto('/en/today');
    await phone.page.locator('[aria-controls="tabpanel-more"]:visible').first().click();
    await expect(
      phone.page.locator('a[href="/en/settings"]:visible').first(),
      'Settings must be reachable from the mobile More sheet (owner)',
    ).toBeVisible({ timeout: 15_000 });
    await shot(phone.page, testInfo, 'ux2-1-mobile-settings-nav');
  } finally {
    await phone.ctx.close();
  }

  const owner = await ctxFor(browser, 'owner');
  try {
    // ── Student wizard: minor → guardian step (B3 search-by-phone-first) ──
    const KID = `UX2 Kid ${RUN}`;
    const GUARDIAN = `UX2 Guardian ${RUN}`;
    await owner.page.goto('/en/students/add');
    const w = (tid: string) => owner.page.locator(`[data-testid="${tid}"]:visible`).first();
    // INTAKE-FOCUS guard: type CHAR-BY-CHAR. The field wrapper (F) used to be defined
    // inside the wizard's render body, so every keystroke gave it a new type identity,
    // React remounted the <Input>, and the cursor dropped out (only the last char
    // survived). pressSequentially exercises exactly that; toHaveValue(full string)
    // proves the module-scope hoist retains focus. Covers an LTR + an RTL field.
    const KID_AR = 'كريم الأمين';
    await w('sw-name-en').pressSequentially(KID, { delay: 25 });
    await expect(w('sw-name-en'), 'name-en retains focus typing char-by-char').toHaveValue(KID);
    await w('sw-name-ar').pressSequentially(KID_AR, { delay: 25 });
    await expect(w('sw-name-ar'), 'RTL name-ar retains focus typing char-by-char').toHaveValue(KID_AR);
    await w('sw-phone').fill(`+96176${RUN}`);
    await w('sw-dob').fill('2015-05-10'); // minor → guardian step appears
    await w('wizard-next').click();
    await expect(w('wizard-step-guardian')).toBeVisible();
    await w('sw-guardian-phone').fill(`+96177${RUN}`);
    await w('sw-guardian-search').click();
    await w('sw-guardian-name').fill(GUARDIAN); // no match → create-new path
    await w('wizard-next').click(); // → plan (skip)
    await w('wizard-next').click(); // → review
    await expect(w('sw-review')).toContainText(KID);
    await w('wizard-submit').click();
    await expect(owner.page, 'wizard lands on the new member').toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(
      vis(owner.page, '[data-testid="guardian-row"]').filter({ hasText: GUARDIAN }).first(),
      'guardian created+linked by the wizard',
    ).toBeVisible({ timeout: 15_000 });
    await shot(owner.page, testInfo, 'ux2-2-student-wizard-guardian');

    // ── Lead wizard → Prospects + derived next-action ──
    const LEADL = `Wiz${RUN}`;
    await addLeadViaWizard(owner.page, 'UX2Lead', LEADL, `+96178${RUN}`);
    await owner.page.goto(`/en/leads?search=${LEADL}`);
    const leadCard = owner.page.locator(`[data-testid="lead-card"][data-lead-name="UX2Lead ${LEADL}"]:visible`).first();
    await expect(leadCard, 'wizard lead persisted in Prospects').toBeVisible({ timeout: 15_000 });
    await expect(leadCard.getByTestId('lead-next-action'), 'derived next-action shows').toBeVisible();
    await shot(owner.page, testInfo, 'ux2-3-lead-wizard-next-action');

    // ── Plans CRUD wizard → new plan reaches ML-1's plan-change picker ──
    const PLAN = `UX2 Plan ${RUN}`;
    await owner.page.goto('/en/settings?tab=plans');
    await vis(owner.page, '[data-testid="plan-add-btn"]').first().click();
    const pw = owner.page.locator('[data-testid="plan-wizard"]:visible');
    await pw.getByTestId('plan-name-en').fill(PLAN);
    await pw.getByTestId('wizard-next').click();
    await pw.getByTestId('plan-price-usd').fill('70');
    await pw.locator('[data-testid="plan-duration-chip"][data-value="30"]').click();
    await pw.getByTestId('wizard-next').click();
    await expect(pw.getByTestId('plan-review')).toContainText(PLAN);
    await pw.getByTestId('wizard-submit').click();
    await expect(
      vis(owner.page, `[data-testid="plan-row"][data-name-en="${PLAN}"]`).first(),
      'new plan listed in the manager',
    ).toBeVisible({ timeout: 15_000 });

    // ML-1 integration: the plan-change picker (active plans) offers it.
    await owner.page.goto(`/en/students?search=${encodeURIComponent('Karim')}`);
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await vis(owner.page, '[data-testid="ms-change-plan-open"]').first().click();
    await expect(
      vis(owner.page, '[data-testid="ms-plan-chip"]').filter({ hasText: PLAN }).first(),
      'new plan appears in the ML-1 plan-change picker',
    ).toBeVisible({ timeout: 15_000 });
    await shot(owner.page, testInfo, 'ux2-4-plan-in-ml1-picker');

    // ── Belt ladders: new discipline → editor (archive/reorder/rename) ──
    const DISC = `UX2 Disc ${RUN}`;
    await owner.page.goto('/en/settings?tab=disciplines');
    await vis(owner.page, '[data-testid="discipline-add-en"]').fill(DISC);
    await vis(owner.page, '[data-testid="discipline-add-btn"]').click();
    await expect(
      vis(owner.page, `[data-testid="discipline-row"][data-name-en="${DISC}"]`).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Select it in the ladder editor — ADM-2 seeded the default 20-rank ladder.
    const mgr = owner.page.locator('[data-testid="belt-ladder-manager"]:visible').first();
    await mgr.locator(`[data-testid="belt-disc-chip"][data-name-en="${DISC}"]`).click();
    await expect(mgr.locator('[data-testid="belt-row"]')).toHaveCount(20, { timeout: 15_000 });

    // Archive the first rank (white) — it must vanish from the live ladder…
    await mgr.locator('[data-testid="belt-row"][data-rank="white"]').getByTestId('belt-archive-btn').click();
    await expect(mgr.locator('[data-testid="belt-row-archived"][data-rank="white"]')).toBeVisible({ timeout: 15_000 });
    await expect(mgr.locator('[data-testid="belt-row"]')).toHaveCount(19);

    // …reorder: tap-down the new first rank (white_yellow ↔ yellow swap)…
    await mgr.locator('[data-testid="belt-row"]').first().getByTestId('belt-down-btn').click();
    await expect(mgr.locator('[data-testid="belt-row"]').first()).toHaveAttribute('data-rank', 'yellow', { timeout: 15_000 });

    // …rename it through the wizard.
    await mgr.locator('[data-testid="belt-row"][data-rank="yellow"]').getByTestId('belt-rename-btn').click();
    const bw = owner.page.locator('[data-testid="belt-wizard"]:visible');
    await bw.getByTestId('belt-name-en').fill(`Yellow ${RUN}`);
    await bw.getByTestId('wizard-next').click();
    await bw.getByTestId('wizard-submit').click();
    await expect(
      mgr.locator('[data-testid="belt-row"][data-rank="yellow"]').filter({ hasText: `Yellow ${RUN}` }),
    ).toBeVisible({ timeout: 15_000 });
    await shot(owner.page, testInfo, 'ux2-5-ladder-editor');

    // ── Promote the wizard-created student to the ladder's FIRST ACTIVE rank ──
    await owner.page.goto(`/en/students?search=${encodeURIComponent(KID)}`);
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: KID }).first().click();
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await vis(owner.page, '[data-testid="promote-open"]').first().click();
    await vis(owner.page, '[data-testid="promote-discipline-chip"]').filter({ hasText: DISC }).first().click();
    // The archived rank must NOT be a target (consumers filter is_active).
    await expect(owner.page.locator('[data-testid="promote-rank-pill"][data-rank="white"]:visible')).toHaveCount(0);
    await vis(owner.page, '[data-testid="promote-rank-pill"]').first().click();
    await vis(owner.page, '[data-testid="promote-submit"]').click();
    await expect(
      owner.page.locator('[data-testid="app-toast"]').first(),
      'promotion into the fresh discipline succeeds end-to-end',
    ).toBeVisible({ timeout: 20_000 });
    await shot(owner.page, testInfo, 'ux2-6-promote-new-discipline');
  } finally {
    await owner.ctx.close();
  }
});

test('UX-2 · trials loop both outcomes: schedule → coach notified+day surface → outcome → stage flip + staff notified', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach');
  try {
    // Two wizard leads, both with a trial TODAY (so the day surface shows them).
    const A = `TrialA${RUN}`;
    const B = `TrialB${RUN}`;
    await addLeadViaWizard(owner.page, 'UX2', A, `+96179${RUN}`);
    await addLeadViaWizard(owner.page, 'UX2', B, `+96170${RUN}`);

    for (const last of [A, B]) {
      await owner.page.goto(`/en/leads?search=${last}`);
      const card = owner.page.locator(`[data-testid="lead-card"][data-lead-name="UX2 ${last}"]:visible`).first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole('button', { name: /Schedule Trial/i }).click();
      await card.getByTestId('trial-date').fill(today());
      await card.getByTestId('trial-time').selectOption('17:00');
      await card.getByTestId('trial-coach').selectOption({ label: COACH_EN });
      await card.getByTestId('trial-confirm').click();
      await expect(card.locator('[data-testid="lead-card"], [data-testid="trial-confirm"]').first()).toBeHidden({ timeout: 15_000 }).catch(() => {});
    }
    await shot(owner.page, testInfo, 'ux2-7-trials-scheduled');

    // Coach: notified + the day surface shows today's trials.
    await expectNotification(coach.page, 'trial_scheduled');
    await coach.page.goto('/en/coach');
    const homeTrials = coach.page.locator('[data-testid="coach-home-trials"]:visible').first();
    await expect(homeTrials, "today's trials surface on coach home").toBeVisible({ timeout: 15_000 });
    await expect(homeTrials.locator(`[data-testid="coach-home-trial-row"][data-lead-name="UX2 ${A}"]`)).toBeVisible();
    await shot(coach.page, testInfo, 'ux2-8-coach-day-surface');

    // One-tap outcomes: A = Showed (+note +interested), B = No-show.
    await coach.page.goto('/en/coach/trials');
    const rowA = coach.page.locator(`[data-testid="coach-trial-row"][data-lead-name="UX2 ${A}"]:visible`).first();
    await rowA.getByTestId('coach-trial-note').fill('strong fit for beginners class');
    await rowA.getByTestId('coach-trial-interested').click();
    await rowA.getByTestId('coach-trial-show').click();
    await expect(
      coach.page.locator(`[data-testid="coach-trial-row"][data-lead-name="UX2 ${A}"][data-trial-status="completed"]:visible`).first(),
    ).toBeVisible({ timeout: 15_000 });

    const rowB = coach.page.locator(`[data-testid="coach-trial-row"][data-lead-name="UX2 ${B}"]:visible`).first();
    await rowB.getByTestId('coach-trial-noshow').click();
    await expect(
      coach.page.locator(`[data-testid="coach-trial-row"][data-lead-name="UX2 ${B}"][data-trial-status="no_show"]:visible`).first(),
    ).toBeVisible({ timeout: 15_000 });
    await shot(coach.page, testInfo, 'ux2-9-outcomes-recorded');

    // Staff notified (trial_outcome, F2 keys) + Prospects reflects both flips.
    await expectNotification(owner.page, 'trial_outcome');
    await owner.page.goto(`/en/leads?search=${A}`);
    await expect(
      owner.page.locator(`[data-testid="lead-card"][data-lead-name="UX2 ${A}"][data-lead-status="trial_completed"]:visible`).first(),
      'Showed flips the lead to trial_completed',
    ).toBeVisible({ timeout: 15_000 });
    await owner.page.goto(`/en/leads?search=${B}`);
    const cardB = owner.page.locator(`[data-testid="lead-card"][data-lead-name="UX2 ${B}"][data-lead-status="contacted"]:visible`).first();
    await expect(cardB, 'No-show falls the lead back to contacted (re-engage)').toBeVisible({ timeout: 15_000 });
    await expect(cardB.getByTestId('lead-next-action'), 'next-action re-derived after the flip').toBeVisible();
    await shot(owner.page, testInfo, 'ux2-10-pipeline-reflects');
  } finally {
    await owner.ctx.close();
    await coach.ctx.close();
  }
});
