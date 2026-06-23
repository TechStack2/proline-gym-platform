# CODER PROMPT OFF2-PRIME — make the offline desk prime resilient (the roster must mirror under flaky internet)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off2-prime` off `main`. **PRODUCT fix (escalated from STABILIZE-3).** The OFF-2 desk prime can't reliably mirror `class_enrollments` (the roster) under latency, so the offline desk loses the roster — and the **front desk runs on exactly this flaky internet by design.** Make the prime resilient. The off2:20 e2e is the proof (don't weaken it).

## Why (root-caused via STABILIZE-3)
OFF-2's desk prime calls `SyncEngine.pullAll({ full, tables: CORE_TABLES })` once on `/desk` mount. `class_enrollments` (and `belt_hierarchies`) have **no `updated_at`**, so they go through a **full-table sync** (`fullTableSync`, ordered by id). Under the shared project's latency that full sync **stalls / completes partially with no re-attempt** — so the roster never lands in Dexie, and the offline read shows an empty roster. Proof: `off2:20` ("prime → offline → read roster from cache") failed **0/6** even across **repeated fresh re-primes** (STABILIZE-3 v3 reloaded `/desk` each iteration) — a deterministic product stall, not a test-timing flake. **This will bite the live front desk** (slow/dropped connection mid-prime → incomplete offline cache).

## Build — resilient prime (pick the robust fix; investigate the actual stall first)
1. **Make `pullAll` resilient per table** — a table whose sync fails/stalls/returns partial must **retry** (bounded backoff) rather than silently leaving a gap; the prime isn't "done" until the core tables (incl. `class_enrollments`) are actually mirrored. Surface a real **"still syncing / synced as of"** state so the desk knows the cache is partial vs complete.
2. **Fix the `class_enrollments` sync itself** if the full-table pull is the bottleneck — prefer making it **incremental** (add an `updated_at` column + trigger so it joins the normal cursor sync, additive migration via VF) **or** paginate the full sync so a slow link doesn't stall one giant request. (Same consideration for `belt_hierarchies` if it shares the pattern.)
3. **Don't regress** the OFF-2 read path, the desk-scoped prime (stays `/desk`-only), G2/OFF-3/OFF-4, or RLS (authed, gym-scoped). If a migration is needed, additive + forward-only + via Verify-Foundation (HTTP 201, flagged).

## Out of scope
The STABILIZE-3 b3/off3b pins (separate lane); offline writes (OFF-3/4 done); E2E-TIERED/ISO-DB; weakening or skipping off2:20.

## Verify (the off2:20 proof — keep it strict)
1. **`off2:20` passes deterministically** — prime `/desk` online, go offline, read member + schedule + **roster** from cache; prove with `--repeat-each=3` (or 3 consecutive greens), **0 failures** — the assertion (roster rows visible offline) stays as-is; the *product* now makes it true.
2. **Resilience proof:** simulate a slow/partial prime (throttle or drop mid-prime) → the prime **recovers** (retries) and the roster still mirrors → offline read works. (This is the real-front-desk scenario.)
3. `/ar` off2 still green; no G2/OFF-3/OFF-4 regression; full suite green.

## Acceptance
1. The desk prime reliably mirrors the roster (`class_enrollments`) under latency/partial-connection — via retry/resilience (+ incremental/paginated sync if needed); `off2:20` passes deterministically with the assertion intact; resilience demonstrated; green in E2E CI (run ID/URL).
2. Schema additive-only via VF (if any); RLS untouched; desk-scoped prime preserved; no offline-arc regression.

## Hygiene
Branch `prompt-off2-prime` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; never weaken RLS; **run isolated first** (`--repeat-each=3` on off2); migration (if any) via VF (HTTP 201, flagged); **DO NOT merge** — report "OFF2-PRIME ready" + CI run ID + the repeat-each evidence; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / OFF2-PRIME — resilient offline desk prime`: the stall root cause, the resilience fix (retry + incremental/paginate), any migration (+ VF/HTTP 201), the off2:20 repeat-each evidence + the slow-prime recovery proof, CI run ID/URL, an explicit **"desk prime reliably mirrors the roster under latency; off2:20 deterministic (N green), assertion intact; no offline-arc regression: PASS/FAIL"** line, and a DRAG READ (incl. that this protects the live front desk on flaky internet, the real reason it matters).
