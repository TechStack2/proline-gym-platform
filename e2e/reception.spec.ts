import { test, expect } from '@playwright/test';
import { shot } from './roles';

// Reception (staff) — same gym-scoped data as the owner.

test('students list is populated', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/students');
  expect(resp?.status() ?? 0, '/students should load').toBeLessThan(400);
  await shot(page, testInfo, 'reception-students');

  const cards = page.getByTestId('student-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count(), 'expected >= 1 student card').toBeGreaterThan(0);
});

test('leads page loads without error', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/leads');
  expect(resp?.status() ?? 0, '/leads should load').toBeLessThan(400);
  await shot(page, testInfo, 'reception-leads');
});

test('payments page loads without error', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/payments');
  expect(resp?.status() ?? 0, '/payments should load').toBeLessThan(400);
  await shot(page, testInfo, 'reception-payments');
});
