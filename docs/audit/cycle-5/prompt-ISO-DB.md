# CODER PROMPT ISO-DB — isolated local Supabase stack per CI run (kill the shared-project flakes + serial lock)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-iso-db` off `main` — **dispatch AFTER STABILIZE-3 + E2E-TIERED merge** (it reworks `e2e.yml`). **CI-infra rework. PHASED — Phase 0 is a de-risk SPIKE; do not start Phase 1 until Phase 0 reports clean.** The post-merge union gate must stay a full-suite gate; behavior coverage must not shrink.

## Why
Every recent flake (off2/off3b/b3) and the ~45-min serial queue trace to **one shared Supabase *cloud* project**: variable latency flakes the timing-sensitive specs, and the global `concurrency: e2e-cloud` lock + `workers:1` serialize everything. Giving each run its **own local Supabase stack** removes the latency at the root **and** lets runs go concurrent (parallel). Approach approved: **local stack per run** (`supabase start` in the runner), not cloud branching.

**This is also the #1 CI-cost lever (a first-class deliverable, not a side effect).** The repo is **private**, so every runner minute is billed; the serial `workers:1` suite is **~43 min/run** and we run it **~190×/2 weeks** → the heavy Actions bill. Isolated DBs let us **parallelize** (`fullyParallel:true` + multi-worker) and **drop the serial lock** → a full run should fall to **~⅓ the minutes** *and* stop queuing. Quantify the before/after minutes in the report.

## Phase 0 — SPIKE (de-risk; report before building)
**Verify the full migration chain replays from scratch.** Run `supabase db reset` (apply 000001 → latest from an empty DB) locally and report:
- Does it succeed clean? List anything that breaks a from-zero replay — likely suspects: **data-dependent migrations**, the **demo-reseed functions** (000058/000060), **`seed_e2e_gym`/`teardown_e2e_gym`** (000029) assuming cloud state, any step that was only ever **VF-applied incrementally** to the persistent cloud project, and the function-rewrite ordering ([[function-rewrite-reverts-later-migrations]] — a clean replay applies in order, so the latest definer wins; confirm that's correct for `request_class_registration` etc.).
- **Output:** a short report — "replays clean ✓" or the exact list of breakages + the minimal fixes. **Stop and report before Phase 1.** (If replay needs migration fixes, that's its own reviewable change.)

## Phase 1 — build (only after Phase 0 is clean/fixed)
1. **Spin the local stack in CI** — `supabase start` in the GitHub job (Postgres + PostgREST + GoTrue + Storage); `supabase db reset` to apply migrations from zero; run the existing `seed_e2e_gym` against the **local** DB.
2. **Point the app + e2e at localhost** — `NEXT_PUBLIC_SUPABASE_URL` + anon/service keys → the local stack; the harness's seed/teardown use the local DB instead of the cloud Management API.
3. **De-serialize + PARALLELIZE (the cost fix — do NOT leave `workers` at 1)** — each run now has its own DB, so:
   - (a) **remove the global `concurrency: e2e-cloud` lock** so runs go concurrent;
   - (b) **set `fullyParallel: true` + `workers` to the runner core count** (ubuntu-latest = 4) — the isolated DB makes this safe (no shared-data collisions);
   - (c) **`cancel-in-progress: true` for non-`main` refs** (keep it `false` on `main` so the union gate always finishes its teardown);
   - (d) **cache npm deps + the Playwright browser download** (`actions/setup-node` cache + cache `~/.cache/ms-playwright`) to cut setup minutes.
   - Keep `push`-to-`main` = full suite. **Target: a full run ≤ ~15 min (from ~43) — measure and report before/after run minutes.**
4. **Keep the cloud project for prod/VF only** — e2e no longer touches it; document the split.

## Out of scope
Pinning specs (STABILIZE-3 owns that); the E2E-TIERED targeting (separate, already landed — keep it working); feature slices; changing what the suite asserts. **Don't shrink coverage** — the full union gate stays full.

## Verify
1. **Phase 0 report delivered + acted on** (replay clean or fixed).
2. e2e runs **green against the local stack**; a full run is **faster** (no cloud round-trips) and **two runs can execute concurrently** (no e2e-cloud queue) — demonstrate both.
3. off2/off3b/b3 are **stable** on the local stack (the latency variance is gone); no behavior coverage lost; prod/VF path unaffected.

## Acceptance
1. CI e2e runs on a per-run **local Supabase stack** (migrations replayed from scratch), the global serial lock removed (runs concurrent), the full union gate preserved; green + a concurrency demo (two overlapping runs); Phase 0 report recorded. **Cost: `fullyParallel:true` + multi-worker → a full run is ≥~3× faster (target ≤~15 min, before/after measured), deps + Playwright browsers cached, `cancel-in-progress:true` on non-`main`.**
2. The shared cloud project is prod/VF-only for e2e; coverage unchanged.

## Hygiene
Branch `prompt-iso-db` off `main` (post STABILIZE-3 + E2E-TIERED); **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **Phase 0 SPIKE first — report before Phase 1**; **DO NOT merge** — report "ISO-DB Phase 0" then "ISO-DB ready" + CI run IDs (incl. the concurrency demo); the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / ISO-DB — isolated local Supabase stack per CI run`: the Phase 0 replay findings + fixes, the local-stack CI wiring, the de-serialization + concurrency demo, the speed delta, CI run IDs, an explicit **"e2e on per-run local stack; runs concurrent; full gate preserved; off2/off3b/b3 stable: PASS/FAIL"** line, and a DRAG READ.
