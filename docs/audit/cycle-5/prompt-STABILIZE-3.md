# CODER PROMPT STABILIZE-3 — pin the recurring offline/portal timing flakes

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-stabilize-3` off `main` (`8c13d16`). **Test-stability only — no product behavior change, no assertion weakening, no global-timeout raise.** Three specs keep flaking on the shared e2e project's variable latency, repeatedly red-ing union gates on green code: **`off2:20`, `off3b:49`, `b3:28`.** Make them deterministic.

## Why
Both recent union gates (`27953866079`, `27949386255`) went **red on `off2:20` + `off3b:49`** despite the merged code being sound — and earlier `b3:28` flaked the same way (the REG-FIX/PWA branch runs). These are **read-after-write / offline-read timing assertions** that fail when the shared cloud project is slow; retries don't always recover. This is now a recurring tax (4th+ occurrence) that blocks clean greens. Pin them so a green build reads green.

## Build — deterministic waits, not fixed delays (mirror STABILIZE-E2E / STABILIZE-2)
For each, replace fixed/short waits with a **bounded poll-until-the-expected-state** (the `untilConsistent` helper already in the suite), so transient latency can't fail a correct flow. **Do not weaken what's asserted; do not raise the global `timeout`.**
1. **`off2:20`** (prime online → offline → read member/schedule/roster from cache) — the flake is the **Dexie prime not finishing before the test goes offline**. Wait on a **deterministic prime-complete signal** (the SyncEngine's `onSync`/`syncing→idle`, or poll the mirror until the seeded member is present) *before* `setOffline`, instead of a fixed delay.
2. **`off3b:49`** (capture lead offline → reconnect → exactly one canonical lead) — poll-until the canonical lead is present on reconnect (`untilConsistent`), bounded; keep the "exactly one" assertion intact.
3. **`b3:28`** (guardian → request-for-kid → portal `reg-status='requested'`) — poll-until the `portal-class-card` + `reg-status` render (the realtime/portal read lags under latency); keep the reconciliation/billing assertions intact.

Investigate whether a **shared helper** (a "wait for the offline mirror to reflect X" util) would DRY these — but a per-spec bounded poll is fine.

## Out of scope
Product code (this is e2e-only — touch only the spec files + maybe a test helper); raising the global timeout or `retries`; weakening/removing assertions; the E2E-TIERED config work (separate lane); any feature slice.

## Verify
1. Run each pinned spec **isolated** locally first; then prove stability — `--repeat-each=3` (or 3 consecutive full greens) for `off2`, `off3b`, `b3` with **zero** failures.
2. Full suite green in E2E CI; `/ar` unaffected; no other spec touched.

## Acceptance
1. `off2:20`, `off3b:49`, `b3:28` pass deterministically (proven via repeat-each / consecutive greens); no assertion weakened; no global-timeout/retries raise; green in E2E CI (run ID/URL).
2. e2e-only; no product change.

## Hygiene
Branch `prompt-stabilize-3` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **run isolated first** (the lesson that keeps getting skipped — a hung/flaky spec costs a ~45m slot); **DO NOT merge** — report "STABILIZE-3 ready" + CI run ID (+ the repeat-each evidence); the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / STABILIZE-3 — pin offline/portal timing flakes`: the per-spec deterministic wait, the repeat-each evidence, CI run ID/URL, an explicit **"off2:20 + off3b:49 + b3:28 deterministic (N consecutive green); no assertion weakened; no timeout raise: PASS/FAIL"** line, and a DRAG READ (incl. the residual case for the isolated-DB unlock, which removes the latency variance at the root).
