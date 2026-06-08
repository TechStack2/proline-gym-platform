// Demo logins for the verification harness. The password is the public demo
// password shown on the login page; overridable via DEMO_PASSWORD for non-demo
// environments. No real secret lives here.
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'ProlineDemo2024!';

export type Role = 'owner' | 'reception' | 'coach' | 'student';

export const ROLES: Record<Role, { email: string; storage: string }> = {
  owner: { email: 'owner@prolinegym.lb', storage: 'e2e/.auth/owner.json' },
  reception: { email: 'reception@prolinegym.lb', storage: 'e2e/.auth/reception.json' },
  coach: { email: 'coach@prolinegym.lb', storage: 'e2e/.auth/coach.json' },
  student: { email: 'student@prolinegym.lb', storage: 'e2e/.auth/student.json' },
};

import type { Page, TestInfo } from '@playwright/test';

// Save a named, full-page screenshot and attach it to the report.
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = `screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
