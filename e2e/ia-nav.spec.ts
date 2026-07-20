import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, visibleShell, expectNotification, untilConsistent } from './helpers';

/**
 * IA-1 — journey-centric nav + Inbox + Today (Cycle 5 / V1).
 *
 * Recomposition proof against the ephemeral run gym:
 *  1. The owner's nav is the 7 workspaces from the SINGLE shared config —
 *     desktop sidebar and mobile tabs agree (the old two-config divergence,
 *     incl. the silently-dead desktop Coaches entry, is gone); /dashboard
 *     redirects to /today; /today lists the seeded class (scheduled every
 *     weekday by the TI seed) linking into attendance marking.
 *  2. Cross-role inbox round-trip: Karim requests a class in the portal →
 *     the staff /inbox badges + lists it → INLINE approve (reusing the B2
 *     action) → registration active + invoiced + roster + Karim notified,
 *     and Karim's portal shell shows the unread bell badge (IA-1 mount).
 */
async function ctxFor(browser: Browser, role: keyof typeof ROLES, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', ...(viewport ? { viewport } : {}) });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
}

/**
 * Create a class through the UX-1 wizard and PROVE it is fee-bearing before use.
 *
 * FLAKE-HEAL: the shared createClassViaWizard fills the step-3 fields (capacity +
 * monthly fee) then immediately advances and submits. Under fast (solo) timing the
 * submit can read the fee/capacity state before React commits the fill → the class
 * persists with a NULL fee. That silently breaks THIS test's core proof: a
 * zero/NULL net means _activate_class_registration issues NO invoice, so the
 * approved registration can never show "Invoiced" (and, once Lane B's BILL-GUARDS
 * lands, NULL-fee activation will RAISE outright). So drive the wizard here and, on
 * the REVIEW step, wait until the committed fee ($fee) is shown before submitting —
 * the review renders exactly the state the submit persists, so this guarantees the
 * write. Fee-explicit by design so it survives the BILL-GUARDS change.
 */
async function createFeeClass(page: Page, nameEn: string, capacity: string, fee: string) {
  await page.getByTestId('add-class-btn').click();
  await page.getByTestId('class-name-en').fill(nameEn);
  await page.locator('[data-testid="wizard-discipline-chip"]').first().click();
  await page.locator('[data-testid="wizard-coach-chip"]').first().click();
  await page.getByTestId('wizard-next').click();   // basics → schedule (Monday preselected)
  await page.getByTestId('wizard-next').click();   // schedule → pricing
  await page.getByTestId('class-capacity').fill(capacity);
  await page.getByTestId('class-monthly-fee').fill(fee);
  await page.getByTestId('wizard-next').click();   // pricing → review
  // COMMIT GUARANTEE: the review shows the fee/capacity STATE that submit persists,
  // so waiting for "$fee" here forces the step-3 fills to be committed before submit
  // (capacity is filled in the same step → committed in the same render).
  await expect(
    page.locator('[data-testid="class-wizard"]'),
    'wizard committed the monthly fee before submit',
  ).toContainText(`$${fee}`);
  await page.getByTestId('wizard-submit').click();
  await expect(page.getByTestId('wizard-success')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="class-wizard"]')).toHaveCount(0, { timeout: 10_000 });
}

const WORKSPACES = ['today', 'inbox', 'members', 'schedule', 'money', 'team', 'settings'] as const;

