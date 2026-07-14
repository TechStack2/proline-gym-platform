import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, untilConsistent, awaitEffect } from './helpers';

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

// SCHED-SPEC-FIX — read the COMMITTED booking fact (RLS-free) so the "still books"
// proof asserts what durably landed in pt_sessions, not a replica-lagged/aborted UI read.
const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function committedScheduled(assignmentId: string): Promise<number> {
  const res = await fetch(
    `${SVC_URL}/rest/v1/pt_sessions?assignment_id=eq.${assignmentId}&status=eq.scheduled&select=id`,
    { headers: { apikey: SVC_KEY as string, Authorization: `Bearer ${SVC_KEY}` } },
  );
  if (!res.ok) throw new Error(`committedScheduled: ${res.status} ${await res.text()}`);
  return ((await res.json()) as unknown[]).length;
}

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
    await card.getByTestId('pt-request-coach-chip').filter({ hasText: COACH_EN }).click();
    await card.getByRole('button', { name: /send request/i }).click();
    await expect(student.page.getByText(/request sent/i).first()).toBeVisible({ timeout: 15_000 });

    await owner.page.goto('/en/inbox');
    const ptRow = vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE }).first();
    await expect(ptRow).toBeVisible({ timeout: 15_000 });
    await ptRow.getByTestId('inbox-pt-approve').click();
    await expect(vis(owner.page, '[data-testid="inbox-pt-row"]').filter({ hasText: PT_PACKAGE })).toHaveCount(0, { timeout: 15_000 });

    // ── C1: the coach schedules TODAY (RPC default now()); 2nd booking overlaps ──
    // APPROVE-READ RACE: the inbox approve above commits the pt_assignment; the coach
    // roster read can race that commit (a one-shot goto renders an empty roster).
    // Re-fetch a fresh roster until the approved package appears.
    await untilConsistent(async () => {
      await coach.page.goto('/en/coach/pt');
      await expect(
        coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${PT_PACKAGE}"]`).first(),
        'the coached 10-pack appears on the run coach roster',
      ).toBeVisible({ timeout: 5_000 });
    });
    // FLAKE-HEAL: capture the assignment id ONCE, then pin EVERY roster action to it.
    // The run coach (Sami) is a shared seed fixture whose roster can carry sibling
    // 10-pack rows; re-resolving `…[data-package-en=…].first()` for the 2nd booking
    // can land on a DIFFERENT assignment than the one captured, so the pinned session
    // count sticks at 1 forever (the union flake). Pin by data-assignment-id instead.
    const assignmentId = await coach.page
      .locator(`[data-testid="pt-roster-row"][data-package-en="${PT_PACKAGE}"]`).first()
      .getAttribute('data-assignment-id');
    expect(assignmentId, 'the roster row carries an assignment id').toBeTruthy();
    // R3 — the pin is also :visible-scoped, so no hidden responsive twin can be clicked.
    const pinnedRow = vis(coach.page, `[data-testid="pt-roster-row"][data-assignment-id="${assignmentId}"]`).first();
    const scheduledRows = () =>
      vis(coach.page, `[data-testid="pt-session-row"][data-assignment-id="${assignmentId}"][data-status="scheduled"]`);

    // R4 — baseline this pinned assignment's COMMITTED scheduled count so a retry (which
    // re-drives the request→approve onto a fresh assignment) can't drift the absolute
    // count; every assertion below is a delta off `base`.
    if (!SVC_URL || !SVC_KEY) throw new Error('SCHED-SPEC-FIX needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL');
    const base = await committedScheduled(assignmentId!);

    // ── First booking ───────────────────────────────────────────────────────────
    await pinnedRow.getByTestId('pt-schedule').click();
    // R1 — gate on the WRITE signal (sonner success on the coach path), never a bare
    // read: the in-flight server action can't be aborted before it commits.
    await expect(
      coach.page.locator('[data-sonner-toast]').filter({ hasText: /scheduled/i }).first(),
      'the first booking confirms',
    ).toBeVisible({ timeout: 15_000 });
    // R2 — assert the committed fact, then the (now-durable) UI count.
    await awaitEffect(async () => (await committedScheduled(assignmentId!)) >= base + 1, { budget: 30_000 });
    await expect(scheduledRows(), 'first session shows').toHaveCount(base + 1, { timeout: 15_000 });

    // Let the first toast auto-dismiss so the second booking's toast is unambiguous.
    await expect(coach.page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });

    // ── Second overlapping booking on the SAME pinned assignment (not .first()) ────
    await pinnedRow.getByTestId('pt-schedule').click();
    // The "overlap warns but never blocks" proof — the non-blocking warning renders…
    await expect(
      coach.page.locator('[data-testid="pt-conflict-warning"]').first(),
      'overlap renders the non-blocking warning',
    ).toBeVisible({ timeout: 15_000 });
    // …R1: gate navigation on the WRITE toast — the residual was navigate-on-warning
    // (a READ signal emitted BEFORE the write) racing the in-flight 2nd action; this
    // waits for the write to confirm first, so the goto below can never abort it.
    await expect(
      coach.page.locator('[data-sonner-toast]').filter({ hasText: /scheduled/i }).first(),
      'the second booking confirms (never blocks)',
    ).toBeVisible({ timeout: 15_000 });
    // R2: the committed fact — a genuinely-lost/misrouted 2nd write fails LOUDLY here
    // (not as a flaky UI timeout), disambiguating a lost write from replica lag.
    await awaitEffect(async () => (await committedScheduled(assignmentId!)) >= base + 2, { budget: 30_000 });
    // …only now read the UI count; the row is already durable, so this is deterministic.
    // EXACTLY base+2 scheduled rows for THIS pinned assignment — the ==2 proof, intact.
    await untilConsistent(async () => {
      await coach.page.goto('/en/coach/pt');
      await expect(scheduledRows(), 'booking still completes (non-blocking)').toHaveCount(base + 2, { timeout: 5_000 });
    });
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
