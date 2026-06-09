import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';

/**
 * Member Activity Loop cross-portal slice (Cycle 5 / Phase 1 / Prompt 24-R).
 *
 * Drives enroll → attend → promote → progress as real logins on the cloud DB:
 *   T1 owner enrolls Karim in the demo class → enrollment_confirmed (student) +
 *      the class on /portal/schedule.
 *   T2 coach marks present (reset), then absent → exactly ONE attendance_absent
 *      (transition), and re-saving absent produces NO second notification
 *      (transition guard). Counted on the student's /notifications.
 *   T4 owner promotes Karim one belt up via the atomic promote_student RPC →
 *      belt_promoted (student); the wizard resets on success.
 *   T5 /portal/progress shows rank + history + streak + "X of Y toward next belt";
 *      rank == latest history to_rank (atomic: rank ↔ history never diverge).
 *
 * Fresh context per role (no pinned session). The demo Muay Thai class id is read
 * from the coach attendance select (deterministic; the admin classes LIST/DETAIL
 * embeds were broken legacy — see the audit drag read). Promotion advances Karim
 * one rank per run (re-runnable until ranks exhaust).
 */

const COACH_EN = 'Sami';
const STUDENT_FIRST = 'Karim'; // student@ first_name_en (seeded 000017)

async function contextFor(browser: Browser, role: keyof typeof ROLES): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function optionValueByText(page: Page, testid: string, text: string): Promise<string> {
  const v = await page
    .locator(`[data-testid="${testid}"] option`, { hasText: text })
    .first()
    .getAttribute('value');
  return v ?? '';
}

async function countAbsentNotifs(browser: Browser): Promise<number> {
  const c = await contextFor(browser, 'student');
  try {
    await c.page.goto('/en/notifications');
    await c.page.waitForLoadState('networkidle').catch(() => {});
    return await c.page.locator('[data-notification-type="attendance_absent"]:visible').count();
  } finally {
    await c.ctx.close();
  }
}

async function coachMark(browser: Browser, classId: string, status: 'present' | 'absent'): Promise<void> {
  const c = await contextFor(browser, 'coach');
  try {
    await c.page.goto('/en/coach/attendance');
    await c.page.locator('[data-testid="attendance-class-select"]').selectOption(classId);
    const row = c.page.locator(`[data-testid="attendance-student"][data-student-name*="${STUDENT_FIRST}"]`).first();
    await expect(row, 'Karim should be on the class roster').toBeVisible({ timeout: 15_000 });
    await row.locator(`[data-testid="att-status-${status}"]`).click();
    await c.page.getByTestId('attendance-save').click();
    await expect(c.page.locator('[data-sonner-toast]').first(), 'attendance save should confirm').toBeVisible({ timeout: 15_000 });
    await c.page.waitForTimeout(1500); // let the server action's notify writes settle
  } finally {
    await c.ctx.close();
  }
}

