import { test, expect } from '@playwright/test';
import { shot } from './roles';

// Owner (staff) — must see a populated gym and be able to add a student.

test('dashboard shows live, non-zero student count', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/dashboard');
  expect(resp?.status() ?? 0, '/dashboard should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-dashboard');

  const students = page.getByTestId('stat-totalStudents');
  await expect(students).toBeVisible();
  const text = (await students.textContent())?.trim() || '0';
  expect(Number(text), `dashboard student count should be > 0 (was "${text}")`).toBeGreaterThan(0);
});

test('students list is populated (cards render)', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/students');
  expect(resp?.status() ?? 0, '/students should load').toBeLessThan(400);
  await shot(page, testInfo, 'owner-students');

  const cards = page.getByTestId('student-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count(), 'expected >= 1 student card').toBeGreaterThan(0);
});

test('student names render real data (not blank)', async ({ page }) => {
  await page.goto('/en/students');
  // F1 backfilled student "Karim"; "Omar" also exists in the gym.
  await expect(
    page.getByText(/Karim|Omar/).first(),
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

  // name_ar + name_en are the two required text Inputs; phone is required tel.
  const textInputs = page.locator('input:not([type="date"]):not([type="tel"])');
  await textInputs.nth(0).fill(`${unique} AR`);
  await textInputs.nth(1).fill(unique);
  await page.locator('input[type="tel"]').fill('+96170000777');

  // discipline is a required <select> — pick the first real option.
  const discipline = page.locator('select').first();
  const optionValues = await discipline.locator('option').evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v),
  );
  if (optionValues.length) await discipline.selectOption(optionValues[0]);

  await page.getByRole('button', { name: /save/i }).click();

  // Surface a DB/write error explicitly instead of a vague timeout.
  const errorBox = page.locator('.text-red-500');
  await page.waitForTimeout(1500);
  if (await errorBox.count()) {
    const msg = (await errorBox.first().textContent())?.trim();
    await shot(page, testInfo, 'owner-add-student-error');
    throw new Error(`add-student write path FAILED with: "${msg}"`);
  }

  await expect(page, 'should redirect back to /students after save').toHaveURL(/\/students(\?.*)?$/, { timeout: 10_000 });
  await shot(page, testInfo, 'owner-add-student-result');
  await expect(page.getByText(unique).first(), 'newly added student should appear in the list').toBeVisible();
});
