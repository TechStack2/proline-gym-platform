# CODER PROMPT V1 — Playwright Verification Harness (Phase 0 companion) 🔁 PROCESS FIX

> **For:** Coding agent · **Issued by:** Project Auditor · **Purpose:** Institutionalize "behavior-green." Its first job is to PROVE F1 visually; thereafter it's the standing gate every vertical slice must pass.
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `e2e-runner`** (`/Arsenal/ecc/agents/e2e-runner.md`).
- **Apply superpower `verification-before-completion`** (`/Arsenal/superpowers/skills/verification-before-completion/`): "done" = observed in a browser, not `tsc`/`build`.
- **Lens:** the [cross-portal-workflow-map.md](../cross-portal-workflow-map.md) — verification follows the propagation paths across portals.

## Why this exists
For four cycles, features were "complete" on `tsc`/`next build` while every portal rendered empty — nobody logged in. F1 just fixed the coherent demo gym on the live DB. This harness makes the **log-in-and-look** step automatic and permanent, so that failure mode cannot recur.

## Build Deliverables

1. **Install + configure Playwright** (`@playwright/test`) with a `playwright.config.ts`. App under test: build + start the app (`next build && next start`) pointed at the coherent Supabase DB (reuse the existing CI Supabase env/secrets + `app.demo_password`). Base URL `http://localhost:3000`.

2. **Auth helper** — log in via the real login form (email/password) for each demo account: `owner@`, `reception@`, `coach@`, `student@` (`@prolinegym.lb`). Reuse session storage state per role to keep tests fast.

3. **Cross-portal smoke specs** — for each login, navigate the key pages and **assert real data is visible (not empty)**, capturing a screenshot of each:

   | Login | Assert (must be visible / non-empty) |
   |-------|--------------------------------------|
   | `owner@` | `/students` list has ≥1 student (e.g. a known seeded name); `/dashboard` shows non-zero counts; `/leads` and `/payments` load without error |
   | `owner@` (write path) | Go to `/students/add`, create a student, return to `/students`, assert the new student appears → proves the write path (F1 acceptance #3) |
   | `student@` | `/portal/schedule` shows the enrolled class; `/portal/billing` shows the invoice; `/portal/pt` lists ≥1 package |
   | `coach@` | `/coach` shows the class schedule; roster includes the enrolled student |
   | `reception@` | `/students`, `/leads`, `/payments` populated |

   Use resilient selectors (roles/test-ids), not brittle text where possible; add `data-testid`s if needed (surgical).

4. **CI job** — add a GitHub Actions job that runs the harness on push/PR, **uploads the screenshots as artifacts**, and fails the build if any portal renders empty or the write-path assertion fails. Keep it alongside the existing migration CI.

5. **Reusable pattern** — structure specs so a future vertical slice (PT, Lead, etc.) adds one cross-portal spec following the same shape. Document the one-liner for "how to add a slice spec" in a short `e2e/README.md`.

## Constraints
- No secrets in the repo — read Supabase URL/anon key + demo password from CI secrets / env.
- Don't weaken any RLS or auth to make tests pass. If a test can't see data it should, that's a finding — report it, don't work around it.
- Surgical app changes (only `data-testid`s if required).

## Acceptance Criteria — this closes F1's visual gate
1. Harness runs green in CI; screenshots uploaded for all 4 logins.
2. Every assertion above passes against the coherent DB — i.e. **F1 is visually proven** (each portal populated; owner add-student works).
3. If anything renders empty, the job FAILS and the report lists exactly which portal/page + the likely cause (do not mask it).

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 0 / Prompt V1 — Verification Harness`. Include: the per-login PASS/FAIL table with screenshot references, an explicit **"F1 visual gate: PASS/FAIL"** line, and any portal that's still empty (with cause). This is what the auditor reads to sign off F1.

## Scope discipline & hand-back
Build only the harness + the F1-proving specs (don't add new product features). Stop after updating `audit-cycle-update.md`; tell the auditor V1 is ready and whether F1's visual gate passed. Next the auditor issues **Prompt 22-R** (re-validate the PT slice) which will add a PT cross-portal spec to this harness.

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full and execute it exactly:
  docs/audit/cycle-5/prompt-V1-verification-harness.md

Build a Playwright verification harness whose first job is to PROVE F1 visually: log in as owner@/reception@/coach@/student@ (@prolinegym.lb), assert each portal renders REAL data (not empty), prove owner can add a student and see it, and screenshot every portal in CI. No new product features. Don't weaken RLS/auth to pass — if a portal is empty, fail and report it. When done, append results to audit-cycle-update.md under "Cycle 5 / Phase 0 / Prompt V1 — Verification Harness" with a per-login PASS/FAIL table and an explicit "F1 visual gate: PASS/FAIL" line. Then STOP and tell me V1 is ready for review.
```
