# E2E Verification Harness

Playwright harness that **logs in and looks** — the standing "behavior-green" gate.
"Done" means *observed in a real browser against the coherent Supabase DB*, not `tsc`/`next build`.

## What it does
- `auth.setup.ts` logs in (real login form) as `owner@`, `reception@`, `coach@`, `student@`
  (`@prolinegym.lb`) and saves a session per role to `e2e/.auth/<role>.json`.
- One spec per role asserts each portal renders **real data, not the empty state**, and
  screenshots every page to `screenshots/`.
- If a portal renders empty or a write path fails, the run **fails** — that's a finding, not something to work around.

## Run locally
```bash
# build once, then point at the coherent DB via .env.local
npm run build
DEMO_PASSWORD=ProlineDemo2024! npm run test:e2e        # all roles
npm run test:e2e -- --project=owner                    # one role
npx playwright show-report                             # view report + screenshots
```
The config's `webServer` runs `npm run start` automatically (reused locally if already up).

## Add a vertical-slice spec (one-liner pattern)
A new slice (PT, Lead, …) adds **one cross-portal spec** that follows the propagation path,
asserting the *receiving* actor actually sees the change. Skeleton:

```ts
// e2e/<slice>.spec.ts  → add a project block in playwright.config.ts if it needs a specific role
import { test, expect } from '@playwright/test';
import { shot } from './roles';

test('<slice>: action by actor A is visible to actor B', async ({ page }, testInfo) => {
  await page.goto('/en/<page-where-A-acts>');
  // ...perform the action...
  await page.goto('/en/<page-where-B-observes>');
  await expect(page.getByText(/<the propagated data>/)).toBeVisible();   // assert REAL data
  await shot(page, testInfo, '<slice>-<observer>');
});
```
Rule: assert the data the next actor must see (notification, roster row, invoice…). Never weaken
RLS/auth or soften an assertion to go green — if the data isn't there, let it fail and report it.

**Shipped slices:**
- `pt.spec.ts` (project `pt`) — the PT vertical: student requests (`request_pt` RPC) → staff
  approves (auto dual-currency invoice + `pt_approved`/`pt_assigned` notifications) → coach roster
  shows the student + credits and Log session decrements / blocks at 0 → status + invoice flow back
  to the student. It opens a fresh context per role from `e2e/.auth/*.json` (so it switches portals
  in one test), is idempotent (acts on the newest request for the 1-session demo package), and fails
  loudly if any portal doesn't reflect a step. Requires migration `000019` (1-session demo package)
  applied to the DB.

## CI
`.github/workflows/e2e.yml` builds the app, runs this harness against the linked Supabase project,
and uploads `screenshots/` + `playwright-report/` as artifacts. Secrets/keys come from CI, never the repo.
