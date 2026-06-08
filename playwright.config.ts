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
  ],

  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
