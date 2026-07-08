import { test, expect, type Browser, type Page } from '@playwright/test';
import { ROLES } from './roles';
import { vis, gymSlug, untilConsistent } from './helpers';

/**
 * E1 — summer camps: create → publish → register (guardian payer) → deposit →
 * run + capacity race-safety (Cycle 5/V1).
 *
 * Seeded by 000043: 'Summer Camp' spans today, capacity 3, PUBLISHED.
 * Run-gym actors: Karim (login member) · Omar Khalil + Lina Mourad (Rana's
 * kids, login-less) · Rana (guardian login).
 *
 *  1. Publish gate + desk sale + deposit: wizard-create "E1 Camp" (staged →
 *     absent from the anon landing) → publish → present with price; desk-
 *     register OMAR from Member-360 → roster shows the snapshotted $200 +
 *     payer = Rana on the invoice (B3) → PARTIAL $50 payment via the D1 form
 *     → roster badge flips to "partial" → Rana's household billing carries
 *     the camp invoice.
 *  2. Capacity + run + request loop: fill the seeded camp (Karim/Omar/Lina =
 *     3/3) → camp flips FULL (landing badge; the 4th — a freshly added member
 *     — is blocked with the clear message) → mark today's attendance →
 *     persists → Today card shows the camp with counts and drills to the
 *     roster → Rana requests "E1 Camp" for LINA → Inbox → approve →
 *     confirmed + invoice (same RPC).
 */
