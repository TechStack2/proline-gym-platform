import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, untilConsistent } from './helpers';

/**
 * PT-POLICY (M2-D) — PtPolicySettings writes gyms.pt_late_cancel_window_hours; this spec
 * proves a SET policy field BITES where the platform reads it: the member self-cancel
 * guard in the cancel_pt_booking RPC (000045). Set a large late-cancel window via the
 * Settings UI → book a PT slot → the member's cancel now falls INSIDE the window → the
 * RPC blocks it (P0001 prose passes through to a toast) and the session stays scheduled.
 * Resets the window to 0 at the end so the shared worker gym is unchanged.
 *
 * Reuses pt2's proven booking idiom (availability → create type → sell → open slots →
 * book), replicated here so the spec is self-contained.
 */
const uniq = () => Date.now().toString().slice(-6);

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function ensureAvailability(coachPage: Page) {
  await coachPage.goto('/en/coach/pt');
  await expect(vis(coachPage, '[data-testid="availability-editor"]').first()).toBeVisible({ timeout: 20_000 });
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

// createType via the M2-D FormWizard (add-btn OPENS; Basics → Details).
async function createType(page: Page, name: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="ptpkg-add-btn"]').click();
  await vis(page, '[data-testid="ptpkg-add-en"]').fill(name);
  await vis(page, '[data-testid="wizard-next"]').click();
  await vis(page, '[data-testid="ptpkg-add-sessions"]').fill('10');
  await vis(page, '[data-testid="ptpkg-add-price"]').fill('100');
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
  // UNION-FIX: pin the coach we seed availability for (Sami = ROLES.coach) — do NOT use
  // .first(). This type carries no discipline, so pickableCoaches is the WHOLE roster,
  // and in union order a sibling-created login-less coach ("Adopt Coachee", no published
  // availability) can sort first. Picking it would (a) trip the J3 no-availability warn
  // so the sale is gated behind "Sell anyway", and (b) leave the later book step with
  // zero open slots. Pinning the availability-seeded coach makes both deterministic.
  await page.locator('[data-testid="pt-coach-chip"]').filter({ hasText: 'Sami' }).first().click();
  await page.getByTestId('pt-sell-submit').click();
  // Defensive backstop (team1 tolerant idiom): if the availability count query still
  // races to zero, the warn-and-allow modal appears — click straight through it.
  await page.getByTestId('pt-sell-anyway').click({ timeout: 3_000 }).catch(() => {});
  await expect(vis(page, '[data-testid="member-pt-row"][data-status="active"]').filter({ hasText: typeName }).first())
    .toBeVisible({ timeout: 20_000 });
}

function portalCard(page: Page, name: string) {
  return page.locator('[data-testid="pt-my-request"]').filter({ hasText: name }).first();
}

// Set the late-cancel window via the Settings PT-policy UI (offers section).
async function setLateCancelWindow(page: Page, hours: string) {
  await page.goto('/en/settings?tab=ptpackages');
  await vis(page, '[data-testid="pt-late-cancel-window"]').first().fill(hours);
  await vis(page, '[data-testid="pt-policy-save"]').first().click();
}

test('PT-POLICY · a set late-cancel window blocks the member cancel guard', async ({ browser }) => {
  test.setTimeout(300_000);
  const PACK = `Policy Pack ${uniq()}`;
  const owner = await ctxFor(browser, 'owner');
  const coach = await ctxFor(browser, 'coach');
  const student = await ctxFor(browser, 'student');
  try {
    await ensureAvailability(coach.page);
    await createType(owner.page, PACK);
    await sellToKarim(owner.page, PACK);

    // ── Member books the nearest slot under the DEFAULT policy (window still 0 — a
    //    booking is never itself gated). We raise the window AFTER, right before the
    //    cancel, so the gym-wide policy is live for the shortest possible span and no
    //    sibling PT spec's member self-cancel overlaps it. ──
    const slots = student.page.locator('[data-testid="pt-slot"]');
    await untilConsistent(async () => {
      await student.page.goto('/en/portal/pt');
      await portalCard(student.page, PACK).getByTestId('pt-book-open').click();
      await expect(slots.first()).toBeVisible({ timeout: 6_000 });
    }, { timeout: 45_000 });
    await slots.first().click();
    await expect(student.page.locator('[data-testid="app-toast"]').filter({ hasText: /booked/i }).first())
      .toBeVisible({ timeout: 15_000 });

    // ── Now raise the late-cancel window (720h > the booking horizon) so the freshly
    //    booked session falls INSIDE it — proving the UI write reaches gyms.pt_* and
    //    that the member self-cancel guard reads it. ──
    await setLateCancelWindow(owner.page, '720');

    // ── The booked session is scheduled + INSIDE the window → member cancel is blocked.
    //    Re-read the portal so the card reflects state after the policy change. ──
    await student.page.goto('/en/portal/pt');
    const session = portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first();
    await expect(session).toBeVisible({ timeout: 15_000 });
    await session.getByTestId('pt-cancel-booking').click();
    // The cancel_pt_booking guard RAISEs the window message (P0001 prose → toast verbatim).
    await expect(
      student.page.getByText(/cancellation window|contact the desk/i).first(),
      'the late-cancel window blocks the member self-cancel',
    ).toBeVisible({ timeout: 15_000 });
    // Credits untouched, session still scheduled (no write happened).
    await expect(
      portalCard(student.page, PACK).locator('[data-testid="portal-pt-session"][data-status="scheduled"]').first(),
      'the session stays scheduled after the blocked cancel',
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    // Restore the shared-gym policy (window back to 0 = no restriction).
    await setLateCancelWindow(owner.page, '0').catch(() => {});
    await owner.ctx.close();
    await coach.ctx.close();
    await student.ctx.close();
  }
});
