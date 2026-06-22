# CODER PROMPT PWA-INSTALL — install on Mac/Windows + an admin-side install affordance

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-pwa-install` off `main` (≥ `8f0f738`). The front-desk laptop should run the **installed PWA** ([[off3-offline-write-model]] — installed PWA is the offline guarantee), but the existing prompt only fires in Chrome/Edge (`beforeinstallprompt`) — **Safari/macOS shows nothing**, and there's no admin-side guidance. **Frontend only; zero schema.**

## Why (operator ask [4] + roadmap)
The owner asked: *how do we install the PWA on Mac and Windows, and can we get a prompt on the admin side?* The offline arc (OFF-1→4) only pays off if the desk actually **installs** the app. Current state (audited): [`pwa-install-prompt.tsx`](../../../src/components/pwa/pwa-install-prompt.tsx) listens for `beforeinstallprompt` (**Chrome/Edge/Android only**) and is mounted in [`front-desk-offline-layer.tsx`](../../../src/components/offline/front-desk-offline-layer.tsx). Gaps: **macOS Safari** never fires `beforeinstallprompt` (install is the manual "Add to Dock"), and there's **no admin-side** install affordance/instructions.

## Build
1. **Platform-aware manual-instructions fallback** — when `beforeinstallprompt` is unavailable (Safari/macOS; or eligible browsers that already fired/missed it) **and** the app isn't already installed (`window.matchMedia('(display-mode: standalone)')` / `navigator.standalone` both false), show the right steps by detected platform/browser:
   - **macOS Safari 17+:** File → **Add to Dock** (or Share → Add to Dock).
   - **macOS/Windows Chrome or Edge:** the **install icon (⊕)** in the address bar, or ⋯ menu → **Install Proline / Install this site as an app**.
2. **Admin-side install affordance** — a dismissible **"Install the app"** card (or settings entry) on the **staff/admin** surface that, where `beforeinstallprompt` is captured, triggers the native prompt, else opens the platform instructions from (1). Place it where the front desk will see it (a Today card or staff settings) — **coordinate with the existing offline-layer prompt so the two don't double up.**
3. **Already-installed → render nothing** (no nag); dismissible + remembered (localStorage). i18n ar/en/fr; full RTL; brand theme.

## Out of scope
Schema; the service worker / offline sync (shipped — don't touch); manifest changes beyond what install needs; the member portal (this is the staff/front-desk install). Don't regress the existing offline banner/prompt.

## Verify (e2e)
1. In a **non-standalone** context, the **admin-side install affordance renders** with platform-aware instructions; where `beforeinstallprompt` is mockable, clicking triggers the prompt; otherwise it reveals the Mac/Windows steps.
2. In **standalone/installed** mode (`display-mode: standalone`), **nothing nags** anywhere.
3. `/ar` clean (RTL, no MISSING_MESSAGE); the existing offline-layer prompt still behaves (no double-up); full suite green. **Anchor any new `testMatch`; run the new spec isolated first; bound every wait.**

## Acceptance
1. Mac (Safari + Chrome) and Windows (Edge + Chrome) users get correct install guidance; a dismissible admin-side "Install the app" affordance exists; already-installed shows nothing; green in E2E CI (run ID/URL).
2. Frontend only; zero schema; i18n ar/en/fr; RTL; brand design-system.

## Hygiene
Branch `prompt-pwa-install` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "PWA-INSTALL ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / PWA-INSTALL — desktop install + admin affordance`: the platform detection + instruction matrix (Mac Safari/Chrome, Windows Edge/Chrome), the admin-side affordance + how it coordinates with the offline-layer prompt, the already-installed no-nag, CI run ID/URL, an explicit **"Mac+Windows install guidance + admin affordance; no nag when installed; no regression: PASS/FAIL"** line, and a DRAG READ.
