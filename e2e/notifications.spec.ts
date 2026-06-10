import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';
import { expectNotification, vis } from './helpers';

/**
 * Notification READ-PATH slice (Cycle 5 / Phase 0 / Prompt F2 — Workstream B).
 *
 * pt.spec proves approval → invoice → roster → decrement but never checks that the
 * RECIPIENT can read the producer-emitted notification. This logs in as the
 * recipient and asserts it on the RLS-scoped `/notifications` page:
 *   - student@ → `pt_approved` ("PT request approved")
 *   - coach@   → `pt_assigned` ("PT sessions assigned")
 *
 * Read via the /notifications PAGE (full RLS-scoped list), NOT the bell's latest-N
 * window — the page proof is robust as the platform adds producers (Test-Infra
 * hardening; the ephemeral per-run gym keeps the recipient's list small anyway).
 */

type Surface = { type: string; title: RegExp };

const EXPECT: Record<'student' | 'coach', Surface> = {
  student: { type: 'pt_approved', title: /PT request approved/i },
  coach: { type: 'pt_assigned', title: /PT sessions assigned/i },
};

async function contextFor(
  browser: Browser,
  role: keyof typeof ROLES,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: ROLES[role].storage, locale: 'en' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function assertRecipientSeesNotification(
  page: Page,
  testInfo: import('@playwright/test').TestInfo,
  role: 'student' | 'coach',
) {
  const { type, title } = EXPECT[role];

  // The recipient sees its notification on the /notifications page (RLS-scoped to
  // auth.uid()), keyed off the robust data-notification-type AND its i18n title.
  await expectNotification(page, type);
  await expect(
    vis(page, `[data-testid="notification-item"][data-notification-type="${type}"]`).first(),
    `the "${type}" notification should render its i18n title`,
  ).toContainText(title);
  await shot(page, testInfo, `notifications-${role}-page`);
}

test('notifications: student@ SEES the pt_approved notification', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const student = await contextFor(browser, 'student');
  try {
    await assertRecipientSeesNotification(student.page, testInfo, 'student');
  } finally {
    await student.ctx.close();
  }
});

test('notifications: coach@ SEES the pt_assigned notification', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const coach = await contextFor(browser, 'coach');
  try {
    await assertRecipientSeesNotification(coach.page, testInfo, 'coach');
  } finally {
    await coach.ctx.close();
  }
});
