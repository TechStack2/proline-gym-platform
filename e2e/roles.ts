// Run-scoped logins for the verification harness (Test-Infra hardening).
//
// Each CI run provisions its OWN gym (slug = E2E_GYM_SLUG) with 4 run-scoped
// auth.users `<role>+<slug>@e2e.local` (password = E2E_PASSWORD). Emails/creds are
// derived from env so the suite never touches the shared demo gym. Locally
// (no env), it falls back to a plausible slug so type-checks/imports work.
export const E2E_GYM_SLUG = process.env.E2E_GYM_SLUG || 'proline-gym-local';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23';

export type Role = 'owner' | 'reception' | 'coach' | 'student';

const email = (role: Role) => `${role}+${E2E_GYM_SLUG}@e2e.local`;

export const ROLES: Record<Role, { email: string; storage: string }> = {
  owner: { email: email('owner'), storage: 'e2e/.auth/owner.json' },
  reception: { email: email('reception'), storage: 'e2e/.auth/reception.json' },
  coach: { email: email('coach'), storage: 'e2e/.auth/coach.json' },
  student: { email: email('student'), storage: 'e2e/.auth/student.json' },
};

import type { Page, TestInfo } from '@playwright/test';

// Save a named, full-page screenshot and attach it to the report.
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = `screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
