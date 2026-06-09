import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';

/**
 * PT Session Delivery lifecycle (Cycle 5 / Phase 1 / Prompt C1).
 *
 * 22-R built acquisition (request→approve→roster); this proves DELIVERY — the
 * part that consumes credits — with the edge cases as first-class assertions:
 *
 *   setup  student requests "Single PT Session" → owner approves (coach Sami) →
 *          a fresh ACTIVE 1-credit assignment X.
 *   coach  schedule TWO sessions on X (over-scheduling is allowed) → complete one
 *          (−1 credit, X auto-completes at 0).
 *   E1     re-complete the SAME (completed) session → no-op (still 0; one decrement).
 *   E2     complete the other (still-scheduled) session on the now-exhausted X →
 *          REJECTED (no decrement; stays scheduled; remaining 0).
 *   E3     owner restores the credit (used 1→0, remaining→1); restoring AGAIN is
 *          guarded (used stays 0, never below 0; remaining stays 1, never above total).
 *   T6     the member sees the completed session in /portal/pt history + credits.
 *
 * Single writer: only complete_pt_session decrements. Fresh assignment per run
 * (idempotent). Coach/portal are single-shell; /pt (dashboard) needs no :visible
 * here because rows are scoped by the unique assignment id. Fails loudly.
 */

const PACKAGE_EN = 'Single PT Session';
const COACH_EN = 'Sami';

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

