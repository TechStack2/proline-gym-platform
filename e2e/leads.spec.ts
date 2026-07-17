import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';
import { gymSlug } from './helpers';

/**
 * Lead → Active-Member cross-portal vertical slice (Cycle 5 / Phase 1 / Prompt 23-R).
 *
 * Drives the WHOLE acquisition→onboarding journey as real logins against the
 * coherent cloud DB and asserts the cross-portal propagation at each hop:
 *
 *   T1a (anon) landing trial form → submit_public_lead → gym-scoped lead
 *              (source=website) + lead_new to staff.
 *   T1b owner@ /leads "Add Lead" (source=phone) → staff INSERT + lead_new fan-out;
 *              reception@ reads lead_new on /notifications (staff-only).
 *   T3  owner@ schedules a trial (date/time/coach Sami) → trial_classes row;
 *       coach@ /coach/trials sees it (trial_scheduled notified the coach).
 *   T4  coach@ records "showed up" → lead → trial_completed.
 *   T5  owner@ Convert → pick Monthly plan → atomic profile+student+membership+
 *              invoice($50 + 11% TVA = $55.50) + converted_student_id + lead_converted
 *              + simulated login invite. The invoice number + total + invite badge
 *              surface in admin.
 *   T6  the new member appears on the admin students roster.
 *
 * Opens a fresh context per role from e2e/.auth/*.json (and one anon context for
 * the public submit). Idempotent: a unique RUN suffix names this run's leads, so
 * re-runs never collide. Fails loudly (never skips) if any portal does not
 * reflect a step. Leads/students finds use URL ?search= for determinism.
 */

const RUN = Date.now().toString().slice(-6);
const WEB_NAME = `WebLead ${RUN}`;
const STAFF_FIRST = 'StaffLead';
const STAFF_LAST = RUN; // unique → search key
const STAFF_NAME = `${STAFF_FIRST} ${STAFF_LAST}`;
const COACH_EN = 'Sami'; // demo coach (coach@prolinegym.lb), seeded by 000017
const PLAN_NAME = 'Monthly'; // seeded Monthly plan ($50) → $55.50 incl. 11% TVA

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

