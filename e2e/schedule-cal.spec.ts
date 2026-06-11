import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis } from './helpers';

/**
 * IA-3 — Schedule unification (Cycle 5 / V1).
 *
 * One calendar, two views, read-side only:
 *  - Week·Timetable: the seeded class renders at its weekday/time, the
 *    discipline filter narrows it, the chip deep-links to the class.
 *  - Day·Coach-diary: after driving the existing 22R/C1 flow (portal request
 *    with a preferred coach → inbox approve → coach schedules today), the run
 *    coach's column shows BOTH calendar species — the recurring class slot AND
 *    the PT booking — and the PT block links into the C1 lifecycle surface.
 *  - Conflict guard: scheduling a second overlapping session for the same coach
 *    renders the non-blocking warning AND the booking still completes (zero
 *    write-path changes — C1 specs prove no regression in the same run).
 *  - RTL smoke: /ar/schedule renders clean.
 */
const PT_PACKAGE = '10 Sessions Pack';
const COACH_EN = 'Sami';
const SEEDED_CLASS = 'Muay Thai Beginner';

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

test('IA-3 · timetable + coach diary show both species; overlap warns but never blocks', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  const coach = await ctxFor(browser, 'coach'); // Sami
  try {
    // ── Week · Timetable: seeded class at its slot; filter narrows; chip links ──
    await owner.page.goto('/en/schedule');
    const chip = vis(owner.page, `[data-testid="week-chip"][data-class-en="${SEEDED_CLASS}"]`).first();
    await expect(vis(owner.page, '[data-testid="week-grid"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(chip, 'seeded class renders in the week grid').toBeVisible();
    await expect(vis(owner.page, '[data-testid="week-grid"]').first()).toContainText('18:00');
    // Discipline filter: Boxing has no classes → the Muay Thai chip disappears.
    await vis(owner.page, '[data-testid="filter-discipline"]').selectOption({ label: 'Boxing' });
    await vis(owner.page, 'form button').last().click();
    await expect(vis(owner.page, `[data-testid="week-chip"][data-class-en="${SEEDED_CLASS}"]`)).toHaveCount(0, { timeout: 15_000 });
    await owner.page.goto('/en/schedule');
    await chip.click();
    await expect(owner.page, 'chip deep-links to the class').toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // ── Drive 22R: Karim requests the 10-pack WITH the run coach → inbox approve ──
    await student.page.goto('/en/portal/pt');
    const card = student.page.locator(`[data-testid="pt-package-card"][data-package-name="${PT_PACKAGE}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: /request this package/i }).click();
    await card.locator('select').selectOption({ label: COACH_EN });
    await card.getByRole('button', { name: /send request/i }).click();
    await expect(student.page.getByText(/request sent/i).first()).toBeVisible({ timeout: 15_000 });

    await owner.page.goto('/en/inbox');
    const ptRow = vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE }).first();
    await expect(ptRow).toBeVisible({ timeout: 15_000 });
    await ptRow.getByTestId('inbox-pt-approve').click();
    await expect(vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE })).toHaveCount(0, { timeout: 15_000 });

    // ── C1: the coach schedules TODAY (RPC default now()); 2nd booking overlaps ──
    await coach.page.goto('/en/coach/pt');
    const roster = coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${PT_PACKAGE}"]`).first();
    await expect(roster, 'the coached 10-pack appears on the run coach roster').toBeVisible({ timeout: 15_000 });
    const assignmentId = await roster.getAttribute('data-assignment-id');
    const sessionSel = `[data-testid="pt-session-row"][data-assignment-id="${assignmentId}"]`;

    await roster.getByTestId('pt-schedule').click();
    await expect(coach.page.locator(`${sessionSel}[data-status="scheduled"]`)).toHaveCount(1, { timeout: 15_000 });

    // Second overlapping booking (same coach, default now()): warning + still books.
    await coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${PT_PACKAGE}"]`).first()
      .getByTestId('pt-schedule').click();
    await expect(
      coach.page.locator('[data-testid="pt-conflict-warning"]').first(),
      'overlap renders the non-blocking warning',
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      coach.page.locator(`${sessionSel}[data-status="scheduled"]`),
      'booking still completes (non-blocking)',
    ).toHaveCount(2, { timeout: 15_000 });
    await noMissing(coach.page);

    // ── Day · Coach diary: the coach column shows BOTH species; PT → lifecycle ──
    await owner.page.goto('/en/schedule?view=day');
    const diary = vis(owner.page, '[data-testid="coach-diary"]').first();
    await expect(diary).toBeVisible({ timeout: 15_000 });
    const samiCol = vis(owner.page, '[data-testid="diary-coach-column"]').filter({ hasText: COACH_EN }).first();
    await expect(samiCol).toBeVisible();
    await expect(samiCol.locator('[data-testid="diary-class-block"]').first(), 'recurring class slot visible').toBeVisible();
    await expect(samiCol.locator('[data-testid="diary-pt-block"]').first(), 'PT booking visible in the same column').toBeVisible();
    await noMissing(owner.page);
    await samiCol.locator('[data-testid="diary-pt-block"]').first().click();
    await expect(owner.page, 'PT block links into the C1 lifecycle surface').toHaveURL(/\/en\/pt/, { timeout: 15_000 });

    // ── RTL smoke ──
    await owner.page.goto('/ar/schedule');
    await expect(vis(owner.page, '[data-testid="week-grid"]').first()).toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
    await coach.ctx.close();
  }
});
