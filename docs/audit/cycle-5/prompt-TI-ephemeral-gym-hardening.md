# CODER PROMPT TI — Test-Infra Hardening: Ephemeral Per-Run Gym + Suite Durability

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** runs **before D1** (auditor-owned investment). Branch `prompt-ti-ephemeral-gym` off `main`.
> **Why:** the strangler is validated, but the drag has **migrated to e2e-suite durability** — C1 took **7 CI runs to converge** purely on accumulation flakiness against the shared cloud DB. This slice removes that tax so D1 and every Phase-2+ slice run deterministically.
> **The spec is the design doc — read it first; authoritative:** 📎 [`docs/audit/cycle-5/test-infra-ephemeral-gym-hardening.md`](./test-infra-ephemeral-gym-hardening.md)
> Hand verbatim. Self-contained. **Not a user journey — it's test infrastructure.**

---

## Role, Skill, Lens
- **Act as `e2e-runner` + `database-reviewer`** (`/Arsenal/ecc/agents/`): `e2e-runner` owns the harness restructure; `database-reviewer` verifies the parameterized seed + teardown are correct, gym-scoped, and leave no residue.
- **Apply superpower `verification-before-completion`**: "done" = the **full suite green across ≥2 consecutive CI runs starting from a dirty DB** (determinism is the proof) + **teardown leaves zero residue**. Also `systematic-debugging` for any flake.
- **Lens:** isolation — every run operates in its **own gym**; no spec depends on accumulated/shared state; the demo `proline-gym` is never touched by e2e again.

## Strategic context
Closes the [[strangle-validated-leaf-rot]] "drag migrated to suite durability" finding. No benchmark gap — this is the test-infra investment that de-risks all subsequent slices. Decisions: **ephemeral per-run gym**, **broad-but-bounded scope**, **`SUPABASE_ACCESS_TOKEN` added to `e2e.yml`** (revoke post-demo), **public-lead gym selector** (X1).

---

## What you are building (design doc §2–§4)

### 1. Parameterized seed + teardown (admin SQL via Management API)
- **`seed_e2e_gym(slug)`** (a SQL script / function run in admin context, generalizing `000017`): creates a gym (`slug`), **4 run-scoped `auth.users`** (`owner+<slug>@e2e.local` … with a known test password) → profiles/roles via the trigger + seed; disciplines; classes **with `class_schedules` on every weekday**; membership plans; PT packages; a **fuller `belt_hierarchies` ladder** (enough headroom that one-way promotion never exhausts in a run); the demo student (enrolled, **white belt, clean history**); the demo coach (roster). **Idempotent per slug.**
- **`teardown_e2e_gym(slug)`**: delete the gym (CASCADE) + the 4 run-scoped `auth.users`; plus a **sweep** of `e2e-*` gyms older than ~2h (failed-teardown safety net).

### 2. CI wiring (`e2e.yml`)
- Add **`SUPABASE_ACCESS_TOKEN`** to the job `env` (existing secret).
- Step **Provision** (before build/test): `slug = e2e-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`; run `seed_e2e_gym(slug)` via the Management API (the `verify-foundation.yml` pattern); export slug + run-scoped creds to `$GITHUB_ENV`.
- Step **Teardown** (`if: always()`, after): `teardown_e2e_gym(slug)`.
- Add a GH **`concurrency`** group so runs serialize on the shared cloud DB.

### 3. Edge X1 — public-lead gym selector (the only prod-code change)
- `submit_public_lead` picks `first active gym` (oldest) → wrong with >1 gym. Add an explicit **gym selector** (slug param on the landing route / RPC arg) so CI targets the run gym; **prod defaults to the demo gym**. Keep it minimal + backward-compatible.

### 4. Harness durability (`e2e/helpers.ts` + refactor ALL specs)
- `visibleShell(page)` — scope to the visible `(dashboard)` shell (retire the per-slice `:visible/.first()` tax).
- `expectNotification(page, type, {forUser})` — assert via the **`/notifications` page** (RLS-scoped full list), **not** the bell's latest-N.
- `runId()` / unique-naming util.
- **Refactor every spec** to operate in the run gym, log in as the run-scoped users (`auth.setup.ts` reads creds from env), use the helpers, and stop depending on cross-spec accumulated rows.
- **Delete the `000028` belt-reset band-aid** (the per-run seed handles it).
- Keep `workers:1` (serial); parallelization is a later step.

---

## Edges (design doc §3) — handle all
X1 public-lead gym selector (above); **X2** teardown `always()` + stale-`e2e-*` sweep; **X3** delete run-scoped `auth.users` on teardown; **X4** the run gym's member has a login so producers are testable (the login-less-FK fix stays a separate item — don't solve it here); **X5** richer ladder + clean white-belt student each run (no exhaustion).

