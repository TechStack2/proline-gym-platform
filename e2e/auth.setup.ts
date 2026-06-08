import { test as setup, expect } from '@playwright/test';
import { ROLES, DEMO_PASSWORD, type Role } from './roles';

// Log in once per role via the real login form and persist the session so the
// portal specs start authenticated. If login fails, the whole run fails loudly
// (we never bypass auth).
for (const role of Object.keys(ROLES) as Role[]) {
  const { email, storage } = ROLES[role];

  setup(`authenticate ${role}`, async ({ page }) => {
    await page.goto('/en/auth/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(DEMO_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Login pushes to /dashboard; staff stay there, member/coach get routed to
    // their portal. Either way we must leave the login page — but if the login
    // errors, surface that message instead of a vague timeout.
    const left = await Promise.race([
      page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 20_000 }).then(() => 'ok' as const).catch(() => 'timeout' as const),
      page.locator('.bg-red-50').waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'error' as const).catch(() => 'none' as const),
    ]);
    if (left !== 'ok') {
      const err = (await page.locator('.bg-red-50').textContent().catch(() => null))?.trim();
      throw new Error(`login as ${email} did not complete (${left})${err ? `: ${err}` : ''}`);
    }

    // Sanity: a session cookie must exist (don't proceed with an anonymous state).
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes('auth-token') || c.name.startsWith('sb-')),
      `expected a Supabase session cookie after logging in as ${email}`).toBeTruthy();

    await page.context().storageState({ path: storage });
  });
}