test('Activity loop: enroll → attend (transition-guarded) → atomic promote → progress', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  // ── Resolve the demo Muay Thai class id from the coach attendance select ──
  let classId = '';
  {
    const c = await contextFor(browser, 'coach');
    try {
      await c.page.goto('/en/coach/attendance');
      await expect(c.page.locator('[data-testid="attendance-class-select"]')).toBeVisible({ timeout: 15_000 });
      classId = await optionValueByText(c.page, 'attendance-class-select', 'Muay Thai');
      expect(classId, 'the demo Muay Thai class should appear in the coach select').toBeTruthy();
    } finally {
      await c.ctx.close();
    }
  }

  // ── T1 — owner enrolls Karim → enrollment_confirmed ─────────────────────────
  {
    const owner = await contextFor(browser, 'owner');
    try {
      const resp = await owner.page.goto(`/en/classes/${classId}`);
      expect(resp?.status() ?? 0, 'class detail page should load (not 404)').toBeLessThan(400);
      await owner.page.getByTestId('enroll-open').click();
      const modal = owner.page.getByTestId('enroll-modal');
      await expect(modal).toBeVisible();
      await modal.getByTestId('enroll-search').fill(STUDENT_FIRST);
      const row = modal.locator('[data-testid="enroll-student-row"]', { hasText: STUDENT_FIRST }).first();
      await expect(row, 'Karim should be searchable in the enroll modal').toBeVisible({ timeout: 15_000 });
      await row.click();
      await modal.getByTestId('enroll-confirm').click();
      await expect(modal, 'enroll modal should close on success').toBeHidden({ timeout: 15_000 });
      await shot(owner.page, testInfo, 'al-1-enrolled');
    } finally {
      await owner.ctx.close();
    }
  }

  // ── T1 propagation — student sees enrollment_confirmed + class on schedule ──
  {
    const s = await contextFor(browser, 'student');
    try {
      await s.page.goto('/en/notifications');
      await expect(
        s.page.locator('p:visible', { hasText: 'Enrollment confirmed' }).first(),
        'enrollment_confirmed should be readable by the student',
      ).toBeVisible({ timeout: 15_000 });
      await s.page.goto('/en/portal/schedule');
      await expect(
        s.page.getByText(/Muay Thai/i).first(),
        'the enrolled class should appear on the member schedule',
      ).toBeVisible({ timeout: 15_000 });
      await shot(s.page, testInfo, 'al-2-student-enrolled');
    } finally {
      await s.ctx.close();
    }
  }

  // ── T2 — transition-guarded attendance_absent ──────────────────────────────
  await coachMark(browser, classId, 'present'); // establish a non-absent prior
  const baseline = await countAbsentNotifs(browser);

  await coachMark(browser, classId, 'absent'); // present → absent: ONE notification
  const afterAbsent = await countAbsentNotifs(browser);
  expect(afterAbsent, 'marking absent should add exactly one attendance_absent').toBe(baseline + 1);

  await coachMark(browser, classId, 'absent'); // absent → absent: NO re-notify
  const afterResave = await countAbsentNotifs(browser);
  expect(afterResave, 're-saving absent must NOT re-notify (transition guard)').toBe(afterAbsent);

  // ── T4 — owner promotes Karim one belt up (atomic RPC) ─────────────────────
  let nextRankLabel = '';
  {
    const owner = await contextFor(browser, 'owner');
    try {
      await owner.page.goto('/en/belts');
      await owner.page.locator('[data-testid="be-student"]').selectOption(await optionValueByText(owner.page, 'be-student', STUDENT_FIRST));
      await owner.page.locator('[data-testid="be-discipline"]').selectOption(await optionValueByText(owner.page, 'be-discipline', 'Muay Thai'));
      const currentRank = await owner.page.locator('[data-testid="be-current-rank"]').getAttribute('data-rank');
      await owner.page.getByTestId('be-next').click(); // step 0 → 1

      // Pick the immediate next belt (smallest sort_order above current).
      const next = await owner.page.$$eval(
        '[data-testid="be-belt"] option[data-rank]',
        (opts, currentRank) => {
          const list = (opts as HTMLOptionElement[]).map((o) => ({
            value: o.value,
            rank: o.getAttribute('data-rank') || '',
            sort: parseInt(o.getAttribute('data-sort') || '0', 10),
          }));
          const cur = list.find((o) => o.rank === currentRank);
          const curSort = cur ? cur.sort : -1;
          const higher = list.filter((o) => o.sort > curSort).sort((a, b) => a.sort - b.sort);
          return higher.length ? higher[0] : null;
        },
        currentRank,
      );
      expect(next, 'a next belt above the current rank should exist').toBeTruthy();
      nextRankLabel = (next!.rank || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      await owner.page.locator('[data-testid="be-belt"]').selectOption(next!.value);
      await owner.page.locator('[data-testid="be-coach"]').selectOption(await optionValueByText(owner.page, 'be-coach', COACH_EN));
      await owner.page.getByTestId('be-next').click(); // step 1 → 2 (review)
      await owner.page.getByTestId('be-confirm').click();

      // On success the wizard resets to step 0 (be-confirm disappears). If the
      // atomic RPC failed, the wizard stays on review → this times out (loudly).
      await expect(
        owner.page.getByTestId('be-confirm'),
        'a successful atomic promotion resets the wizard',
      ).toBeHidden({ timeout: 20_000 });
      await shot(owner.page, testInfo, 'al-3-promoted');
    } finally {
      await owner.ctx.close();
    }
  }

  // ── T5 — student sees belt_promoted + rank/history/streak/eligibility ──────
  {
    const s = await contextFor(browser, 'student');
    try {
      await s.page.goto('/en/notifications');
      await expect(
        s.page.locator('p:visible', { hasText: 'Belt promotion' }).first(),
        'belt_promoted should reach the student',
      ).toBeVisible({ timeout: 15_000 });

      await s.page.goto('/en/portal/progress');
      const progress = s.page.locator('[data-testid="portal-progress"]:visible').first();
      await expect(progress, '/portal/progress should render').toBeVisible({ timeout: 15_000 });

      // Rank reflects the promotion AND equals the latest history entry's to_rank
      // (atomic: rank ↔ history consistent).
      await expect(
        s.page.locator('[data-testid="progress-rank"]:visible').first(),
        'progress shows the new rank',
      ).toHaveText(new RegExp(nextRankLabel, 'i'), { timeout: 15_000 });
      await expect(
        s.page.locator('[data-testid="progress-history-item"]:visible').first(),
        'the latest promotion-history entry matches the new rank',
      ).toContainText(new RegExp(nextRankLabel, 'i'));
      await expect(
        s.page.locator('[data-testid="progress-streak"]:visible').first(),
        'progress shows the attendance streak number',
      ).toBeVisible();
      await expect(
        s.page.locator('[data-testid="progress-eligibility"]:visible').first(),
        'progress shows the "X of Y toward next belt" number',
      ).toBeVisible();
      await shot(s.page, testInfo, 'al-4-progress');
    } finally {
      await s.ctx.close();
    }
  }
});
