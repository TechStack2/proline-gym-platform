import { test as setup, expect } from '@playwright/test';
import { ALL_ROLES, E2E_PASSWORD, E2E_WORKERS, roleEmail, roleStorage } from './roles';

// ISO-DB: each Playwright WORKER runs against its OWN seeded gym, so we log in
// every role on EVERY worker's gym and persist a storageState per (worker, role).
// (Legacy single-gym: E2E_WORKERS defaults to 1 → one set of files, as before.)
// Login uses the REAL login form; a failure fails the run loudly (never bypass auth).
for (let w = 0; w < E2E_WORKERS; w++) {
  for (const role of ALL_ROLES) {
    const email = roleEmail(role, w);
    const storage = roleStorage(role, w);

    setup(`authenticate w${w} ${role}`, async ({ page }) => {
      await page.goto('/en/auth/login');
      await page.locator('#email').fill(email);
      await page.locator('#password').fill(E2E_PASSWORD);
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
}