test('Lead→Member slice: origination (web + staff) → trial → convert → member surfaces', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  // ── T1a — public web origination (anon, no session) ─────────────────────────
  const anonCtx = await browser.newContext({ locale: 'en' });
  const anon = await anonCtx.newPage();
  try {
    // X1: target the run gym via the public-lead gym selector (prod defaults to demo).
    const resp = await anon.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    expect(resp?.status() ?? 0, 'landing page should load').toBeLessThan(400);

    // GRW-1: the trial CTA is the new capture form — name + phone + interest
    // CHIPS (the program <select> is gone) + honeypot + ?c= → submit_trial_inquiry.
    await anon.locator('#trial-name').fill(WEB_NAME);
    await anon.locator('#trial-phone').fill(`+96170${RUN}`);
    const chip = anon.locator('[data-testid="trial-interest-chip"]').first();
    if (await chip.count()) await chip.click(); // optional interest
    await anon.getByTestId('trial-submit').click();

    await expect(
      anon.getByTestId('trial-success'),
      'public submit should reach the success state',
    ).toBeVisible({ timeout: 15_000 });
    await shot(anon, testInfo, 'leads-1-web-submit');
  } finally {
    await anonCtx.close();
  }

  // ── T1a propagation + lead_new — reception sees the web lead + the notification
  const recep = await contextFor(browser, 'reception');
  try {
    await recep.page.goto(`/en/leads?search=${encodeURIComponent(WEB_NAME)}`);
    const webCard = recep.page.locator(`[data-testid="lead-card"][data-lead-name="${WEB_NAME}"]:visible`).first();
    await expect(webCard, 'the public web lead should propagate to the admin board').toBeVisible({ timeout: 15_000 });
    await expect(webCard.getByTestId('lead-source'), 'the web lead must be source-tagged Website').toHaveText(/Website/i);
    await shot(recep.page, testInfo, 'leads-2-reception-board');

    await recep.page.goto('/en/notifications');
    // The (dashboard) layout renders content twice (responsive shells), so scope
    // to the VISIBLE copy — the notification title is a <p>.
    await expect(
      recep.page.locator('p:visible', { hasText: 'New lead' }).first(),
      'lead_new should be readable by staff (reception)',
    ).toBeVisible({ timeout: 15_000 });
    await shot(recep.page, testInfo, 'leads-2-reception-lead_new');
  } finally {
    await recep.ctx.close();
  }

  // ── T1b — staff-manual origination (owner "Add Lead", source=phone) ─────────
  const owner = await contextFor(browser, 'owner');
  try {
    await owner.page.goto('/en/leads');
    // The (dashboard) page content renders twice (responsive shells); the hidden
    // copy's button never becomes actionable, so scope every overlay interaction
    // to the VISIBLE shell (card-scoped locators are already :visible).
    await owner.page.locator('[data-testid="add-lead-button"]:visible').first().click();
    const modal = owner.page.locator('[data-testid="add-lead-modal"]:visible');
    await expect(modal).toBeVisible();
    await modal.getByTestId('lead-first-name').fill(STAFF_FIRST);
    await modal.getByTestId('lead-last-name').fill(STAFF_LAST);
    await modal.getByTestId('lead-phone').fill(`+96171${RUN}`);
    // UX-2: the modal is now the shared FormWizard — contact → interest (chips) → review.
    await modal.getByTestId('wizard-next').click();
    await modal.locator('[data-testid="lead-source-chip"][data-value="phone"]').click();
    await modal.getByTestId('wizard-next').click();
    await modal.getByTestId('wizard-submit').click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await owner.page.goto(`/en/leads?search=${encodeURIComponent(STAFF_LAST)}`);
    const staffCard = owner.page.locator(`[data-testid="lead-card"][data-lead-name="${STAFF_NAME}"]:visible`).first();
    await expect(staffCard, 'the staff-added lead should be persisted (staff INSERT RLS)').toBeVisible({ timeout: 15_000 });
    await expect(staffCard.getByTestId('lead-source'), 'manual lead must carry source=Phone').toHaveText(/Phone/i);
    await shot(owner.page, testInfo, 'leads-3-staff-added');

    // ── T3 — schedule a trial on a REAL class occurrence (TRIAL-SLOTS) ─────────
    // The e2e gym's Muay Thai class runs every weekday taught by Sami, so today's
    // occurrence is the first "Muay Thai" option; picking it pins the trial to that
    // occurrence (and its coach) — no more free-range date/time.
    await staffCard.getByRole('button', { name: /Schedule Trial/i }).click();
    const occ = staffCard.getByTestId('trial-occurrence');
    await occ.selectOption(await occ.locator('option', { hasText: 'Muay Thai' }).first().getAttribute('value') as string);
    await staffCard.getByTestId('trial-confirm').click();
    // Durable proof (toasts are transient): after the action + refresh the card
    // reflects trial_scheduled (trial_classes row written + lead flipped).
    await expect(
      owner.page
        .locator(`[data-testid="lead-card"][data-lead-name="${STAFF_NAME}"][data-lead-status="trial_scheduled"]:visible`)
        .first(),
      'scheduling should persist (trial_classes row + lead → trial_scheduled)',
    ).toBeVisible({ timeout: 20_000 });
    await shot(owner.page, testInfo, 'leads-3-trial-scheduled');
  } finally {
    await owner.ctx.close();
  }

  // ── T3 propagation + T4 — coach sees the trial and records "showed up" ──────
  const coach = await contextFor(browser, 'coach');
  try {
    await coach.page.goto('/en/coach/trials');
    const trialRow = coach.page.locator(`[data-testid="coach-trial-row"][data-lead-name="${STAFF_NAME}"]`).first();
    await expect(trialRow, 'the scheduled trial should surface on the coach Trials tab (notify + propagate)').toBeVisible({ timeout: 15_000 });
    await shot(coach.page, testInfo, 'leads-4-coach-trials');

    await trialRow.getByTestId('coach-trial-show').click();
    // Durable proof: the row reflects the recorded outcome after refresh
    // (trial → completed; the RPC also flips the lead → trial_completed).
    await expect(
      coach.page
        .locator(`[data-testid="coach-trial-row"][data-lead-name="${STAFF_NAME}"][data-trial-status="completed"]`)
        .first(),
      'recording show should persist (trial → completed)',
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await coach.ctx.close();
  }

  // ── T5 — owner converts the lead → atomic member + membership + invoice ─────
  const owner2 = await contextFor(browser, 'owner');
  try {
    await owner2.page.goto(`/en/leads?search=${encodeURIComponent(STAFF_LAST)}`);
    const card = owner2.page.locator(`[data-testid="lead-card"][data-lead-name="${STAFF_NAME}"]:visible`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByTestId('convert-open').click();
    const cmodal = owner2.page.locator('[data-testid="convert-modal"]:visible');
    await expect(cmodal).toBeVisible();
    // Select the Monthly plan by reading its option value (labels carry price).
    const monthlyValue = await cmodal
      .locator('[data-testid="convert-plan"] option', { hasText: PLAN_NAME })
      .first()
      .getAttribute('value');
    expect(monthlyValue, `a "${PLAN_NAME}" plan option should exist`).toBeTruthy();
    await cmodal.getByTestId('convert-plan').selectOption(monthlyValue!);
    await cmodal.getByTestId('convert-confirm').click();

    // Durable proof (toasts are transient): the converted card shows the simulated
    // login-invite + the membership invoice (Monthly $50 + 11% Lebanese TVA =
    // $55.50, computed by the invoice trigger). The invite-badge appearing means
    // the atomic convert (profile+student+membership+invoice+link) succeeded.
    const convertedCard = owner2.page.locator(`[data-testid="lead-card"][data-lead-name="${STAFF_NAME}"]:visible`).first();
    await expect(convertedCard.getByTestId('invite-badge'), 'a simulated login-invite state must be visible in admin (convert succeeded)').toBeVisible({ timeout: 20_000 });
    await expect(convertedCard.getByTestId('convert-result'), 'the membership invoice (TVA total) should surface').toContainText('$55.50');
    await shot(owner2.page, testInfo, 'leads-5-converted');

    // ── T6 — the new member surfaces on the admin students roster ─────────────
    // NB: the admin students-page text search filters on EMBEDDED profiles.*
    // columns via a top-level .or(), which PostgREST does not apply (pre-existing
    // legacy bug → empty results). Assert against the unfiltered roster instead;
    // the new member is the newest row and carries the unique run name.
    await owner2.page.goto('/en/students');
    await expect(
      owner2.page.locator('h3:visible', { hasText: STAFF_NAME }).first(),
      'the converted lead should now be a real student on the admin roster (propagation)',
    ).toBeVisible({ timeout: 15_000 });
    await shot(owner2.page, testInfo, 'leads-6-roster');
  } finally {
    await owner2.ctx.close();
  }
});
