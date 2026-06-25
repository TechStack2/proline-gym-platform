import { test, expect } from './fixtures';
import { shot } from './roles';

// ISO-DB: pre-auth the default page as this worker-slot's coach (per-gym session).
test.use({ authRole: 'coach' });

// Coach (mobile app) — the home must resolve a real coach, and the roster must
// include the enrolled student. NOTE: /coach shows TODAY's classes only, so we
// don't assert a specific class there (date-dependent); the roster is stable.

test('coach home resolves a real coach (not the empty profile state)', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/coach');
  expect(resp?.status() ?? 0, '/coach should load').toBeLessThan(400);
  await shot(page, testInfo, 'coach-home');

  await expect(
    page.getByText(/coach profile not found|profil coach introuvable|لم يتم العثور/i),
    'coach profile should resolve (F1 linked coach@ to a coaches row)',
  ).toHaveCount(0);
});

test('roster includes the enrolled student', async ({ page }, testInfo) => {
  const resp = await page.goto('/en/coach/students');
  expect(resp?.status() ?? 0, '/coach/students should load').toBeLessThan(400);
  await shot(page, testInfo, 'coach-roster');

  await expect(
    page.getByText('Karim').first(),
    'the enrolled student should appear in the coach roster',
  ).toBeVisible();
});
