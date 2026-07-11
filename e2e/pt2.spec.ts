import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification, untilConsistent } from './helpers';

/**
 * PT-2 — signature booking: availability → policy-bounded slots → instant
 * book; race-loser message; anti-overbook; propose→counter→accept; member
 * cancel (credits untouched); staff override with the conflict warning.
 *
 *  1. Sami publishes 7-day 08:00–20:00 windows → a fresh "PT2 Pack" is sold
 *     to Karim → Karim sees only ≥min-notice slots → taps one → BOOKED:
 *     coach app row + diary block + portal card + both bells; the desk then
 *     OVERRIDES a booking for TODAY 18:30 (inside the seeded class slot → the
 *     IA-3 conflict warning shows) → Today's PT card picks it up.
 *  2. Race (stale-second-click): ctx B holds a stale slot list and clicks the
 *     slot ctx A just booked → clean "slot taken" + fresh slots. Anti-
 *     overbook: a 2-session "PT2 Mini" with 2 future bookings rejects the 3rd.
 *  3. Propose 07:00 (+3d, outside windows) → Inbox row → staff counter 11:00
 *     → member accepts → scheduled; member cancels a future booking →
 *     credits UNTOUCHED (remaining text identical before/after).
 */
// Names are derived PER TEST (+retry) — a worker restart resets module state,
// so cross-test name sharing silently dangles (PT-1 lesson, deeper cut).
const uniq = () => Date.now().toString().slice(-6);

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function createType(page: Page, name: string, sessions: string, price: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="ptpkg-add-btn"]').click();
  await vis(page, '[data-testid="ptpkg-add-en"]').fill(name);
  await vis(page, '[data-testid="wizard-next"]').click();
  await vis(page, '[data-testid="ptpkg-add-sessions"]').fill(sessions);
  await vis(page, '[data-testid="ptpkg-add-price"]').fill(price);
  await vis(page, '[data-testid="ptpkg-add-validity"]').fill('60');
  await vis(page, '[data-testid="wizard-submit"]').click();
  await expect(vis(page, `[data-testid="ptpkg-row"][data-name-en="${name}"]`).first()).toBeVisible({ timeout: 15_000 });
}

