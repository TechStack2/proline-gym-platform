# CODER PROMPT OFF-1 — web↔PWA parity audit + installed-PWA offline foundation (front-desk laptop)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-off1-parity` off `main`. Design: [`scoping-offline-parity.md`](./scoping-offline-parity.md). **First slice of the offline chapter (the lead must-have).** Decision-independent — the operator's Tier-1/Tier-3 + cash decisions only gate OFF-3/4, not this. **Foundation only: do NOT build new offline reads/writes (OFF-2..4) here.**

## Why
Proline's front desk runs on a **laptop with unreliable internet**. The offline machine (Dexie mirror + dormant `SyncEngine` + G2's proven attendance loop + `next-pwa`) exists, but it only fully engages in the **installed PWA**, and the app was built mobile-first — so the **desktop/laptop experience may not engage the SW/offline at all**, and there's no confirmed web↔installed-PWA parity. OFF-1 makes the **installed PWA on a desktop viewport** a first-class, offline-ready surface, and audits/fixes the divergences. This unblocks OFF-2 (offline reads) and OFF-3/4 (writes).

## Build

### 1. Parity audit (the deliverable that drives the fixes)
Systematically compare the **front-desk-relevant surfaces** (Today/Front-desk, students list + Member-360, schedule/roster, attendance, payments) across **(a) desktop browser tab** vs **(b) installed PWA (desktop Chrome "Install app")** vs the **mobile PWA**. Enumerate every divergence: SW registration, offline-banner/`use-online` engagement, the shell (desktop side-rail vs mobile `NativeTabBar`), the install prompt availability, `manifest.json` (`start_url: "/en"` is locale-hardcoded — flag if it breaks `/ar` install/launch), and any feature gated by viewport/install. **Write the divergence list + disposition (fix now / OFF-2+ / accept) into the audit doc.**

### 2. Close the foundation gaps
- **The installed PWA engages the SW + offline engine on a *desktop* viewport** — `offline-banner` / `online-only-notice` / `use-online` show + behave on the laptop, not just mobile; the SW registers and serves the cached shell offline.
- **The install prompt** (`pwa-install-prompt`) is reachable + works on **desktop Chrome** (not mobile-only).
- **Consistent offline shell** across viewports (the front-desk laptop gets the same offline affordances).
- Reuse the existing components/hooks (`offline-banner`, `online-only-notice`, `use-online`, `pwa-install-prompt`, `next-pwa`) — wire/fix, don't reinvent. **No new SW caching strategies beyond confirming the existing `runtimeCaching` serves the front-desk shell offline.**

### 3. SW lifecycle correctness (we've been bitten twice — get it right)
Registration/update/succession must be clean: dev cleanup (`DevSwCleanup`) intact, prod SW succession works, no stale-shell. See [[stale-sw-localhost]], [[prod-csp-strict-dynamic-needs-dynamic-render]]. **Do NOT regress** the existing mobile PWA or the G2 offline attendance.

## Out of scope
OFF-2 offline reads (Dexie-mirror/PULL activation), OFF-3 offline writes, OFF-4 reconciliation — later slices. New product features. The Tier-1/Tier-3 + cash operator decisions (OFF-3/4). Schema.

## Verify (e2e — reuse the G2 offline-harness pattern: `context.setOffline`)
1. **Desktop offline foundation:** on a **desktop viewport** context, go offline → the **offline banner shows** and the **app shell still loads** (SW-cached) — not a browser error page. Online → banner clears.
2. **No regression:** the existing **G2 offline attendance** still passes on its viewport; mobile PWA unaffected; `/ar` clean.
3. The **parity audit doc** is committed with the divergence list + dispositions.

## Acceptance
1. The installed PWA on a desktop viewport engages SW + offline UX; the parity divergences are enumerated + the foundation gaps closed (or explicitly deferred to a named later slice); green in E2E CI (run ID/URL).
2. Zero schema; no OFF-2..4 scope crept in; existing mobile-PWA + G2 not regressed; SW lifecycle clean.

## Hygiene
Branch `prompt-off1-parity` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "OFF-1 ready" + CI run ID; the auditor merges. (Suite is flaky-pinned post-STABILIZE-E2E — if not yet merged, expect possible flake + interpret.)

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / OFF-1 — parity audit + installed-PWA offline foundation`: the parity divergence table + dispositions, the gaps closed, the SW-lifecycle confirmation, CI run ID/URL, an explicit **"installed PWA engages SW+offline on desktop; parity audited; no G2/mobile regression: PASS/FAIL"** line, and a DRAG READ.
