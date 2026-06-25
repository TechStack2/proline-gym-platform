// ISO-DB: per-worker auth for specs that use the DEFAULT `page` fixture.
//
// Under per-worker gym isolation a project can't pin a single static
// `storageState` file (each worker has its own gym → its own session file).
// This custom `test` adds an `authRole` option and overrides the built-in
// `storageState` fixture to resolve to THIS worker-slot's per-gym session file
// for that role (anon when unset). Specs that drive a single pre-authed role via
// `{ page }` (owner/reception/coach/student) import `test` from here and declare
// `test.use({ authRole: '<role>' })`. Role-switching specs don't need this —
// they open contexts via `ROLES[role].storage`, which already resolves per worker.
import { test as base, expect } from '@playwright/test';
import { roleStorage, type Role } from './roles';

type AuthOptions = { authRole: Role | undefined };

export const test = base.extend<AuthOptions>({
  authRole: [undefined, { option: true }],
  storageState: async ({ authRole }, use) => {
    await use(authRole ? roleStorage(authRole) : undefined);
  },
});

export { expect };