async function sellToKarim(page: Page, typeName: string) {
  await page.goto('/en/students?search=Karim');
  await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await vis(page, '[data-testid="pt-sell-open"]').first().click();
  await page.locator('[data-testid="pt-type-chip"]').filter({ hasText: typeName }).first().click();
  // UNION-ORDER DETERMINISM (pt-policy 2dd7429 / pt1 lesson): pt-coach-chip lists ALL the
  // gym's coaches, and siblings (adm1/adm2) add some to the SHARED run gym → `.first()` is
  // non-deterministic. This test publishes SAMI's availability and books slots against the
  // sold package's coach, so it MUST sell to Sami — a different coach has no slots (and a
  // no-availability coach also raises the warn this helper would otherwise not clear).
  await page.locator('[data-testid="pt-coach-chip"]').filter({ hasText: 'Sami' }).first().click();
  await page.getByTestId('pt-sell-submit').click();
  // Tolerant warn-and-allow: no-op when Sami already has availability (→ no warn).
  await page.getByTestId('pt-sell-anyway').click({ timeout: 10_000 }).catch(() => {});
  await expect(
    vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: typeName }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

/** The member-side card + its Book modal for a given package name. */
function portalCard(page: Page, name: string) {
  return page.locator('[data-testid="pt-my-request"]').filter({ hasText: name }).first();
}

/**
 * Open the Book modal and wait until at least one `pt-slot` RENDERS.
 * ROOT RACE: availability-publish → slot-compute → render isn't instant, and a
 * one-shot 20s wait intermittently observed an empty list. Re-navigate + reopen
 * the modal until slots appear (re-reading availability each attempt). Returns
 * the (now-populated) slots locator with the modal open. NB it navigates, so a
 * caller relying on a STALE list (the race-loser) must capture its list from
 * THIS call and not navigate again before clicking.
 */
async function openSlots(page: Page, name: string): Promise<ReturnType<Page['locator']>> {
  const slots = page.locator('[data-testid="pt-slot"]');
  await untilConsistent(async () => {
    await page.goto('/en/portal/pt');
    await portalCard(page, name).getByTestId('pt-book-open').click();
    await expect(slots.first()).toBeVisible({ timeout: 6_000 });
  }, { timeout: 45_000 });
  return slots;
}

/** Publish 7-day 08:00–20:00 windows once; later calls no-op (rows persist). */
async function ensureAvailability(coachPage: Page) {
  await coachPage.goto('/en/coach/pt');
  await expect(
    vis(coachPage, '[data-testid="availability-editor"]').first(),
    'the availability editor renders for the coach',
  ).toBeVisible({ timeout: 20_000 });
  if ((await vis(coachPage, '[data-testid="avail-row"]').count()) >= 7) return;
  for (let d = 0; d <= 6; d++) {
    if ((await vis(coachPage, `[data-testid="avail-row"][data-dow="${d}"]`).count()) > 0) continue;
    await vis(coachPage, `[data-testid="avail-day-pill"][data-dow="${d}"]`).first().click();
    await vis(coachPage, '[data-testid="avail-start"]').first().fill('08:00');
    await vis(coachPage, '[data-testid="avail-end"]').first().fill('20:00');
    await vis(coachPage, '[data-testid="avail-add"]').first().click();
    await expect(vis(coachPage, `[data-testid="avail-row"][data-dow="${d}"]`).first()).toBeVisible({ timeout: 15_000 });
  }
}

test('PT-2 · publish → policy-bounded slots → instant book everywhere → staff override today (warning)', async ({ browser }) => {
  test.setTimeout(300_000);
  const PACK = `PT2 Pack ${uniq()}`;
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach'); // Sami
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Coach publishes availability (idempotent) ──
    await ensureAvailability(coach.page);

    // ── A fresh distinct package for Karim ──
    await createType(owner.page, PACK, '10', '100');
    await sellToKarim(owner.page, PACK);

    // ── Member: only policy-bounded slots (≥ 12h notice), tap = booked ──
    const slots = await openSlots(student.page, PACK);
    const whens = await slots.evaluateAll((els) => els.map((e) => e.getAttribute('data-when')!));
    const minNotice = Date.now() + 12 * 3600_000;
    expect(whens.length, 'slots are offered').toBeGreaterThan(0);
    expect(whens.filter((w) => new Date(w).getTime() < minNotice), 'no slot violates min-notice').toHaveLength(0);

    const bookedIso = whens[0];
    await slots.first().click();
    await expect(student.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });
    await expect(
      portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first(),
      'booking nests under the package card',
    ).toBeVisible({ timeout: 15_000 });

    // ── Lands in the coach app + the diary + both bells ──
    await coach.page.goto('/en/coach/pt');
    await expect(
      coach.page.locator(`[data-testid="pt-roster-row"][data-package-en="${PACK}"]:visible`).first()
        .locator('[data-testid="pt-session-row"][data-status="scheduled"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    const slotDate = bookedIso.slice(0, 10);
    await owner.page.goto(`/en/schedule?view=day&date=${slotDate}`);
    await expect(vis(owner.page, '[data-testid="diary-pt-block"][data-status="scheduled"]').first(),
      'booking shows in the IA-3 diary').toBeVisible({ timeout: 15_000 });
    await expectNotification(student.page, 'pt_session_scheduled');
    await expectNotification(coach.page, 'pt_session_scheduled');

    // ── Staff override: TODAY 18:30 (inside the seeded class → warning) ──
    await owner.page.goto('/en/students?search=Karim');
    await vis(owner.page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
    const packCard = vis(owner.page, '[data-testid="member-pt-row"]').filter({ hasText: PACK }).first();
    await packCard.getByTestId('m360-pt-book').click();
    await owner.page.getByTestId('pt-override-toggle').check();
    // Warning: point at the just-booked slot (a guaranteed PT conflict)…
    await owner.page.getByTestId('pt-override-at').fill(bookedIso.slice(0, 16));
    await expect(owner.page.getByTestId('pt-override-warning'), 'IA-3 conflict warning shows for the desk')
      .toBeVisible({ timeout: 15_000 });
    // …then book a free off-grid time (override skips availability/notice/grid).
    // +90min clears every C1 session the suite scheduled at now() (60min spans)
    // — +30min sat INSIDE pt-delivery's still-scheduled session → 'Slot taken'.
    const overrideAt = new Date(Date.now() + 90 * 60_000);
    await owner.page.getByTestId('pt-override-at').fill(overrideAt.toISOString().slice(0, 16));
    await owner.page.getByTestId('pt-override-book').click();
    await expect(owner.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });

    // Today picks the override booking up automatically (existing card).
    await owner.page.goto('/en/today');
    await expect(vis(owner.page, '[data-testid="today-pt-row"]').filter({ hasText: 'Karim' }).first(),
      'Today PT card picks the booking up').toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await coach.ctx.close();
    await student.ctx.close();
  }
});

test('PT-2 · race loser gets clean slot-taken + fresh slots; anti-overbook rejects the 3rd', async ({ browser }) => {
  test.setTimeout(300_000);
  const PACK = `PT2 Race ${uniq()}`;
  const MINI = `PT2 Mini ${uniq()}`;
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach');
  const a = await ctxFor(browser, 'student');
  const b = await ctxFor(browser, 'student');
  try {
    await ensureAvailability(coach.page);
    await createType(owner.page, PACK, '10', '100');
    await sellToKarim(owner.page, PACK);

    // ── Race (stale list): B opens slots, A books one, B clicks the same ──
    // Both lists are loaded BEFORE A books (below) → B's list is genuinely
    // stale w.r.t. A's booking, preserving the race-loser path.
    const aSlots = await openSlots(a.page, PACK);
    const bSlots = await openSlots(b.page, PACK);
    const target = (await aSlots.first().getAttribute('data-when'))!;

    await aSlots.first().click();
    await expect(a.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });
    // B still shows the now-taken slot — clicking it = the race loser path.
    await b.page.locator(`[data-testid="pt-slot"][data-when="${target}"]`).first().click();
    await expect(
      b.page.locator('[data-testid="app-toast"]').filter({ hasText: /slot taken/i }).first(),
      'the loser gets the clean slot-taken message',
    ).toBeVisible({ timeout: 15_000 });
    // …and fresh slots: the taken slot is gone from the reloaded list.
    await expect(b.page.locator(`[data-testid="pt-slot"][data-when="${target}"]`)).toHaveCount(0, { timeout: 15_000 });

    // ── Anti-overbook: 2-credit pack, 2 bookings, the 3rd rejected ──
    await createType(owner.page, MINI, '2', '50');
    await sellToKarim(owner.page, MINI);
    for (let i = 0; i < 2; i++) {
      const s = await openSlots(a.page, MINI);
      await s.first().click();
      await expect(a.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
        .toBeVisible({ timeout: 15_000 });
    }
    const s3 = await openSlots(a.page, MINI);
    await s3.first().click();
    await expect(
      a.page.locator('[data-testid="app-toast"]').filter({ hasText: /no bookable credits/i }).first(),
      '2 credits + 2 reservations reject the 3rd booking',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await coach.ctx.close();
    await a.ctx.close();
    await b.ctx.close();
  }
});

test('PT-2 · propose → counter → member accepts (same guards); member cancel leaves credits untouched', async ({ browser }) => {
  test.setTimeout(300_000);
  const PACK = `PT2 Flow ${uniq()}`;
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    await ensureAvailability(coach.page);
    await createType(owner.page, PACK, '10', '100');
    await sellToKarim(owner.page, PACK);

    // ── Member books one slot (the cancel target), then proposes a time ──
    const slots = await openSlots(student.page, PACK);
    await slots.first().click();
    await expect(student.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });

    // ── Member proposes an out-of-window time (+3d 07:00) ──
    const plus3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    await student.page.goto('/en/portal/pt');
    await portalCard(student.page, PACK).getByTestId('pt-book-open').click();
    await student.page.getByTestId('pt-propose-open').click();
    await student.page.getByTestId('pt-propose-at').fill(`${plus3}T07:00`);
    await student.page.getByTestId('pt-propose-submit').click();
    await expect(student.page.locator('[data-testid="app-toast"]').filter({ hasText: /proposal sent/i }).first())
      .toBeVisible({ timeout: 15_000 });

    // ── Staff Inbox: counter with 11:00 ──
    await owner.page.goto('/en/inbox');
    const row = vis(owner.page, '[data-testid="pt-proposal-row"]').filter({ hasText: 'Karim' }).first();
    await expect(row, 'proposal lands in the Inbox').toBeVisible({ timeout: 15_000 });
    await row.getByTestId('proposal-counter-open').click();
    await vis(owner.page, '[data-testid="proposal-counter-at"]').first().fill(`${plus3}T11:00`);
    await vis(owner.page, '[data-testid="proposal-counter-send"]').first().click();
    await expect(vis(owner.page, '[data-testid="pt-proposal-row"]').filter({ hasText: 'Karim' }),
      'countered proposal leaves the gym-turn queue').toHaveCount(0, { timeout: 15_000 });

    // ── Member accepts the counter → scheduled (same booking guards) ──
    await student.page.goto('/en/portal/pt');
    const proposedRow = portalCard(student.page, PACK)
      .locator('[data-testid="portal-pt-session"][data-status="proposed"]').first();
    await expect(proposedRow, 'the counter shows on the package card with the ball').toBeVisible({ timeout: 15_000 });
    await proposedRow.getByTestId('pt-proposal-accept-member').click();
    await student.page.goto('/en/portal/pt');
    await expect(
      portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="proposed"]'),
    ).toHaveCount(0, { timeout: 15_000 });

    // ── Member cancel: credits UNTOUCHED ──
    const remainingBefore = (await portalCard(student.page, PACK).getByTestId('pt-remaining').textContent())!.trim();
    await portalCard(student.page, PACK)
      .locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first()
      .getByTestId('pt-cancel-booking').click();
    await expect(student.page.locator('[data-sonner-toast]').filter({ hasText: /cancelled/i }).first())
      .toBeVisible({ timeout: 15_000 });
    await student.page.goto('/en/portal/pt');
    const remainingAfter = (await portalCard(student.page, PACK).getByTestId('pt-remaining').textContent())!.trim();
    expect(remainingAfter, 'cancel frees the slot, credits untouched').toBe(remainingBefore);
  } finally {
    await owner.ctx.close();
    await coach.ctx.close();
    await student.ctx.close();
  }
});
