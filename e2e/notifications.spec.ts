import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { ROLES, shot } from './roles';
import { expectNotification, vis } from './helpers';

/**
 * Notification READ-PATH slice (Cycle 5 / Phase 0 / Prompt F2 — Workstream B).
 *
 * Asserts the RECIPIENT can read the producer-emitted notification on the
 * RLS-scoped `/notifications` page:
 *   - student@ → `pt_approved` ("PT request approved")
 *   - coach@   → `pt_assigned` ("PT sessions assigned")
 *
 * ISO-DB: SELF-SUFFICIENT. Each worker runs its own isolated gym, so this spec
 * EMITS the pair itself in `beforeAll` (student requests a PT package → owner
 * approves it, which fires pt_approved to the student + pt_assigned to the coach)
 * rather than relying on the separate `pt` spec's side effects landing in the
 * same gym. Read via the /notifications PAGE (full RLS-scoped list), NOT the
 * bell's latest-N window — robust as producers multiply.
 */

const PACKAGE_EN = 'Single PT Session';
const COACH_EN = 'Sami'; // seeded coach (coach@ login)

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

// Emit pt_approved (student) + pt_assigned (coach) by driving a real
// request → approve, so the recipient has something to read in THIS gym.
async function seedPtApproval(browser: Browser, testInfo: import('@playwright/test').TestInfo) {
  // 1. student requests the single-session package (+ preferred coach).
  const student = await contextFor(browser, 'student');
  try {
    await student.page.goto('/en/portal/pt');
    const card = student.page.locator(
      `[data-testid="pt-package-card"][data-package-name="${PACKAGE_EN}"]`,
    );
    await expect(card, `the "${PACKAGE_EN}" package should be offered`).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: /request this package/i }).click();
    await card.locator('select').selectOption({ label: COACH_EN });
    await card.getByRole('button', { name: /send request/i }).click();
    await expect(
      student.page.getByText(/request sent/i).first(),
      'student should see the request-sent confirmation',
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await student.ctx.close();
  }

  // 2. owner approves the newest pending request → fires pt_approved + pt_assigned.
  const owner = await contextFor(browser, 'owner');
  try {
    await owner.page.goto('/en/pt');
    const pendingCard = owner.page.locator('[data-testid="pt-pending-request"]:visible').first();
    await expect(pendingCard, 'a pending request should surface for staff').toBeVisible({ timeout: 15_000 });
    // J3 PT-GUARDS: coach picked via chips now (raw select removed) + required to
    // approve. Click the coach chip if a coach-less request surfaced the picker.
    const coachChip = pendingCard.getByTestId('pt-req-coach-chip').filter({ hasText: COACH_EN }).first();
    if (await coachChip.count()) await coachChip.click();
    await pendingCard.getByTestId('pt-req-approve').click();
    const toast = owner.page.locator('[data-sonner-toast]');
    await toast.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    const toastText = (await toast.allTextContents()).join(' | ');
    await shot(owner.page, testInfo, 'notifications-seed-approved');
    expect(toastText, `approval should succeed (toast was: "${toastText}")`).toMatch(/approved|invoiced/i);
  } finally {
    await owner.ctx.close();
  }
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

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  await seedPtApproval(browser, testInfo);
});

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
