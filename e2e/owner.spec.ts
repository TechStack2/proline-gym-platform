import { test, expect } from '@playwright/test';
import { shot } from './roles';

// Owner (staff) — must see a populated gym and be able to add a student.
// NOTE: the dashboard layout renders content twice (responsive desktop+mobile
// shells), so we scope to `:visible` / use `.first()` to avoid strict-mode hits.

test('dashboard shows live, non-zero student count', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/dashboard');
  expect(resp?.status() ?? 0, '/dashboard should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-dashboard');

  const students = page.locator('[data-testid="stat-totalStudents"]:visible').first();
  await expect(students).toBeVisible();
  const text = (await students.textContent())?.trim() || '0';
  expect(Number(text), `dashboard student count should be > 0 (was "${text}")`).toBeGreaterThan(0);
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

  // Scope to the VISIBLE form (layout duplicates content across breakpoints).
  const textInputs = page.locator('form input:not([type="date"]):not([type="tel"]):visible');
  await textInputs.nth(0).fill(`${unique} AR`);
  await textInputs.nth(1).fill(unique);
  await page.locator('input[type="tel"]:visible').first().fill('+96170000777');

  const discipline = page.locator('form select:visible').first();
  const optionValues = await discipline.locator('option').evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v),
  );
  if (optionValues.length) await discipline.selectOption(optionValues[0]);

  await page.locator('form button[type="submit"]:visible').first().click();

  // Surface a DB/write error explicitly instead of a vague timeout.
  await page.waitForTimeout(2000);
  const errorBox = page.locator('.text-red-500:visible');
  if (await errorBox.count()) {
    const msg = (await errorBox.first().textContent())?.trim();
    await shot(page, testInfo, 'owner-add-student-error');
    throw new Error(`add-student write path FAILED with: "${msg}"`);
  }

  await expect(page, 'should redirect back to /students after save').toHaveURL(/\/students(\?.*)?$/, { timeout: 10_000 });
  await shot(page, testInfo, 'owner-add-student-result');
  await expect(
    page.locator('[data-testid="student-card"]:visible').filter({ hasText: unique }).first(),
    'newly added student should appear in the list',
  ).toBeVisible();
});
