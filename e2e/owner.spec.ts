import { test, expect } from './fixtures';
import { shot } from './roles';

// ISO-DB: pre-auth the default page as this worker-slot's owner (per-gym session).
test.use({ authRole: 'owner' });

// Owner (staff) — must see a populated gym and be able to add a student.
// NOTE: the dashboard layout renders content twice (responsive desktop+mobile
// shells), so we scope to `:visible` / use `.first()` to avoid strict-mode hits.

test('staff landing (/dashboard → /today) shows live gym data', async ({ page }, testInfo) => {
  // IA-1: the schema-shaped dashboard is retired; /dashboard redirects to the
  // /today front-desk view, which must render the seeded class with a live
  // enrolled count (the old stat-card assertion's equivalent).
  const resp = await page.goto('/en/dashboard');
  expect(resp?.status() ?? 0, '/dashboard should load').toBeLessThan(400);
  await expect(page, '/dashboard redirects to /today').toHaveURL(/\/en\/today/);
  await shot(page, testInfo, 'owner-today');

  const classRow = page.locator('[data-testid="today-class-row"]:visible').first();
  await expect(classRow, "today's seeded class renders").toBeVisible();
  // Enrolled/capacity reflects the live roster (seed enrolls 2 students).
  await expect(classRow, 'live enrolled count renders').toContainText(/[1-9]\d*\/\d+/);
});

test('students list is populated (cards render)', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/students');
  expect(resp?.status() ?? 0, '/students should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-students');

  await expect(page.getByText(/no students/i), 'should NOT show the empty state').toHaveCount(0);
  const cards = page.locator('[data-testid="student-card"]:visible');
  expect(await cards.count(), 'expected >= 1 visible student card').toBeGreaterThan(0);
});

test('student names render real data (not blank)', async ({ page }) => {
  await page.goto('/en/students');
  // F1 backfilled student "Karim"; "Omar" also exists in the gym. Scope to a
  // VISIBLE card (the layout duplicates content across breakpoints).
  await expect(
    page.locator('[data-testid="student-card"]:visible').filter({ hasText: /Karim|Omar/ }).first(),
    'expected a real student name to be visible on the cards',
  ).toBeVisible();
});

test('leads page loads without error', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/leads');
  expect(resp?.status() ?? 0, '/leads should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-leads');
});

test('payments page loads without error', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/payments');
  expect(resp?.status() ?? 0, '/payments should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-payments');
});

test('add-student write path persists and the new student appears (F1 #3)', async ({ page }, testInfo) => {
  const unique = `E2E ${Date.now()}`;
  await page.goto('/en/students/add');

  // UX-2: /students/add is the FormWizard now (identity → plan → review for an
  // adult; no DOB ⇒ no guardian step). Scope :visible — double-shell page.
  const wiz = (tid: string) => page.locator(`[data-testid="${tid}"]:visible`).first();
  await wiz('sw-name-en').fill(unique);
  await wiz('sw-name-ar').fill(`${unique} AR`);
  await wiz('sw-phone').fill('+96170000777');
  await wiz('wizard-next').click(); // → plan (skip: no plan)
  await wiz('wizard-next').click(); // → review
  await expect(wiz('sw-review')).toContainText(unique);
  await wiz('wizard-submit').click();

  await expect(page, 'should land on the new member (create_student persisted)')
    .toHaveURL(/\/students\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await shot(page, testInfo, 'owner-add-student-result');
  await page.goto('/en/students');
  await expect(
    page.locator('[data-testid="student-card"]:visible').filter({ hasText: unique }).first(),
    'newly added student should appear in the list',
  ).toBeVisible({ timeout: 15_000 });
});
