import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';
import { vis } from './helpers';

/**
 * REP-1 — Attendance history/reports repair + coach date picker (parallel track).
 *
 * Proves the read/reporting side now runs on the REAL model
 * (attendance_records.attendance_date + class_id; the old class_schedules.date /
 * students.first_name embeds were the DOA):
 *   1. coach marks TODAY → /attendance/history shows it (this-week default) and a
 *      past-only date range excludes it.
 *   2. /reports renders the by-class table with REAL fill numbers for the seeded
 *      class (sessions ≥ 1, fill = a number, never NaN).
 *   3. coach picks YESTERDAY → marks an "excused" correction via the EXISTING
 *      upsert write path → it persists across a reload at that date.
 *
 * Switches roles internally (owner reads, coach marks), so it must NOT pin a
 * single session. The seeded "Muay Thai Beginner" class is scheduled every
 * weekday, so it appears in the coach select for today AND yesterday.
 */

const STUDENT_FIRST = 'Karim';

const todayStr = new Date().toISOString().split('T')[0];
const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const farFrom = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
const farTo = new Date(Date.now() - 50 * 86400000).toISOString().split('T')[0];

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Mark the seeded class roster's Karim with `status` for `date`, via the coach UI
 *  (the SAME saveAttendance upsert — no new write path). Returns the class id. */
async function coachMark(browser: Browser, date: string, status: 'present' | 'late' | 'excused'): Promise<string> {
  const c = await contextFor(browser, 'coach');
  try {
    await c.page.goto('/en/coach/attendance');
    // Set the date FIRST (drives which weekday's classes + which day's records).
    const dateInput = c.page.locator('[data-testid="coach-attendance-date"]');
    await expect(dateInput, 'the coach date picker should render').toBeVisible({ timeout: 15_000 });
    await dateInput.fill(date);

    const sel = c.page.locator('[data-testid="attendance-class-select"]');
    await expect(sel).toBeVisible({ timeout: 15_000 });
    const opt = c.page.locator('[data-testid="attendance-class-select"] option', { hasText: 'Muay Thai' }).first();
    await expect(opt, 'the seeded Muay Thai class should appear for this weekday').toBeAttached({ timeout: 15_000 });
    const classId = (await opt.getAttribute('value')) ?? '';
    expect(classId).toBeTruthy();
    await sel.selectOption(classId);

    const row = c.page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT_FIRST}"]`).first();
    await expect(row, 'Karim should be on the roster').toBeVisible({ timeout: 15_000 });
    await row.locator(`[data-testid="att-status-${status}"]`).click();
    await c.page.getByTestId('attendance-save').click();
    await expect(c.page.locator('[data-sonner-toast]').first(), 'save should confirm').toBeVisible({ timeout: 15_000 });
    await c.page.waitForTimeout(1200); // let the upsert settle
    return classId;
  } finally {
    await c.ctx.close();
  }
}

test('REP-1: history + reports render real data + coach marks a past date', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  // ── Seed a TODAY record (distinctive 'late') via the coach marking flow ──
  await coachMark(browser, todayStr, 'late');

  // ── History shows today's record (this-week default) ───────────────────────
  {
    const owner = await contextFor(browser, 'owner');
    try {
      const resp = await owner.page.goto('/en/attendance/history');
      expect(resp?.status() ?? 0, '/attendance/history should load (not the old DOA)').toBeLessThan(400);
      await expect(
        vis(owner.page, `[data-testid="history-row"][data-student*="${STUDENT_FIRST}"]`).first(),
        'today\'s marked attendance should appear in history',
      ).toBeVisible({ timeout: 15_000 });
      // Per-day summary carries today's date.
      await expect(
        vis(owner.page, `[data-testid="history-day-row"][data-date="${todayStr}"]`).first(),
        'the per-day summary should include today',
      ).toBeVisible({ timeout: 15_000 });
      await shot(owner.page, testInfo, 'rep1-history');

      // ── Range filter EXCLUDES today when the window is entirely in the past ──
      await owner.page.goto(`/en/attendance/history?dateFrom=${farFrom}&dateTo=${farTo}`);
      await owner.page.waitForLoadState('networkidle').catch(() => {});
      await expect(
        vis(owner.page, `[data-testid="history-row"][data-student*="${STUDENT_FIRST}"]`),
        'a past-only window should exclude today\'s record',
      ).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await owner.ctx.close();
    }
  }

  // ── Reports: by-class table renders REAL fill numbers (no NaN) ──────────────
  {
    const owner = await contextFor(browser, 'owner');
    try {
      const resp = await owner.page.goto('/en/reports');
      expect(resp?.status() ?? 0, '/reports should load').toBeLessThan(400);
      const classRow = vis(owner.page, '[data-testid="report-class-row"][data-class*="Muay Thai"]').first();
      await expect(classRow, 'the seeded class should appear in the by-class report').toBeVisible({ timeout: 15_000 });

      const sessions = await classRow.locator('[data-testid="rc-sessions"]').innerText();
      expect(parseInt(sessions, 10), 'sessions held should be a real count ≥ 1').toBeGreaterThanOrEqual(1);

      const fill = await classRow.locator('[data-testid="rc-fill"]').innerText();
      expect(fill, 'fill rate must be a real number, never NaN').toMatch(/^\d+%$/);

      const avg = await classRow.locator('[data-testid="rc-avg"]').innerText();
      expect(avg, 'avg attendance must be a real number, never NaN').not.toContain('NaN');
      await shot(owner.page, testInfo, 'rep1-reports');
    } finally {
      await owner.ctx.close();
    }
  }

  // ── Coach marks YESTERDAY (correction) → persists across reload at that date ─
  await coachMark(browser, yesterdayStr, 'excused');
  {
    const c = await contextFor(browser, 'coach');
    try {
      await c.page.goto('/en/coach/attendance');
      await c.page.locator('[data-testid="coach-attendance-date"]').fill(yesterdayStr);
      const sel = c.page.locator('[data-testid="attendance-class-select"]');
      const opt = c.page.locator('[data-testid="attendance-class-select"] option', { hasText: 'Muay Thai' }).first();
      await expect(opt).toBeAttached({ timeout: 15_000 });
      await sel.selectOption((await opt.getAttribute('value')) ?? '');
      const row = c.page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT_FIRST}"]`).first();
      await expect(row, 'Karim row should reload for yesterday').toBeVisible({ timeout: 15_000 });
      await expect(
        row,
        'the yesterday "excused" correction should persist (prefilled from the saved record)',
      ).toHaveAttribute('data-status', 'excused', { timeout: 15_000 });
      await shot(c.page, testInfo, 'rep1-coach-yesterday');
    } finally {
      await c.ctx.close();
    }
  }
});
