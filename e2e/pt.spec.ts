import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';

/**
 * PT cross-portal vertical slice (Cycle 5 / Phase 1 / Prompt 22-R).
 *
 * Drives the WHOLE personal-training flow as real logins against the coherent
 * cloud DB and asserts the cross-portal propagation at each hop:
 *
 *   1. student@  /portal/pt  → request the "Single PT Session" package (+ coach)
 *                              via the request_pt RPC → "Requested" badge.
 *   2. owner@    /pt          → the pending request surfaces (pt_requested →
 *                              staff only) → approve (auto dual-currency invoice
 *                              + pt_approved/pt_assigned notifications).
 *   3. coach@    /coach/pt    → roster shows the student with "1 of 1" credits →
 *                              Log session → "0 of 1" → button disabled (blocks
 *                              at 0: increment_sessions_used rejects past total).
 *   4. student@  /portal/pt   → status now Active with remaining credits updated;
 *                /portal/billing → the PT invoice surfaces ($38.85 = $35 base +
 *                              11% Lebanese TVA applied by the invoice trigger).
 *
 * One cross-portal test (no fixed storageState project): it opens a fresh
 * context per role from the saved sessions in e2e/.auth/. Idempotent: it acts on
 * the NEWEST pending request for this package (the staff page orders pending by
 * requested_at DESC; the coach roster by updated_at DESC), so re-runs operate on
 * their own request and never collide with prior state. Fails loudly (never
 * skips) if any portal does not reflect a step.
 */

const PACKAGE_EN = 'Single PT Session';
const COACH_EN = 'Sami'; // demo coach seeded by 000017 (coach@prolinegym.lb)

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

test('PT slice: student request → staff approve+invoice → coach delivers → state flows back', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);

  // ── 1. STUDENT requests the single-session package ──────────────────────────
  const student = await contextFor(browser, 'student');
  try {
    const resp = await student.page.goto('/en/portal/pt');
    expect(resp?.status() ?? 0, '/portal/pt should load').toBeLessThan(400);

    const card = student.page.locator(`[data-testid="pt-package-card"][data-package-name="${PACKAGE_EN}"]`);
    await expect(card, `the "${PACKAGE_EN}" package should be offered to the student`).toBeVisible();

    await card.getByRole('button', { name: /request this package/i }).click();
    await card.locator('select').selectOption({ label: COACH_EN }); // preferred coach
    await card.getByRole('button', { name: /send request/i }).click();

    // The request goes through the request_pt SECURITY DEFINER RPC; the page
    // then refreshes and the assignment shows under "My requests" as Requested.
    await expect(
      student.page.getByText(/request sent/i).first(),
      'student should see the request-sent confirmation',
    ).toBeVisible({ timeout: 15_000 });
    await student.page.reload();
    await expect(
      student.page.locator('[data-testid="pt-my-request"]').filter({ hasText: 'Requested' }).first(),
      'the new request should show a "Requested" status badge',
    ).toBeVisible();
    await shot(student.page, testInfo, 'pt-1-student-requested');
  } finally {
    await student.ctx.close();
  }

  // ── 2. OWNER approves the pending request (auto-invoice + notifications) ─────
  const owner = await contextFor(browser, 'owner');
  try {
    const resp = await owner.page.goto('/en/pt');
    expect(resp?.status() ?? 0, '/pt (staff) should load').toBeLessThan(400);

    // The pending request must surface for staff (pt_requested → staff only).
    // The (dashboard) layout duplicates content across breakpoints, so scope to
    // the VISIBLE pending card. Act on the NEWEST (top) for this package.
    const pendingCard = owner.page.locator('[data-testid="pt-pending-request"]:visible').first();
    await expect(pendingCard, 'a pending request should be visible to staff (request propagated)').toBeVisible({ timeout: 15_000 });
    await expect(pendingCard, 'the pending request should be for this package').toContainText(PACKAGE_EN);

    await pendingCard.locator('select').selectOption({ label: COACH_EN }).catch(() => {});
    await pendingCard.getByRole('button', { name: /^approve$/i }).click();

    await expect(
      owner.page.getByText(/approved/i).first(),
      'staff should see the approval confirmation toast',
    ).toBeVisible({ timeout: 15_000 });
    await shot(owner.page, testInfo, 'pt-2-owner-approved');
  } finally {
    await owner.ctx.close();
  }

  // ── 3. COACH sees the roster + logs a session (decrements; blocks at 0) ──────
  const coach = await contextFor(browser, 'coach');
  try {
    const resp = await coach.page.goto('/en/coach/pt');
    expect(resp?.status() ?? 0, '/coach/pt should load').toBeLessThan(400);

    // Roster row for the approved single-session package. get_coach_pt_roster
    // orders by updated_at DESC → this run's assignment is first.
    const rosterRow = coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${PACKAGE_EN}"]:visible`).first();
    await expect(rosterRow, 'the approved student should appear in the coach roster').toBeVisible({ timeout: 15_000 });
    await expect(
      rosterRow.getByText(/1 of 1 sessions remaining/i),
      'roster should show full credits (1 of 1) before any session is logged',
    ).toBeVisible();
    await shot(coach.page, testInfo, 'pt-3-coach-roster');

    // Log one session → increment_sessions_used decrements remaining 1 → 0.
    await rosterRow.getByRole('button', { name: /log session/i }).click();
    await expect(
      rosterRow.getByText(/0 of 1 sessions remaining/i),
      'logging a session should decrement remaining credits to 0',
    ).toBeVisible({ timeout: 15_000 });

    // At 0 the button is disabled — the boundary is enforced (cannot over-log).
    await expect(
      rosterRow.getByRole('button', { name: /log session/i }),
      'log-session button must be disabled at 0 remaining (blocks past total)',
    ).toBeDisabled();
    await shot(coach.page, testInfo, 'pt-3-coach-exhausted');
  } finally {
    await coach.ctx.close();
  }

  // ── 4. STUDENT sees updated status + credits, and the invoice in billing ────
  const studentBack = await contextFor(browser, 'student');
  try {
    const resp = await studentBack.page.goto('/en/portal/pt');
    expect(resp?.status() ?? 0, '/portal/pt should load').toBeLessThan(400);

    // The assignment is now Active and reflects the consumed credit (0 of 1).
    const myRequest = studentBack.page
      .locator('[data-testid="pt-my-request"]')
      .filter({ hasText: 'Active' })
      .filter({ hasText: '0 of 1 sessions remaining' })
      .first();
    await expect(
      myRequest,
      'the assignment should now show Active with updated credits for the student (state flowed back)',
    ).toBeVisible({ timeout: 15_000 });
    await shot(studentBack.page, testInfo, 'pt-4-student-active');

    // The auto-created PT invoice surfaces in billing. The invoice trigger adds
    // 11% Lebanese TVA, so the displayed total_usd is $35 * 1.11 = $38.85.
    const billingResp = await studentBack.page.goto('/en/portal/billing');
    expect(billingResp?.status() ?? 0, '/portal/billing should load').toBeLessThan(400);
    await expect(
      studentBack.page.getByText('No invoices'),
      'billing should NOT show the empty state',
    ).toHaveCount(0);
    await expect(
      studentBack.page.getByText('$38.85').first(),
      'the auto-created PT invoice ($35 + 11% TVA = $38.85) should surface in billing',
    ).toBeVisible({ timeout: 15_000 });
    await shot(studentBack.page, testInfo, 'pt-4-student-billing');
  } finally {
    await studentBack.ctx.close();
  }
});
