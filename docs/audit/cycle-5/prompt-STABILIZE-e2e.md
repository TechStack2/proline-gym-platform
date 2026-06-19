# CODER PROMPT STABILIZE-E2E — pin the flaky tests so green means green

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-stabilize-e2e` off `main`. **Test/infra only — NO product-code or schema changes, NO assertion weakening.** Goal: the behavior gate is currently *unreliable* (flaky tests fail intermittently regardless of the change under test), which costs re-run cycles and — worse — lets a real regression hide behind "probably just flake." Fix the flakes at the root so a green run is trustworthy.

## The observed flaky set (evidence from real runs — pull each one's `trace.zip` to diagnose)
The suite is **serial, `workers:1`, `fullyParallel:false`, `retries:1` in CI, `expect.timeout:10s`** against ONE shared run-gym. Flakes seen across recent runs:
- **`pt1.spec.ts:102`** (use→refill) — `pt-roster-row[data-package-en=…]` not visible; **failed at *different* lines across runs (111, 164)** → a **race between the desk sale write and the coach-roster read** (roster doesn't reflect the just-sold package within the 15s wait).
- **`pt2.spec.ts:77 / 153 / 218`** (availability booking) — `pt-slot` "element not found" within 20s; **failed all-3 in one run, passed all-3 in another** → availability-publish → slot-compute → render race, OR a **date/day-boundary** (today=Friday surfaced it; check UTC-vs-gym-TZ slot dates).
- **`g2.spec.ts:66`** (offline mark → reconnect-sync) — **failed then recovered on retry #1** → SW/offline timing (the known "SW cold-open" + roster-cache-vs-queue coherence): the test asserts before the SW is ready / the reconnect flush has drained.
- **`adm1.spec.ts`** (disciplines) — pre-existing intermittent flake (noted in earlier slices).

## Approach — fix the ROOT, never mask
For each flaky test: open its trace, find the exact race, and apply the **smallest correct fix**:
- **Wait for the signal, not a fixed timeout** — replace one-shot `toBeVisible({timeout})` on post-mutation UI with **`await expect(async () => { … }).toPass()`** / `expect.poll` that re-reads (and where needed re-navigates/revalidates) until the server state is reflected; or explicitly await the mutation's network response / a stable post-write marker before asserting.
- **Isolate from shared-gym mutation** — where a test asserts on an entity earlier specs mutate (e.g. Karim — see [[e2e-karim-mutated-by-ml1]]), **create a controlled entity** for the assertion (the pattern MEMBER-ENRICH Test 2 used: register a fresh class, assert against *that*), instead of the accumulated fixture.
- **g2** — ensure the service worker is registered/active before `setOffline`, and that the reconnect **flush completes** (await the queue drain / a "synced" signal) before asserting persistence + idempotency.
- **pt2** — if it's a date-boundary, anchor the seeded availability/slot window to be valid on **every** weekday (not just weekdays the test happens to run); confirm the slot dates use the **gym TZ**, not the runtime/UTC date.

**Hard rules:** do NOT weaken or delete assertions (the diff should add *waits/fixtures*, not remove `expect`s); do NOT just bump global `retries` to paper over races (a targeted per-assertion poll is fine; a blanket retry bump is not); no product-code behavior changes (if a flake reveals a *real* product race, name it in the drag-read — don't silently "fix" it by loosening the test).

## Out of scope
Product/UI/schema changes; re-architecting the serial-shared-gym harness (do **targeted** fixes, not a rewrite); the offline/portal/feature work.

## Verify (this is the unusual one — prove STABILITY, not just one green)
1. Run the affected projects **repeatedly** and show they pass consistently — e.g. the `pt1`/`pt2`/`g2`/`adm1` projects **green 3× consecutively** (locally loop them, and/or dispatch the full e2e **twice** back-to-back and show both green). One green isn't proof for a flake fix.
2. Full suite green with **no assertion removed/loosened** (call out in the report that the diff is waits/fixtures only).
3. `/ar` still clean; no new flake introduced.

## Acceptance
1. The named flaky tests pass reliably across repeated runs (cite ≥2–3 consecutive green run IDs/URLs); diff is test/fixture-only, zero product/schema change, zero assertion weakening.
2. Each fix names the root race it addressed (per test).

## Hygiene
Branch `prompt-stabilize-e2e` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "STABILIZE-E2E ready" + the consecutive green run IDs; the auditor merges.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / STABILIZE-E2E — flaky-gate stabilization`: per-test root race + fix, the consecutive-green evidence (run IDs), an explicit **"pt1/pt2/g2/adm1 stable across N consecutive runs; no assertion weakened: PASS/FAIL"** line, and a DRAG READ (incl. any *real* product race the flake exposed).
