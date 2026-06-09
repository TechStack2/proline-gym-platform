import { defineConfig, devices } from '@playwright/test';

/**
 * Verification harness (Prompt V1). "Done" = observed in a browser against the
 * coherent Supabase DB — not tsc/build. Logs in as each demo role, asserts each
 * portal renders REAL data, and screenshots every portal.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    locale: 'en',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'owner',
      dependencies: ['setup'],
      testMatch: /owner\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/owner.json' },
    },
    {
      name: 'reception',
      dependencies: ['setup'],
      testMatch: /reception\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/reception.json' },
    },
    {
      name: 'coach',
      dependencies: ['setup'],
      testMatch: /coach\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/coach.json' },
    },
    {
      name: 'student',
      dependencies: ['setup'],
      testMatch: /student\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/student.json' },
    },
    {
      // Cross-portal slice: switches roles internally (opens a fresh context
      // per role from e2e/.auth/*.json), so it must NOT pin a single session.
      name: 'pt',
      dependencies: ['setup'],
      testMatch: /pt\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Lead → Active-Member cross-portal slice (Prompt 23-R): origination both
      // ways (anon web submit + staff Add Lead) → trial (coach handoff) → atomic
      // convert → member on roster. Switches roles internally (fresh context per
      // role from e2e/.auth/*.json + one anon context), so it must NOT pin a
      // single session.
      name: 'leads',
      dependencies: ['setup'],
      testMatch: /leads\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Member Activity Loop cross-portal slice (Prompt 24-R): enroll → attend
      // (transition-guarded absence) → atomic promote → /portal/progress. Switches
      // roles internally (fresh context per role), so it must NOT pin a session.
      name: 'activity-loop',
      dependencies: ['setup'],
      testMatch: /activity-loop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Notification read-path slice (Prompt F2 / Workstream B): logs in as the
      // RECIPIENT (student → pt_approved, coach → pt_assigned) and asserts they
      // SEE the notification on the bell + /notifications page. Opens a fresh
      // context per role internally (no pinned session). Depends on `pt` so a
      // fresh approval has emitted the rows in this run (pt.spec never opens the
      // bell, so they stay unread); the (dashboard) layout's functional bell
      // renders only at the mobile breakpoint, set per-context in the spec.
      // NB: runs BEFORE pt-delivery so the bell's "latest 5" still surfaces
      // pt_approved (pt-delivery emits several pt_session_* to the student).
      name: 'notifications',
      dependencies: ['setup', 'pt'],
      testMatch: /notifications\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // PT Session Delivery lifecycle (Prompt C1): request→approve→schedule→
      // complete (the single credit writer) with edge cases E1/E2/E3. Switches
      // roles internally (fresh context per role); must NOT pin a session.
      // Runs LAST: it emits several pt_session_* notifications to the student,
      // which would otherwise bury pt_approved out of the notifications bell test.
      name: 'pt-delivery',
      dependencies: ['setup'],
      testMatch: /pt-delivery\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Runs against the PRODUCTION build (`next start`). The middleware is now
  // Edge-compatible (F1.1/V1-F4), so prod serves routes without 500s. CI runs
  // `next build` before the harness; locally, build first or reuse a running server.
  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
