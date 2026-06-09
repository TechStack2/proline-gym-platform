import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';

/**
 * Notification READ-PATH slice (Cycle 5 / Phase 0 / Prompt F2 — Workstream B).
 *
 * The PT slice (pt.spec.ts) proves approval → invoice → roster → decrement, but it
 * never checks the notification BELL. This spec closes that hole: it logs in as the
 * *recipient* of the producer-emitted notifications and asserts they actually SEE
 * the notification — the independent corroboration of the producer root cause.
 *
 *   - student@  is the recipient of `pt_approved`  ("PT request approved").
 *   - coach@    is the recipient of `pt_assigned`  ("PT sessions assigned").
 *
 * The required rows already exist on `main` (seeded/emitted via migration 000021's
 * SECURITY DEFINER `pt_emit_approved_notifications`), so this does NOT wait for the
 * producer-fix workstream. If the recipient can READ the row through the consumer's
 * RLS-scoped query, the recipient `user_id` is a valid profile id in the gym → that
 * is hard evidence supporting "World B" (the INSERT policy correctly rejected a row
 * built with a *wrong* id, not a fragile substrate).
 *
 * Read-path surfaces asserted:
 *   1. The full /notifications page (under (dashboard); reachable by every authed
 *      role, RLS-scoped to auth.uid()) — renders the recipient's notification.
 *   2. The notification BELL + dropdown — the functional <NotificationBell> is in
 *      the MOBILE dashboard top bar (DashboardLayoutClient, `block md:hidden`); the
 *      desktop Header bell is a static stub. So we visit /notifications at a mobile
 *      viewport, assert the bell renders, open it, and assert the dropdown lists the
 *      recipient's notification type.
 *
 * The (dashboard) layout renders content twice across breakpoints, so we scope to
 * the VISIBLE copy (`:visible`) and key off the surgical `data-testid`s added to the
 * bell/list (data-notification-type carries the type for a robust, text-independent
 * selector) plus the rendered i18n text.
 */

const MOBILE = { width: 390, height: 844 }; // iPhone-ish: forces md:hidden bell

type Surface = { type: string; title: RegExp };

const EXPECT: Record<'student' | 'coach', Surface> = {
  student: { type: 'pt_approved', title: /PT request approved/i },
  coach: { type: 'pt_assigned', title: /PT sessions assigned/i },
};

async function contextFor(
  browser: Browser,
  role: keyof typeof ROLES,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: ROLES[role].storage,
    locale: 'en',
    viewport: MOBILE,
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function assertRecipientSeesNotification(
  page: Page,
  testInfo: import('@playwright/test').TestInfo,
  role: 'student' | 'coach',
) {
  const { type, title } = EXPECT[role];

  // ── Surface 1: the full /notifications page (RLS-scoped to this auth user) ──
  const resp = await page.goto('/en/notifications');
  expect(resp?.status() ?? 0, '/notifications should load for the recipient').toBeLessThan(400);

  // The notification must NOT be the empty state — the recipient can read its row.
  await expect(
    page.getByText('No notifications'),
    `${role} should NOT see the empty notifications state (recipient can read the row)`,
  ).toHaveCount(0);

  // The recipient's notification renders, keyed off its type (robust, text-independent)
  // AND its rendered i18n title (proves the render path resolves the i18n key).
  const pageItem = page
    .locator(`[data-testid="notification-item"][data-notification-type="${type}"]:visible`)
    .first();
  await expect(
    pageItem,
    `${role} should see a "${type}" notification on the /notifications page`,
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageItem,
    `the "${type}" notification should render its i18n title`,
  ).toContainText(title);
  await shot(page, testInfo, `notifications-${role}-page`);

  // ── Surface 2: the BELL + dropdown (mobile dashboard top bar) ──
  const bell = page.locator('[data-testid="notification-bell"]:visible').first();
  await expect(
    bell,
    `the functional notification bell should render for ${role} (mobile dashboard top bar)`,
  ).toBeVisible({ timeout: 15_000 });

  await bell.click();

  const dropdownList = page.locator('[data-testid="notification-dropdown-list"]:visible').first();
  await expect(
    dropdownList,
    'clicking the bell should open the notification dropdown',
  ).toBeVisible({ timeout: 10_000 });

  const dropdownItem = dropdownList
    .locator(`[data-testid="notification-item"][data-notification-type="${type}"]`)
    .first();
  await expect(
    dropdownItem,
    `the bell dropdown should list the recipient's "${type}" notification (latest 5)`,
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    dropdownItem,
    `the dropdown "${type}" notification should render its i18n title`,
  ).toContainText(title);
  await shot(page, testInfo, `notifications-${role}-bell`);
}

test('notifications: student@ SEES the pt_approved notification (bell + page)', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const student = await contextFor(browser, 'student');
  try {
    await assertRecipientSeesNotification(student.page, testInfo, 'student');
  } finally {
    await student.ctx.close();
  }
});

test('notifications: coach@ SEES the pt_assigned notification (bell + page)', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const coach = await contextFor(browser, 'coach');
  try {
    await assertRecipientSeesNotification(coach.page, testInfo, 'coach');
  } finally {
    await coach.ctx.close();
  }
});
