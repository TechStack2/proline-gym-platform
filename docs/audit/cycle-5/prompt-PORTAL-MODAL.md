# CODER PROMPT PORTAL-MODAL — systemic fix: portal/coach fixed modals → viewport via a shared <ModalPortal>

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-portal-modal` off `main`. **SEQUENCE: after COACH-LP merges** (so it also sweeps any modal COACH-LP adds). **Presentation/positioning only — no behavior change.** Generalizes the WaiverSign fix PORTAL-FND shipped.

## Why
PORTAL-FND fixed *one* modal (WaiverSign → `createPortal` to `<body>`). But **every** inline `fixed inset-0` modal has the same latent bug on portal/coach pages: they render inside `PageTransition`, whose `transform` makes a `position:fixed` descendant resolve against the page box, not the viewport — so on a scrolled portal/coach page the modal centers off-screen. The codebase has **zero `createPortal`**; these modals only work on staff pages because the desktop dashboard has no `PageTransition`. `f3` caught it for the waiver; the rest are still latent (and would mis-center in a demo).

## Build
1. **A shared `<ModalPortal>`** component — `createPortal(children, document.body)` with a mount guard (SSR-safe), generalizing the WaiverSign fix. Single home (e.g. `src/components/shared/modal-portal.tsx`).
2. **Audit every inline `fixed inset-0` modal reachable on portal/coach pages** and wrap each in `<ModalPortal>`: at least `book-pt-modal`, `form-wizard`, and any inline dashboard modal opened in portal/coach context (grep `fixed inset-0 z-50`). Same testids/markup; the ONLY change is escaping the transform.
3. **Consolidate WaiverSign** to use the shared `<ModalPortal>` (it has its own `createPortal` now — DRY it).
4. Confirm **no regression on staff pages** (where there's no `PageTransition`, portaling to body is a no-op for positioning).

## Out of scope
Modal behavior/content; non-modal layout; offline; new features.

## Verify (e2e)
1. For ≥2 key modals (e.g. `book-pt` on a portal/coach page, `form-wizard`), open them on a **scrolled** portal/coach page (PageTransition context) and assert the modal's box is **within the viewport** (the same `boundingBox` right/bottom ≤ viewport pattern PORTAL-FND used), not page-relative/off-screen.
2. WaiverSign still passes via the shared wrapper; staff-side modals unaffected; `/ar` clean; full suite green (no regression).

## Acceptance
1. All portal/coach `fixed inset-0` modals viewport-centered via `<ModalPortal>`; WaiverSign consolidated; green in E2E CI (run ID/URL); same testids; zero behavior change.

## Hygiene
Branch `prompt-portal-modal` off `main` **(after COACH-LP is merged)**; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "PORTAL-MODAL ready" + CI run ID.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / PORTAL-MODAL — systemic portal modal positioning`: the `<ModalPortal>` + the modal inventory wrapped, the viewport proof, CI run ID/URL, an explicit **"all portal/coach modals viewport-centered; no regression: PASS/FAIL"** line, and a DRAG READ.
