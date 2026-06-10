// Shared harness helpers (Test-Infra hardening) — retire the per-slice tax.
import { expect, type Page, type Locator } from '@playwright/test';
import { E2E_GYM_SLUG } from './roles';

/** The run gym's slug (for the X1 public-lead `?gym=` selector + unique naming). */
export function gymSlug(): string {
  return E2E_GYM_SLUG;
}

/** A unique-per-run id for naming run-scoped rows (leads, students, …). */
export function runId(): string {
  if (process.env.GITHUB_RUN_ID) {
    return `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  }
  return Date.now().toString().slice(-8);
}

/**
 * Scope a selector to the VISIBLE copy. The `(dashboard)` layout/page-transition
 * renders content twice (one hidden), which breaks a naive `.first()`. Use this
 * instead of remembering to append `:visible` in every spec.
 */
export function vis(page: Page, selector: string): Locator {
  return page.locator(`${selector}:visible`);
}

/** The visible `(dashboard)` main shell, for chaining `.getByTestId(...)` etc. */
export function visibleShell(page: Page): Locator {
  return page.locator('main:visible').first();
}

/**
 * Assert a notification is readable by the logged-in recipient via the
 * `/notifications` PAGE (RLS-scoped full list) — NOT the bell's latest-N, which
 * is fragile as producers multiply. `page` must carry the recipient's session.
 */
export async function expectNotification(
  page: Page,
  type: string,
  opts: { locale?: string; timeout?: number } = {},
): Promise<void> {
  const locale = opts.locale ?? 'en';
  await page.goto(`/${locale}/notifications`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(
    vis(page, `[data-testid="notification-item"][data-notification-type="${type}"]`).first(),
    `the recipient should see a "${type}" notification on /notifications`,
  ).toBeVisible({ timeout: opts.timeout ?? 15_000 });
}

/** Count a notification type for the logged-in recipient on the `/notifications` page. */
export async function countNotifications(
  page: Page,
  type: string,
  opts: { locale?: string } = {},
): Promise<number> {
  const locale = opts.locale ?? 'en';
  await page.goto(`/${locale}/notifications`);
  await page.waitForLoadState('networkidle').catch(() => {});
  return vis(page, `[data-testid="notification-item"][data-notification-type="${type}"]`).count();
}
