# CODER PROMPT STABILIZE-2 — pin the two residual flakes (f3 canvas-draw, ax1 CLS)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-stabilize-2` off `main`. **Test/infra + one real perf fix — NO assertion weakening, NO threshold-raising.** STABILIZE-E2E pinned `pt1`/`pt2`/`g2`/`adm1`; two flakes remain and now tax every run.

## Targets (pull each one's `trace.zip` to confirm the root)
- **`f3.spec.ts:63`** — the signature-pad `data-has-ink` draw. PORTAL-FND just fixed the *positioning* root cause (WaiverSign portaled to `<body>` → canvas on-screen), so `f3` now passes — but it was *recoverable*, not perfectly deterministic. Pin the residual **canvas-draw timing**: before drawing, wait for the pad to be visible + ready; draw with enough points/dwell that the stroke registers; poll `data-has-ink="true"` after. **Also make `f3` retry-safe** if feasible — today a flake *after* it bumps the waiver template v1→v2 dooms the retry (the v1 check can't pass); ideally the first sign is deterministic (so no retry needed) and/or the template bump happens only after the sign is confirmed. See [[f3-nonidempotent-retry-doom]].
- **`ax1` landing CLS** (0.225 > 0.1) — a layout-shift flake. Find the shifting element (late-loading image/font/section without reserved space) and **reserve its space** (explicit width/height/`aspect-ratio`/min-height) so CLS stays < 0.1. **This is a real perf fix — do NOT raise the CLS threshold to pass.**

**Hard rules:** diff is test-waits + the CLS reserve-space fix only; **zero assertion weakening, zero threshold-raising**; no product behavior change beyond reserving layout space.

## Verify (prove STABILITY, like STABILIZE-E2E)
1. `f3` + `ax1` **green across 3 consecutive full-suite runs** (cite the 3 run IDs/URLs) — one green isn't proof for a flake.
2. No assertion removed/loosened, no threshold raised (call this out explicitly in the report).

## Acceptance
1. `f3` + `ax1` stable across ≥3 consecutive greens (run IDs cited); diff is waits + the CLS layout fix only.
2. Each fix names the root it addressed.

## Hygiene
Branch `prompt-stabilize-2` off `main`; **worktree lane, dev port 3100** (runs parallel to COACH-LP); scoped `git add`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "STABILIZE-2 ready" + the 3 consecutive green run IDs.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / STABILIZE-2 — f3 + ax1 pinned`: per-flake root + fix, the consecutive-green evidence, an explicit **"f3 + ax1 stable across N greens; no weakening/threshold-raise: PASS/FAIL"** line, and a DRAG READ.