test('IA-1 · 7-workspace nav (desktop = mobile), /dashboard→/today, /today lists the seeded class', async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await ctxFor(browser, 'owner');
  try {
    // /dashboard → /today redirect (old bookmarks keep working).
    await owner.page.goto('/en/dashboard');
    await expect(owner.page).toHaveURL(/\/en\/today/, { timeout: 15_000 });

    // Desktop sidebar = exactly the 7 workspaces (+ profile pinned at the bottom).
    for (const key of WORKSPACES) {
      await expect(vis(owner.page, `[data-testid="nav-${key}"]`).first(), `desktop nav has ${key}`).toBeVisible();
    }
    await expect(vis(owner.page, '[data-testid="nav-profile"]').first()).toBeVisible();
    // The retired schema tabs are OUT of the nav (routes stay URL-reachable).
    const sidebar = vis(owner.page, '[data-testid="desktop-sidebar"]').first();
    for (const gone of ['rentals', 'camps', 'reports', 'attendance', 'invoices', 'leads', 'dashboard']) {
      await expect(sidebar.locator(`a[href*="/${gone}"]`), `${gone} not in desktop nav`).toHaveCount(0);
    }

    // /today: the seeded class (TI seeds Muay Thai Beginner on EVERY weekday) →
    // deterministic row, linking into the existing attendance-marking flow.
    const classRow = vis(owner.page, '[data-testid="today-class-row"]').filter({ hasText: 'Muay Thai Beginner' }).first();
    await expect(classRow).toBeVisible({ timeout: 15_000 });
    await expect(vis(owner.page, '[data-testid="quick-record-payment"]').first()).toBeVisible();
    await expect(vis(owner.page, '[data-testid="today-tally"]').first()).toBeVisible();
    await noMissing(owner.page);
    await classRow.click();
    await expect(owner.page).toHaveURL(/\/en\/attendance/, { timeout: 15_000 });

    // The marking flow is REAL end-to-end (IA-1 repaired the admin attendance
    // reads/writes against the actual schema): the seeded roster renders with
    // names, and a one-tap mark persists (badge renders from the saved record).
    // NB: scope via the visible shell — `vis()` is CSS-only (no text= engine).
    const shell = visibleShell(owner.page);
    await expect(shell.getByText('Muay Thai Beginner').first()).toBeVisible({ timeout: 15_000 });
    const omarRow = shell.locator('div.rounded-lg.border').filter({ hasText: 'Omar' }).first();
    await expect(omarRow, 'roster names render (profiles join)').toBeVisible();
    await omarRow.locator('button').first().click(); // first status button = present
    await expect(omarRow.getByText(/^Present$/), 'mark persisted → status badge').toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
  } finally {
    await owner.ctx.close();
  }

  // Mobile (≤767px shell): the same config drives the tab bar — primary tabs
  // Today/Inbox/Members/Schedule + More, in agreement with desktop.
  const mobile = await ctxFor(browser, 'owner', { width: 390, height: 844 });
  try {
    await mobile.page.goto('/en/today');
    for (const key of ['today', 'inbox', 'members', 'schedule', 'more']) {
      await expect(
        vis(mobile.page, `[data-testid="tab-${key}"]`).first(),
        `mobile tab bar has ${key}`,
      ).toBeVisible({ timeout: 15_000 });
    }
    // W1-FOUNDATION §2.2: the staff bar is now the shared TabBar primitive — real
    // nav ARIA (<nav> + aria-current) instead of the bogus role="tablist"/"tab" +
    // aria-controls="tabpanel-*" it never had panels for (DA-60). Target the tabs by
    // their stable testids.
    await expect(vis(mobile.page, '[data-testid="tab-money"]')).toHaveCount(0); // in More, not primary
  } finally {
    await mobile.ctx.close();
  }
});

test('IA-1 · cross-role: portal request → staff inbox badge + inline approve → active+invoice + bell', async ({ browser }) => {
  test.setTimeout(200_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  // Own-fixture: a globally-unique class name per invocation so retries (a fresh
  // worker each) and sibling specs never share a card in the run gym's list.
  const className = `IA Class ${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
  try {
    // ── Owner creates a fee-bearing class (UX-1 wizard; fee committed before submit) ──
    await owner.page.goto('/en/classes');
    await createFeeClass(owner.page, className, '5', '30');
    await expect(vis(owner.page, '[data-testid="class-card"]').filter({ hasText: className }).first())
      .toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="class-card"]').filter({ hasText: className }).first().click();
    await expect(owner.page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const detailUrl = owner.page.url();

    // ── Karim requests it in the portal ──
    await student.page.goto('/en/portal/classes?view=browse');
    const card = vis(student.page, '[data-testid="portal-class-card"]').filter({ hasText: className }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByTestId('request-btn').click();
    await expect(card.getByTestId('reg-status')).toHaveAttribute('data-status', 'requested', { timeout: 15_000 });

    // ── Staff inbox: badge + row → INLINE approve (B2 action, guards in the RPC) ──
    await owner.page.goto('/en/inbox');
    await expect(vis(owner.page, '[data-testid="inbox-badge"]').first(), 'sidebar inbox badge shows pending work')
      .toBeVisible({ timeout: 15_000 });
    const row = vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: 'Karim' }).filter({ hasText: className }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
    await row.getByTestId('inbox-approve').click();
    await expect(
      vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: className }),
      'approved request leaves the inbox queue',
    ).toHaveCount(0, { timeout: 15_000 });

    // ── Round-trip state: active + invoiced + on the roster (existing B2 surfaces) ──
    // Reload-consistent: re-fetch the class detail until the approve's commit is
    // visible (active + Invoiced + roster), rather than reading a single snapshot.
    await untilConsistent(async () => {
      await owner.page.goto(detailUrl);
      const active = vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Karim' }).first();
      await expect(active).toBeVisible({ timeout: 5_000 });
      await expect(active).toContainText('Invoiced');
      await expect(vis(owner.page, '[data-testid="enrolled-student"]').filter({ hasText: 'Karim' }).first()).toBeVisible({ timeout: 5_000 });
    }, { timeout: 40_000 });

    // ── Karim is notified + his portal shell shows the unread bell badge (IA-1) ──
    await expectNotification(student.page, 'class_approved');
    await student.page.goto('/en/portal');
    await expect(
      vis(student.page, '[data-testid="notification-bell-badge"]').first(),
      'portal bell shows the unread badge',
    ).toBeVisible({ timeout: 15_000 });
    await noMissing(student.page);
  } finally {
    await owner.ctx.close();
    await student.ctx.close();
  }
});
