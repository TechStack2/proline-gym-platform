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
    await page.getByRole('button', { name: /sign in/i }).click();

    // Login pushes to /dashboard; staff stay there, member/coach get routed to
    // their portal. Either way we must leave the login page.
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 20_000 });

    // Sanity: a session cookie must exist (don't proceed with an anonymous state).
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes('auth-token') || c.name.startsWith('sb-')),
      `expected a Supabase session cookie after logging in as ${email}`).toBeTruthy();

    await page.context().storageState({ path: storage });
  });
}
