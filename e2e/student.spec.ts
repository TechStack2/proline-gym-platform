import { test, expect } from './fixtures';
import { shot } from './roles';

// ISO-DB: pre-auth the default page as this worker-slot's student (per-gym session).
test.use({ authRole: 'student' });

// Student (member portal) — schedule, billing, PT must show their real data.

test('schedule shows the enrolled class', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/portal/schedule');
  expect(resp?.status() ?? 0, '/portal/schedule should load').toBeLessThan(400);
  await shot(page, testInfo, 'student-schedule');

  await expect(page.getByText('Muay Thai Beginner').first(), 'enrolled class should be visible').toBeVisible();
});

test('billing shows the invoice', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/portal/billing');
  expect(resp?.status() ?? 0, '/portal/billing should load').toBeLessThan(400);
  await shot(page, testInfo, 'student-billing');

  await expect(page.getByText('No invoices'), 'should NOT show the empty invoices state').toHaveCount(0);
  // At least one invoice amount (e.g. $55.50) must render.
  await expect(page.getByText(/\$\s?\d+(\.\d{2})?/).first(), 'an invoice amount should be visible').toBeVisible();
});

test('PT tab lists at least one package', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/portal/pt');
  expect(resp?.status() ?? 0, '/portal/pt should load').toBeLessThan(400);
  await shot(page, testInfo, 'student-pt');

  await expect(
    page.getByRole('button', { name: /request this package/i }).first(),
    'at least one PT package should be offered',
  ).toBeVisible();
});
