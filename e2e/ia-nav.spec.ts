import { test, expect, type Page, type Browser } from '@playwright/test';
import { ROLES } from './roles';
import { vis, expectNotification } from './helpers';

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
const RUN = Date.now().toString().slice(-6);
const CLASS_NAME = `IA Class ${RUN}`;

async function ctxFor(browser: Browser, role: keyof typeof ROLES, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en', ...(viewport ? { viewport } : {}) });
  return { ctx, page: await ctx.newPage() };
}
async function noMissing(page: Page) {
  await expect(page.locator('body')).not.toContainText('MISSING_MESSAGE');
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
        vis(mobile.page, `[role="tab"][aria-controls="tabpanel-${key}"]`).first(),
        `mobile tab bar has ${key}`,
      ).toBeVisible({ timeout: 15_000 });
    }
    await expect(vis(mobile.page, '[role="tab"][aria-controls="tabpanel-money"]')).toHaveCount(0); // in More, not primary
  } finally {
    await mobile.ctx.close();
  }
});

test('IA-1 · cross-role: portal request → staff inbox badge + inline approve → active+invoice + bell', async ({ browser }) => {
  test.setTimeout(200_000);
  const owner = await ctxFor(browser, 'owner');
  const student = await ctxFor(browser, 'student'); // Karim
  try {
    // ── Owner creates a class with a monthly fee (existing B2 modal flow) ──
    await owner.page.goto('/en/classes');
    await vis(owner.page, '[data-testid="add-class-btn"]').click();
    await owner.page.getByTestId('class-name-en').fill(CLASS_NAME);
    await owner.page.getByTestId('class-discipline').selectOption({ index: 1 });
    await owner.page.getByTestId('class-coach-select').selectOption({ index: 1 });
    await owner.page.getByTestId('class-capacity').fill('5');
    await owner.page.getByTestId('class-monthly-fee').fill('30');
    await owner.page.getByTestId('class-submit').click();
    await expect(vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first())
      .toBeVisible({ timeout: 15_000 });
    await vis(owner.page, '[data-testid="class-card"]').filter({ hasText: CLASS_NAME }).first().click();
    await expect(owner.page).toHaveURL(/\/classes\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const detailUrl = owner.page.url();

    // ── Karim requests it in the portal ──
    await student.page.goto('/en/portal/classes');
    const card = vis(student.page, '[data-testid="portal-class-card"]').filter({ hasText: CLASS_NAME }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByTestId('request-btn').click();
    await expect(card.getByTestId('reg-status')).toHaveAttribute('data-status', 'requested', { timeout: 15_000 });

    // ── Staff inbox: badge + row → INLINE approve (B2 action, guards in the RPC) ──
    await owner.page.goto('/en/inbox');
    await expect(vis(owner.page, '[data-testid="inbox-badge"]').first(), 'sidebar inbox badge shows pending work')
      .toBeVisible({ timeout: 15_000 });
    const row = vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: 'Karim' }).filter({ hasText: CLASS_NAME }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await noMissing(owner.page);
    await row.getByTestId('inbox-approve').click();
    await expect(
      vis(owner.page, '[data-testid="inbox-reg-row"]').filter({ hasText: CLASS_NAME }),
      'approved request leaves the inbox queue',
    ).toHaveCount(0, { timeout: 15_000 });

    // ── Round-trip state: active + invoiced + on the roster (existing B2 surfaces) ──
    await owner.page.goto(detailUrl);
    const active = vis(owner.page, '[data-testid="reg-row"][data-status="active"]').filter({ hasText: 'Karim' }).first();
    await expect(active).toBeVisible({ timeout: 15_000 });
    await expect(active).toContainText('Invoiced');
    await expect(vis(owner.page, '[data-testid="enrolled-student"]').filter({ hasText: 'Karim' }).first()).toBeVisible();

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
