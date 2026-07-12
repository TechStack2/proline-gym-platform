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
 * Scope a selector to the VISIBLE copy.
 *
 * DOUBLE-SHELL update: the staff `(dashboard)` now mounts children ONCE (single
 * responsive shell), so for dashboard PAGE content `:visible` is a harmless no-op
 * rather than the old double-mount disambiguator. KEPT because (a) shell CHROME
 * still has CSS-hidden responsive copies (mobile vs desktop headers), and
 * (b) specs also target transient UI (closed modals/sheets) where visible-scoping
 * still matters. No assertion is weakened by keeping it.
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

/**
 * Drive the UX-1 Add-Class wizard end-to-end (chips/pills, no dropdowns).
 * Starts from /<locale>/classes with the wizard CLOSED. Monday is preselected;
 * `extraDays` adds day pills (0=Sun…6=Sat). Returns after the wizard reports
 * success (the class is inserted + the list refreshed).
 */
export async function createClassViaWizard(
  page: Page,
  opts: { nameEn: string; capacity: string; fee: string; extraDays?: number[]; presetTime?: string },
): Promise<void> {
  await vis(page, '[data-testid="add-class-btn"]').click();
  // Step 1 — basics
  await page.getByTestId('class-name-en').fill(opts.nameEn);
  await page.locator('[data-testid="wizard-discipline-chip"]').first().click();
  await page.locator('[data-testid="wizard-coach-chip"]').first().click();
  await page.getByTestId('wizard-next').click();
  // Step 2 — days + time
  for (const d of opts.extraDays ?? []) {
    await page.locator(`[data-testid="wizard-day-pill"][data-dow="${d}"]`).click();
  }
  if (opts.presetTime) {
    await page.locator(`[data-testid="wizard-preset"][data-time="${opts.presetTime}"]`).click();
  }
  await page.getByTestId('wizard-next').click();
  // Step 3 — capacity / fee
  await page.getByTestId('class-capacity').fill(opts.capacity);
  await page.getByTestId('class-monthly-fee').fill(opts.fee);
  await page.getByTestId('wizard-next').click();
  // Step 4 — review → create
  await page.getByTestId('wizard-submit').click();
  await expect(page.getByTestId('wizard-success')).toBeVisible({ timeout: 15_000 });
  // The wizard auto-closes shortly after success.
  await expect(page.locator('[data-testid="class-wizard"]')).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Wait for the SIGNAL, not a fixed timeout (STABILIZE-E2E). Re-runs `action`
 * until it passes — for **eventually-consistent reads** where a one-shot
 * `goto` + `expect(…,{timeout})` can observe a stale snapshot (PostgREST replica
 * lag, ISR/landing cache, SW-served stale, a queue still draining). `action`
 * MUST be idempotent: it re-runs on every attempt, so it may only
 * navigate/revalidate/read + assert — NEVER perform a one-shot mutation
 * (a click that books/logs/sells) inside it. Keep the inner per-attempt
 * `expect` timeout short so retries cycle.
 */
export async function untilConsistent(
  action: () => Promise<void>,
  opts: { timeout?: number; intervals?: number[] } = {},
): Promise<void> {
  await expect(action).toPass({
    timeout: opts.timeout ?? 40_000,
    intervals: opts.intervals ?? [500, 1_000, 2_000, 3_000, 5_000],
  });
}

/**
 * AWAITEFFECT (MJ-4 addendum — the J6 poll-DB-commit-first idiom, generalized).
 *
 * For approve/mutate flows where a UI assertion reflects a SERVER COMMIT that can
 * lag a read replica (staff approves → renew_now/freeze_membership + the request
 * flips status → the optimistic row hides). A one-shot UI assert — even with a
 * budget — can observe a stale snapshot and flake. Poll a SERVICE-ROLE read
 * (spec-side, RLS-free) for the COMMITTED effect first; only then assert the UI
 * with its normal budget, so the UI check is deterministic.
 *
 * `pollFn` MUST be a read-only predicate returning truthy once the effect is
 * durable — it re-runs every `interval`; NEVER perform a mutation inside it.
 * Throws (fails the test) if the effect never commits within `budget`.
 */
export async function awaitEffect(
  pollFn: () => boolean | Promise<boolean>,
  opts: { budget?: number; interval?: number } = {},
): Promise<void> {
  await expect
    .poll(async () => (await pollFn()) === true, {
      timeout: opts.budget ?? 25_000,
      intervals: opts.interval ? [opts.interval] : [500, 1_000, 2_000],
      message: 'awaitEffect: the backend effect did not commit before the UI assertion',
    })
    .toBe(true);
}
