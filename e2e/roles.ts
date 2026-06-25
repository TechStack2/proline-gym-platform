// Run-scoped logins for the verification harness (ISO-DB: per-worker isolation).
//
// ISO-DB Phase 1 gives every Playwright WORKER its OWN seeded gym so the suite
// can run at `workers > 1` against an isolated LOCAL Supabase stack (no shared
// data → no cross-worker collisions). The slug, role emails and storageState
// paths are therefore keyed to the worker index:
//   • CI sets `E2E_GYM_SLUG_BASE` (e.g. `e2e-<runid>`) + `E2E_WORKERS` and
//     pre-seeds one gym per worker: `<base>-w0`, `<base>-w1`, …
//   • Playwright sets `process.env.TEST_PARALLEL_INDEX` per worker slot (a bounded
//     0..workers-1 that is REUSED when a worker restarts — unlike TEST_WORKER_INDEX
//     which increments past workers-1 on a retry/restart and would point at an
//     unseeded gym). A module imported in slot N resolves to that slot's gym.
//   • `auth.setup.ts` generates a storageState file per (slot, role).
//
// Legacy / local (no `E2E_GYM_SLUG_BASE`): falls back to a SINGLE gym with the
// un-suffixed slug + `e2e/.auth/<role>.json` paths, so local type-checks/imports
// and the old single-gym model keep working unchanged.
import type { Page, TestInfo } from '@playwright/test';

const BASE =
  process.env.E2E_GYM_SLUG_BASE || process.env.E2E_GYM_SLUG || 'proline-gym-local';
// Per-worker isolation is ON only when CI provides an explicit base slug.
const PER_WORKER = !!process.env.E2E_GYM_SLUG_BASE;

export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass!23';
// Number of worker gyms CI pre-seeds (auth.setup.ts logs in each). Default 1.
export const E2E_WORKERS = Math.max(1, parseInt(process.env.E2E_WORKERS || '1', 10));

export type Role = 'owner' | 'reception' | 'coach' | 'student' | 'parent';
export const ALL_ROLES: Role[] = ['owner', 'reception', 'coach', 'student', 'parent'];

/** This worker SLOT (0..workers-1, reused on restart). 0 when unset (single worker). */
export function workerIndex(): number {
  const w = process.env.TEST_PARALLEL_INDEX;
  return w === undefined ? 0 : parseInt(w, 10) || 0;
}

/** The gym slug for a given worker (per-worker when CI provides a base). */
export function slugFor(w: number = workerIndex()): string {
  return PER_WORKER ? `${BASE}-w${w}` : BASE;
}

/** The run gym's slug for THIS worker. */
export const E2E_GYM_SLUG = slugFor();

/** The run-scoped login email for a role on a given worker's gym. */
export function roleEmail(role: Role, w: number = workerIndex()): string {
  return `${role}+${slugFor(w)}@e2e.local`;
}

/** The storageState path for a role on a given worker's gym. */
export function roleStorage(role: Role, w: number = workerIndex()): string {
  return PER_WORKER ? `e2e/.auth/w${w}-${role}.json` : `e2e/.auth/${role}.json`;
}

// Convenience map bound to THIS worker — what specs use to open role contexts
// (`browser.newContext({ storageState: ROLES[role].storage })`). Resolved per
// worker via TEST_WORKER_INDEX, so each worker hits its own gym automatically.
export const ROLES: Record<Role, { email: string; storage: string }> = {
  owner: { email: roleEmail('owner'), storage: roleStorage('owner') },
  reception: { email: roleEmail('reception'), storage: roleStorage('reception') },
  coach: { email: roleEmail('coach'), storage: roleStorage('coach') },
  student: { email: roleEmail('student'), storage: roleStorage('student') },
  // B3: the seeded guardian (Rana), linked to kid students Omar + Lina.
  parent: { email: roleEmail('parent'), storage: roleStorage('parent') },
};

// Save a named, full-page screenshot and attach it to the report.
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = `screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