## Acceptance Criteria — determinism is the judge
1. **Full suite green across ≥2 consecutive CI runs** (report both run IDs/URLs) — prove it survives a dirty starting DB (e.g., run twice back-to-back; the second run must not inherit the first's data).
2. **Teardown leaves zero residue** — after a run, no `e2e-*` gym or run-scoped `auth.users` remain; the demo `proline-gym` is **untouched**.
3. Notification proofs use the `/notifications` page; the `(dashboard)` tax is gone (shared helper); no spec depends on accumulated state; `000028` band-aid removed.
4. `seed_e2e_gym`/`teardown_e2e_gym` idempotent; slug unique per run; concurrency-safe.
5. Only prod-code change is the X1 gym selector. `tsc` + `next build` clean. No RLS/auth weakened.

> **Honesty rule:** verify in CI (run the gate **twice**); report both actual run IDs. Do **not** claim determinism from a single run or fabricate.

## Hygiene
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-ti-ephemeral-gym` off `main`; non-3000 dev port; login `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Test-Infra — Ephemeral Per-Run Gym`. Include: the provision/teardown approach + `seed_e2e_gym` contents, the `e2e.yml` changes, the X1 gym-selector change (file:line), the helpers added, **both consecutive CI run IDs/URLs proving determinism**, teardown-clean evidence, an explicit **"Suite deterministic across consecutive dirty-DB runs: PASS/FAIL"** line, and a **DRAG READ** (did ephemeral isolation actually kill the accumulation-flakiness tax?).

## Scope discipline & hand-back
Test infrastructure only + the X1 prod selector. No journey/feature work, no parallelization, no login-less-FK fix. Stop after updating `audit-cycle-update.md`; report determinism PASS/FAIL + the drag read. Next the auditor issues **D1 (Billing & Payment)** to close Phase 1, now on a deterministic suite.

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ti-ephemeral-gym off main (git checkout main && git pull && git checkout -b prompt-ti-ephemeral-gym).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-TI-ephemeral-gym-hardening.md
  docs/audit/cycle-5/test-infra-ephemeral-gym-hardening.md   (authoritative design)

TEST-INFRA hardening (not a feature): the e2e suite is flaky because it runs against an ACCUMULATING
shared cloud DB (C1 took 7 runs to converge). Give every CI run its OWN gym.
  1. seed_e2e_gym(slug) — admin SQL generalizing 000017: gym + 4 run-scoped auth.users
     (owner+<slug>@e2e.local etc., known test password) + profiles/roles + disciplines + classes WITH
     class_schedules on EVERY weekday + plans + PT packages + a RICHER belt_hierarchies ladder + demo
     student (enrolled, white belt, clean history) + demo coach. Idempotent per slug.
     teardown_e2e_gym(slug) — drop gym CASCADE + the run-scoped users + sweep e2e-* gyms older than ~2h.
  2. e2e.yml — add SUPABASE_ACCESS_TOKEN to job env; PROVISION step (slug=e2e-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT},
     run seed via Management API, export slug+creds to $GITHUB_ENV) before build/test; TEARDOWN step
     if: always() after; add a concurrency group.
  3. X1 (only prod change): give submit_public_lead / the landing route an explicit GYM SELECTOR (slug)
     so CI targets the run gym; prod defaults to the demo gym. Minimal, backward-compatible.
  4. e2e/helpers.ts: visibleShell(page) (retire the (dashboard) :visible tax), expectNotification via the
     /notifications PAGE (not the bell latest-N), runId(). Refactor ALL specs to the run gym + run-scoped
     login (auth.setup.ts reads creds from env) + helpers; delete the 000028 belt band-aid; keep workers:1.
ACCEPTANCE = DETERMINISM: full suite green across >=2 CONSECUTIVE CI runs from a dirty DB (report BOTH
run IDs); teardown leaves zero residue (no e2e-* gym/users; demo proline-gym untouched); only prod change
is X1; tsc+build clean; no RLS/auth weakened. Verify in CI by running the gate TWICE; do NOT claim
determinism from one run or fabricate. Scope every git add (never -A); node_modules gitignored.
When done, append to audit-cycle-update.md under "Cycle 5 / Test-Infra — Ephemeral Per-Run Gym" with the
seed/teardown approach, e2e.yml + X1 changes (file:line), helpers, BOTH consecutive run IDs/URLs,
teardown-clean evidence, an explicit "Suite deterministic across consecutive dirty-DB runs: PASS/FAIL"
line, and a DRAG READ (did ephemeral isolation kill the flakiness tax?). Then STOP and tell me TI is ready.
```
