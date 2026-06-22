# CODER PROMPT E2E-TIERED — fast targeted branch runs; keep the full union gate

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-e2e-tiered` off `main` — **dispatch only AFTER REG-FIX + PWA-INSTALL merge** (it edits the same `e2e.yml` / `playwright.config.ts`; running it concurrently would conflict). **CI-infra change — purely ADDITIVE; the post-merge full suite is the regression guard and must NOT be weakened.**

## Why
The e2e gate (`.github/workflows/e2e.yml`) is the project's behavior-green guard and earns its keep — but it runs the **full ~120-spec suite, single-worker (`workers:1`), ~45 min** on **every branch dispatch**, and the global `concurrency: e2e-cloud` lock serializes runs (two lanes ≈ 90 min wall-clock). The full suite **already runs post-merge** (the `push`-to-`main` union gate). So **branch validation can be a fast targeted subset**, while the full regression guard stays on the union gate.

## Build (additive — the union gate stays full)
1. **A `smoke` set** — a small, fast curated subset that catches gross breakage: `setup` (already a dependency) + a **staff-dashboard load** + a **member-portal load** + the **public landing** + a **billing/registration happy-path** + an **`/ar` localized check**. Implement as a `smoke` playwright **project** (a `testMatch` over those specs) or a `@smoke` grep tag. Target **~5–8 min**.
2. **`workflow_dispatch` gains a `projects` input** (space-separated). When **provided** → run `setup + smoke + <those projects>` (via `--project` filters); when **empty** → run the **FULL** suite (safe default). A coder then validates fast with:
   `gh workflow run e2e.yml --ref <branch> -f projects="<slice-project>"`.
3. **`push` to `main` (the union gate) ALWAYS runs the FULL suite — UNCHANGED.** Do not touch its coverage, its concurrency, its migration-apply, or any existing proof step (e.g. REG-FIX's). Weakening the main gate is **out of scope and forbidden**.
4. Document the dispatch usage (targeted vs full) in an `e2e.yml` comment + the audit doc.

## Out of scope
The **isolated-DB / parallel-workers unlock** (separate, bigger slice); changing the union gate's coverage; removing/`skip`-ing any spec; the feature slices. **Do not** flip `workers`/`fullyParallel` here (that's the parallel-workers slice, and it needs per-worker gym isolation first).

## Verify
1. **Targeted dispatch** (`-f projects="owner"`, say) runs **only** `setup + smoke + owner` and finishes **well under the full ~45 min** — show the run's executed project list + duration.
2. **Bare `workflow_dispatch`** (no input) **and** a **`push` to a throwaway commit on `main`'s flow** both still select the **FULL** suite — confirm the full spec/project count is unchanged (the union gate is intact).
3. The smoke set actually covers the critical paths (it would catch a broken dashboard/portal/landing/billing/`/ar`).
4. No spec deleted or skipped; REG-FIX's in-harness proof step still runs in the full path.

## Acceptance
1. Branch validation can run a fast **targeted** subset (`setup + smoke + <named projects>`) via the `projects` dispatch input; the **post-merge union gate runs the FULL suite, unchanged**; both paths green.
2. Additive only; no spec removed/skipped; the main regression guard provably intact; documented.

## Hygiene
Branch `prompt-e2e-tiered` off `main` (post REG-FIX+PWA); **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **anchor any new `testMatch`**; **DO NOT merge** — report "E2E-TIERED ready" + **two run IDs** (a targeted run + a full run) so the auditor can confirm the union gate is unchanged; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / E2E-TIERED — fast targeted branch runs`: the smoke set, the `projects` dispatch usage, the **proof the full union gate is unchanged** (spec/project count + REG-FIX proof step intact), the targeted-vs-full durations, CI run IDs, an explicit **"targeted branch runs fast; full union gate unchanged; no spec removed: PASS/FAIL"** line, and a DRAG READ (where the isolated-DB/parallel-workers unlock attaches next).
