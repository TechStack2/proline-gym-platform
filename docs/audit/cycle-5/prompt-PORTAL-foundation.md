# CODER PROMPT PORTAL-FND — portal design-system + shell foundation (premium feel for coach & member portals)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-portal-fnd` off `main`. **Foundation only — adopt the existing design system + a consistent shell + make the drill kit available portal-side. NO new portal features/data** (the Member-360-portal and Coach-360-portal *feature* builds are separate slices, pending the operator's remaining feedback). **Zero schema.**

## Why (demo feedback)
The owner loved the staff-side premium-360, then flagged that the **self-service portals don't feel like the premium app**: the member portal is "themeless," cards aren't drillable; the coach portal is "thin / unorganized / overlapping." Root cause (audited): the staff dashboard adopted the brand design system + the `ActionCard`/`DrillDetails` kit; the **portals (`coach/*`, `portal/*`) never did** (0 files use the kit). This slice closes that *at the foundation level* — theme + shell + kit-availability — which fixes the cross-cutting "feel" complaints and **unblocks** the two portal-360 feature builds.

## Build (foundation — theming + shell + kit, not features)
1. **Unify the portal shell** — `coach/layout.tsx` + `portal/layout.tsx` adopt a **consistent, themed shell** (header + self-service nav + footer; the crimson `#cd1419` brand tokens; the tri-lingual font stack; full RTL). Mirror the staff shell's structure (`Header`/`Sidebar`/`WorkspaceSegments` patterns in `src/components/layout/`) **adapted for self-service** (a member/coach has a small fixed nav, not the 7-workspace admin rail). **Fix the overlapping/thin layout** — proper spacing, max-width, mobile + desktop.
2. **Adopt the design system across both portals' pages** (`coach/*`, `portal/*`) — replace ad-hoc/themeless markup with the `src/components/ui/*` kit (card/button/badge/…) + brand tokens + font. Consistent empty/loading states.
3. **Make `ActionCard`/`DrillDetails` usable portal-side** — confirm they import + render in portal context (no staff-only assumptions), so the portal-360 builds can use **drillable cards** without re-plumbing. (Don't add the drill data here — just availability + a single proof-of-use, e.g. one portal card rendered via the kit.)

## Out of scope
The **portal-360 feature builds** (the member's own 360 view, the coach's own 360 hub — separate slices, await operator feedback) · offline/PWA · the staff dashboard · any new data/queries/features. This is **presentation + shell only** — every change should be theming/layout/component-adoption, not new behavior.

## Verify (e2e)
1. **Both portals themed + consistent:** log in `student@` (member portal) and `coach@` (coach portal) → pages render with the **brand theme** (crimson, brand font), a **consistent shell** (no overlap, proper spacing), on mobile **and** desktop viewports.
2. **Kit available portal-side:** a representative portal page renders via a `ui/*` component; `ActionCard`/`DrillDetails` import + render in a portal page (one proof-of-use).
3. `/ar` RTL clean (no MISSING_MESSAGE, layout mirrors correctly); **no regression** to existing portal functionality (schedule/billing/PT/progress still work); full suite green.

## Acceptance
1. Coach + member portals visibly adopt the brand design system + a consistent, non-overlapping shell; the `ActionCard`/`DrillDetails` kit is usable portal-side; **zero new features/data**; green in E2E CI (run ID/URL).
2. Zero schema; presentation/shell only; i18n ar/en/fr; RTL; no portal-function regression.

## Hygiene
Branch `prompt-portal-fnd` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; **DO NOT merge** — report "PORTAL-FND ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 6 / PORTAL-FND — portal design-system + shell foundation`: what was themed/unified, the kit-availability proof, before/after of the shell, CI run ID/URL, an explicit **"coach + member portals adopt brand theme + consistent shell + drill kit available; no feature/regression: PASS/FAIL"** line, and a DRAG READ (incl. where the portal-360 feature builds attach).