const RUN = Date.now().toString().slice(-6);
const CAMP_NAME = `E1 Camp ${RUN}`;
const KID4 = `CampKid ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  return { ctx, page: await ctx.newPage() };
}

async function openFile(page: Page, name: string) {
  // ISO-DB: under parallel-worker load the search results / click→nav can lag;
  // re-search + click until the member file opens (idempotent read path).
  await untilConsistent(async () => {
    await page.goto(`/en/students?search=${encodeURIComponent(name)}`);
    await vis(page, '[data-testid="student-card"]').filter({ hasText: name }).first().click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 5_000 });
  });
}

/** Desk-register via the Member-360 camp modal; returns without asserting. */
async function deskRegister(page: Page, member: string, camp: string) {
  await openFile(page, member);
  await vis(page, '[data-testid="m360-camp-open"]').first().click();
  await page.locator('[data-testid="m360-camp-option"]').filter({ hasText: camp }).first().click();
  await page.getByTestId('m360-camp-submit').click();
}

test('E1 · publish gate → desk registration (guardian payer, snapshot) → deposit → household', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await ctxFor(browser, 'owner');
  const guardian = await ctxFor(browser, 'parent'); // Rana
  const anon = await (async () => { const ctx = await browser.newContext({ locale: 'en' }); return { ctx, page: await ctx.newPage() }; })();
  try {
    // ── Wizard create (staged) ──
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await owner.page.goto('/en/camps');
    await vis(owner.page, '[data-testid="camp-add-btn"]').first().click();
    // M2-B: the camp form now rides the shared FormWizard — Basics → Dates & capacity →
    // Pricing → Review, nav = wizard-next/wizard-submit. Field testids are preserved.
    await owner.page.getByTestId('camp-name-en').fill(CAMP_NAME);
    await owner.page.getByTestId('wizard-next').click(); // Basics → Dates & capacity
    await owner.page.getByTestId('camp-start').fill(today);
    await owner.page.getByTestId('camp-end').fill(end);
    await owner.page.getByTestId('camp-capacity').fill('5');
    await owner.page.getByTestId('wizard-next').click(); // Dates & capacity → Pricing
    await owner.page.getByTestId('camp-price-usd').fill('200');
    await owner.page.getByTestId('wizard-next').click(); // Pricing → Review
    await owner.page.getByTestId('wizard-submit').click();
    const card = vis(owner.page, `[data-testid="camp-card"][data-name-en="${CAMP_NAME}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    // ── Staged: anon landing does NOT show it ──
    await anon.page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await anon.page.waitForLoadState('networkidle').catch(() => {});
    await expect(anon.page.locator(`[data-testid="landing-camp-card"][data-name-en="${CAMP_NAME}"]`)).toHaveCount(0);

    // ── Publish → anon landing shows it with the price ──
    await card.getByTestId('camp-publish-toggle').click();
    await expect(vis(owner.page, `[data-testid="camp-card"][data-name-en="${CAMP_NAME}"]`).first()
      .getByTestId('camp-publish-toggle')).toHaveAttribute('data-on', 'true', { timeout: 15_000 });
    await anon.page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await anon.page.waitForLoadState('networkidle').catch(() => {});
    const landingCard = anon.page.locator(`[data-testid="landing-camp-card"][data-name-en="${CAMP_NAME}"]`).first();
    await expect(landingCard, 'published camp renders on the anon landing').toBeVisible({ timeout: 15_000 });
    await expect(landingCard).toContainText('$200');

    // ── Desk-register Omar (Rana's kid) from Member-360 ──
    await deskRegister(owner.page, 'Omar', CAMP_NAME);
    await expect(
      owner.page.locator('[data-testid="app-toast"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Roster: snapshotted price + pending payment badge + guardian tap-to-call.
    await owner.page.goto('/en/camps');
    await vis(owner.page, `[data-testid="camp-card"][data-name-en="${CAMP_NAME}"]`).first()
      .getByTestId('camp-roster-link').click();
    await expect(owner.page).toHaveURL(/\/camps\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const rosterUrl = owner.page.url().split('?')[0];
    const regRow = vis(owner.page, '[data-testid="camp-reg-row"]').filter({ hasText: 'Omar' }).first();
    await expect(regRow).toBeVisible({ timeout: 15_000 });
    await expect(regRow.getByTestId('camp-reg-price'), 'price snapshotted at registration').toContainText('$200');
    await expect(regRow.getByTestId('camp-pay-badge')).toHaveAttribute('data-paystate', 'pending');
    await expect(regRow.getByTestId('camp-guardian-call'), 'guardian tap-to-call').toBeVisible();

    // Invoice payer = Rana (B3) — asserted on Omar's file billing panel.
    await openFile(owner.page, 'Omar');
    await expect(
      vis(owner.page, '[data-testid="invoice-payer"]').filter({ hasText: 'Rana' }).first(),
      'camp invoice payer auto-resolved to the guardian',
    ).toBeVisible({ timeout: 15_000 });

    // ── Deposit: partial $50 on the camp invoice (D1 form via the roster badge) ──
    await owner.page.goto(rosterUrl);
    await vis(owner.page, '[data-testid="camp-reg-row"]').filter({ hasText: 'Omar' }).first()
      .getByTestId('camp-pay-badge').click();
    await expect(owner.page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const invoiceNumber = (await vis(owner.page, '[data-testid="invoice-number"]').first().textContent())!.trim();
    await vis(owner.page, '[data-testid="pay-amount-usd"]').first().fill('50');
    await vis(owner.page, '[data-testid="pay-submit"]').first().click();
    // ISO-DB: the payment commits async; under parallel-worker load the roster
    // re-read can race it. Re-navigate + re-check until the badge reflects PARTIAL.
    await untilConsistent(async () => {
      await owner.page.goto(rosterUrl);
      await expect(
        vis(owner.page, '[data-testid="camp-reg-row"]').filter({ hasText: 'Omar' }).first().getByTestId('camp-pay-badge'),
        'deposit → roster badge shows PARTIAL',
      ).toHaveAttribute('data-paystate', 'partial', { timeout: 5_000 });
    });

    // ── Guardian household billing carries the camp invoice ──
    await guardian.page.goto('/en/portal/billing');
    await expect(
      vis(guardian.page, '[data-testid="household-invoice-row"]').filter({ hasText: invoiceNumber }).first(),
      'household view shows the camp invoice',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await guardian.ctx.close();
    await anon.ctx.close();
  }
});

test('E1 · capacity race-safe (3 → full, 4th blocked) → attendance → Today card → request loop', async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await ctxFor(browser, 'owner');
  const guardian = await ctxFor(browser, 'parent'); // Rana
  const anon = await (async () => { const ctx = await browser.newContext({ locale: 'en' }); return { ctx, page: await ctx.newPage() }; })();
  try {
    // ── Fill the seeded camp (capacity 3): Karim, Omar, Lina ──
    for (const kid of ['Karim', 'Omar', 'Lina']) {
      await deskRegister(owner.page, kid, 'Summer Camp');
      await owner.page.waitForTimeout(1500);
    }

    // ── The 4th (fresh member) is BLOCKED with the clear message ──
    const unique = KID4;
    await owner.page.goto('/en/students/add');
    // UX-2: /students/add is the FormWizard (adult: identity → plan → review).
    const wiz = (tid: string) => owner.page.locator(`[data-testid="${tid}"]:visible`).first();
    await wiz('sw-name-en').fill(unique);
    await wiz('sw-phone').fill('+96170000888');
    // ISO-DB: identity → plan → review; wait for review before submitting (under
    // parallel-worker load the wizard transition lags; racing it left us on /add).
    await wiz('wizard-next').click(); // → plan
    await wiz('wizard-next').click(); // → review
    await expect(wiz('sw-review'), 'wizard reached review').toBeVisible({ timeout: 15_000 });
    await wiz('wizard-submit').click();
    // The create server action redirects to the new member; allow extra time under load.
    await expect(owner.page).toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 30_000 });

    await deskRegister(owner.page, unique, 'Summer Camp');
    await expect(
      owner.page.locator('[data-testid="app-toast"]').filter({ hasText: /full/i }).first(),
      'the 4th registration fails with the clear "camp is full" message',
    ).toBeVisible({ timeout: 15_000 });

    // Full badges: anon landing + the modal option flag.
    await anon.page.goto(`/en?gym=${encodeURIComponent(gymSlug())}`);
    await anon.page.waitForLoadState('networkidle').catch(() => {});
    await expect(
      anon.page.locator('[data-testid="landing-camp-card"][data-name-en="Summer Camp"]').first(),
    ).toHaveAttribute('data-full', 'true', { timeout: 15_000 });

    // ── Run the camp: mark today's attendance → persists ──
    await owner.page.goto('/en/camps');
    await vis(owner.page, '[data-testid="camp-card"][data-name-en="Summer Camp"]').first()
      .getByTestId('camp-roster-link').click();
    await expect(owner.page).toHaveURL(/\/camps\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const rosterUrl = owner.page.url().split('?')[0];
    await owner.page.goto(`${rosterUrl}?tab=attendance`);
    const attRow = vis(owner.page, '[data-testid="camp-att-row"]').filter({ hasText: 'Karim' }).first();
    await expect(attRow).toBeVisible({ timeout: 15_000 });
    await attRow.getByTestId('camp-att-present').click();
    await expect(
      vis(owner.page, '[data-testid="camp-att-row"]').filter({ hasText: 'Karim' }).first(),
    ).toHaveAttribute('data-att-status', 'present', { timeout: 15_000 });
    await owner.page.goto(`${rosterUrl}?tab=attendance`);
    await expect(
      vis(owner.page, '[data-testid="camp-att-row"]').filter({ hasText: 'Karim' }).first(),
      'attendance persists across reload',
    ).toHaveAttribute('data-att-status', 'present', { timeout: 15_000 });

    // ── Today card: counts + drill to the roster ──
    await owner.page.goto('/en/today');
    const campRow = vis(owner.page, '[data-testid="camp-today-row"]').filter({ hasText: 'Summer Camp' }).first();
    await expect(campRow, 'Today docks the running camp').toBeVisible({ timeout: 15_000 });
    await expect(campRow).toContainText('3 expected');
    await campRow.locator('a').first().click();
    await expect(owner.page).toHaveURL(/\/camps\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // ── Request loop: Rana requests "E1 Camp" for LINA → Inbox → approve ──
    await guardian.page.goto('/en/portal');
    await vis(guardian.page, '[data-testid="kid-chip"]').filter({ hasText: 'Lina' }).first().click();
    const e1Card = vis(guardian.page, `[data-testid="portal-camp-card"][data-name-en="${CAMP_NAME}"]`).first();
    await expect(e1Card, 'published camp card on the kid dashboard').toBeVisible({ timeout: 15_000 });
    await e1Card.getByTestId('portal-camp-request').click();
    await expect(
      vis(guardian.page, `[data-testid="portal-camp-card"][data-name-en="${CAMP_NAME}"]`).first()
        .getByTestId('portal-camp-status'),
      'request shows as pending on the kid card',
    ).toHaveAttribute('data-status', 'pending', { timeout: 15_000 });

    await owner.page.goto('/en/inbox');
    const reqRow = vis(owner.page, '[data-testid="inbox-camp-row"]').filter({ hasText: 'Lina' }).first();
    await expect(reqRow, 'camp request lands in the Inbox').toBeVisible({ timeout: 15_000 });
    await reqRow.getByTestId('inbox-camp-approve').click();
    await expect(
      vis(owner.page, '[data-testid="inbox-camp-row"]').filter({ hasText: 'Lina' }),
      'approved request leaves the inbox',
    ).toHaveCount(0, { timeout: 15_000 });

    // Confirmed + invoiced through the same RPC — the kid card flips.
    await guardian.page.goto(guardian.page.url());
    await expect(
      vis(guardian.page, `[data-testid="portal-camp-card"][data-name-en="${CAMP_NAME}"]`).first()
        .getByTestId('portal-camp-status'),
      'approval confirms the registration (same writer)',
    ).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 });
  } finally {
    await owner.ctx.close();
    await guardian.ctx.close();
    await anon.ctx.close();
  }
});
