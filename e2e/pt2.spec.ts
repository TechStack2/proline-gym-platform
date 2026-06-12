import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification } from './helpers';

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
const RUN = Date.now().toString().slice(-6);
const PACK = `PT2 Pack ${RUN}`;
const MINI = `PT2 Mini ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function createType(page: Page, name: string, sessions: string, price: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="ptpkg-add-en"]').fill(name);
  await vis(page, '[data-testid="ptpkg-add-sessions"]').fill(sessions);
  await vis(page, '[data-testid="ptpkg-add-price"]').fill(price);
  await vis(page, '[data-testid="ptpkg-add-validity"]').fill('60');
  await vis(page, '[data-testid="ptpkg-add-btn"]').click();
  await expect(vis(page, `[data-testid="ptpkg-row"][data-name-en="${name}"]`).first()).toBeVisible({ timeout: 15_000 });
}

async function sellToKarim(page: Page, typeName: string) {
  await page.goto('/en/students?search=Karim');
  await vis(page, '[data-testid="student-card"]').filter({ hasText: 'Karim' }).first().click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await vis(page, '[data-testid="pt-sell-open"]').first().click();
  await page.locator('[data-testid="pt-type-chip"]').filter({ hasText: typeName }).first().click();
  await page.locator('[data-testid="pt-coach-chip"]').first().click();
  await page.getByTestId('pt-sell-submit').click();
  await expect(
    vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: typeName }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

/** The member-side card + its Book modal for a given package name. */
function portalCard(page: Page, name: string) {
  return page.locator('[data-testid="pt-my-request"]').filter({ hasText: name }).first();
}

test('PT-2 · publish → policy-bounded slots → instant book everywhere → staff override today (warning)', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach'); // Sami
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Coach publishes availability for every weekday ──
    await coach.page.goto('/en/coach/pt');
    for (let d = 0; d <= 6; d++) {
      await vis(coach.page, `[data-testid="avail-day-pill"][data-dow="${d}"]`).first().click();
      await vis(coach.page, '[data-testid="avail-start"]').first().fill('08:00');
      await vis(coach.page, '[data-testid="avail-end"]').first().fill('20:00');
      await vis(coach.page, '[data-testid="avail-add"]').first().click();
      await expect(vis(coach.page, `[data-testid="avail-row"][data-dow="${d}"]`).first()).toBeVisible({ timeout: 15_000 });
    }

    // ── A fresh distinct package for Karim ──
    await createType(owner.page, PACK, '10', '100');
    await sellToKarim(owner.page, PACK);

    // ── Member: only policy-bounded slots (≥ 12h notice), tap = booked ──
    await student.page.goto('/en/portal/pt');
    await portalCard(student.page, PACK).getByTestId('pt-book-open').click();
    const slots = student.page.locator('[data-testid="pt-slot"]');
    await expect(slots.first()).toBeVisible({ timeout: 20_000 });
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
    const overrideAt = new Date(Date.now() + 30 * 60_000);
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
  const owner = await ctxFor(browser, 'owner');
  const a = await ctxFor(browser, 'student');
  const b = await ctxFor(browser, 'student');
  try {
    // ── Race (stale list): B opens slots, A books one, B clicks the same ──
    await a.page.goto('/en/portal/pt');
    await b.page.goto('/en/portal/pt');
    await portalCard(a.page, PACK).getByTestId('pt-book-open').click();
    await portalCard(b.page, PACK).getByTestId('pt-book-open').click();
    const aSlots = a.page.locator('[data-testid="pt-slot"]');
    const bSlots = b.page.locator('[data-testid="pt-slot"]');
    await expect(aSlots.first()).toBeVisible({ timeout: 20_000 });
    await expect(bSlots.first()).toBeVisible({ timeout: 20_000 });
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
    await a.page.goto('/en/portal/pt');
    for (let i = 0; i < 2; i++) {
      await portalCard(a.page, MINI).getByTestId('pt-book-open').click();
      const s = a.page.locator('[data-testid="pt-slot"]');
      await expect(s.first()).toBeVisible({ timeout: 20_000 });
      await s.first().click();
      await expect(a.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
        .toBeVisible({ timeout: 15_000 });
      await a.page.goto('/en/portal/pt');
    }
    await portalCard(a.page, MINI).getByTestId('pt-book-open').click();
    const s3 = a.page.locator('[data-testid="pt-slot"]');
    await expect(s3.first()).toBeVisible({ timeout: 20_000 });
    await s3.first().click();
    await expect(
      a.page.locator('[data-testid="app-toast"]').filter({ hasText: /no bookable credits/i }).first(),
      '2 credits + 2 reservations reject the 3rd booking',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await a.ctx.close();
    await b.ctx.close();
  }
});

test('PT-2 · propose → counter → member accepts (same guards); member cancel leaves credits untouched', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
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
    await student.ctx.close();
  }
});