test('PT delivery: schedule → complete (E1) → exhausted-block (E2) → restore guard (E3) → member history', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  // ── setup.1 — student requests the single-session package ───────────────────
  {
    const s = await contextFor(browser, 'student');
    try {
      await s.page.goto('/en/portal/pt');
      const card = s.page.locator(`[data-testid="pt-package-card"][data-package-name="${PACKAGE_EN}"]`);
      await expect(card, `the "${PACKAGE_EN}" package should be offered`).toBeVisible({ timeout: 15_000 });
      await card.getByRole('button', { name: /request this package/i }).click();
      await card.locator('select').selectOption({ label: COACH_EN });
      await card.getByRole('button', { name: /send request/i }).click();
      await expect(s.page.getByText(/request sent/i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await s.ctx.close();
    }
  }

  // ── setup.2 — owner approves the pending request ────────────────────────────
  {
    const o = await contextFor(browser, 'owner');
    try {
      await o.page.goto('/en/pt');
      const pending = o.page.locator('[data-testid="pt-pending-request"]:visible').first();
      await expect(pending, 'the pending request should surface to staff').toBeVisible({ timeout: 15_000 });
      await pending.locator('select').selectOption({ label: COACH_EN }).catch(() => {});
      await pending.getByRole('button', { name: /^approve$/i }).click();
      await expect(
        o.page.locator('[data-sonner-toast]').first(),
        'approval should confirm',
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await o.ctx.close();
    }
  }

  // ── coach — capture X, schedule ×2, complete, E1, E2 ────────────────────────
  let assignmentId = '';
  {
    const c = await contextFor(browser, 'coach');
    try {
      await c.page.goto('/en/coach/pt');
      const roster = c.page.locator('[data-testid="pt-roster-row"]').first();
      await expect(roster, 'the approved assignment should appear on the coach roster').toBeVisible({ timeout: 15_000 });
      assignmentId = (await roster.getAttribute('data-assignment-id')) ?? '';
      expect(assignmentId, 'roster row should carry the assignment id').toBeTruthy();
      const sel = `[data-testid="pt-session-row"][data-assignment-id="${assignmentId}"]`;

      // Schedule two sessions (over-scheduling a 1-credit assignment is allowed;
      // completion is what's capped).
      await roster.getByTestId('pt-schedule').click();
      await expect(c.page.locator(`${sel}[data-status="scheduled"]`)).toHaveCount(1, { timeout: 15_000 });
      await c.page.locator(`[data-testid="pt-roster-row"][data-assignment-id="${assignmentId}"]`).first().getByTestId('pt-schedule').click();
      await expect(c.page.locator(`${sel}[data-status="scheduled"]`)).toHaveCount(2, { timeout: 15_000 });
      await shot(c.page, testInfo, 'ptd-1-scheduled');

      // Complete one → −1 credit; X auto-completes at 0.
      await c.page.locator(`${sel}[data-status="scheduled"]`).first().getByTestId('pt-complete').click();
      const completed = c.page.locator(`${sel}[data-status="completed"]`).first();
      await expect(completed, 'the completed session should appear').toBeVisible({ timeout: 15_000 });
      await expect(completed, 'completing decremented exactly one credit (remaining 0)').toHaveAttribute('data-remaining', '0');
      await shot(c.page, testInfo, 'ptd-2-completed');

      // E1 — re-complete the SAME session → idempotent no-op (still 0).
      await completed.getByTestId('pt-complete').click();
      await expect(
        c.page.locator(`${sel}[data-status="completed"]`).first(),
        'E1: double-complete must not double-decrement (remaining still 0)',
      ).toHaveAttribute('data-remaining', '0', { timeout: 15_000 });

      // E2 — complete the still-scheduled session on the now-exhausted assignment.
      const stillScheduled = c.page.locator(`${sel}[data-status="scheduled"]`).first();
      await expect(stillScheduled).toBeVisible();
      await stillScheduled.getByTestId('pt-complete').click();
      await expect(
        c.page.locator('[data-sonner-toast]').filter({ hasText: /remaining|active|exhaust/i }).first(),
        'E2: completing on an exhausted assignment should be rejected',
      ).toBeVisible({ timeout: 15_000 });
      // No decrement / no state change: the session is still scheduled, remaining 0.
      await expect(
        c.page.locator(`${sel}[data-status="scheduled"]`).first(),
        'E2: the rejected session stays scheduled',
      ).toBeVisible();
      await shot(c.page, testInfo, 'ptd-3-exhausted-block');
    } finally {
      await c.ctx.close();
    }
  }

  // ── E3 — owner restores the credit; restoring again is guarded ──────────────
  {
    const o = await contextFor(browser, 'owner');
    try {
      await o.page.goto('/en/pt');
      const row = `[data-testid="pt-restore-row"][data-assignment-id="${assignmentId}"]`;
      await expect(o.page.locator(row).first(), 'the assignment should appear in the restore panel').toBeVisible({ timeout: 15_000 });
      await expect(o.page.locator(row).first(), 'one credit was consumed').toHaveAttribute('data-used', '1');

      await o.page.locator(row).first().getByTestId('pt-restore').click();
      await expect(o.page.locator(row).first(), 'restore returned the credit (used 0)').toHaveAttribute('data-used', '0', { timeout: 15_000 });
      await expect(o.page.locator(row).first(), 'remaining restored to 1').toHaveAttribute('data-remaining', '1');
      await shot(o.page, testInfo, 'ptd-4-restored');

      // Restore again → guarded (never below 0 / never above total).
      await o.page.locator(row).first().getByTestId('pt-restore').click();
      await expect(
        o.page.locator('[data-sonner-toast]').filter({ hasText: /no credit|restore/i }).first(),
        'E3: a second restore should be rejected',
      ).toBeVisible({ timeout: 15_000 });
      await expect(o.page.locator(row).first(), 'E3: used never drops below 0').toHaveAttribute('data-used', '0');
      await expect(o.page.locator(row).first(), 'E3: remaining never exceeds total').toHaveAttribute('data-remaining', '1');
    } finally {
      await o.ctx.close();
    }
  }

  // ── T6 — member sees the session history + remaining credits ────────────────
  {
    const s = await contextFor(browser, 'student');
    try {
      await s.page.goto('/en/portal/pt');
      await expect(s.page.getByTestId('portal-pt-history'), '/portal/pt history should render').toBeVisible({ timeout: 15_000 });
      await expect(
        s.page.locator('[data-testid="portal-pt-session"][data-status="completed"]').first(),
        'the completed session should surface in member history',
      ).toBeVisible({ timeout: 15_000 });
      await expect(s.page.getByTestId('portal-pt-remaining'), 'remaining credits should render').toBeVisible();
      await shot(s.page, testInfo, 'ptd-5-member-history');
    } finally {
      await s.ctx.close();
    }
  }
});
