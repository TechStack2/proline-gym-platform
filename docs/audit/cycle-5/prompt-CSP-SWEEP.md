# CODER PROMPT CSP-SWEEP — find & fix every prod-CSP-stripped inline style (app-wide; HERO-FIX's root cause is systemic)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-csp-sweep` off `main`. **Frontend-only; NO CSP weakening.** **Benchmark gap (prod fidelity):** HERO-FIX proved that prod CSP (`style-src 'self' 'strict-dynamic' 'nonce-…'`, **no `'unsafe-inline'`**) **strips inline `style=""` attributes** — so `next/image fill` (positions via inline style) and any layout-critical `style={{}}` **silently break in PROD only** (dev allows `unsafe-inline`). 14 inline-style violations were counted on the landing alone; **other pages are likely degraded in prod and invisible in dev.** See [[prod-csp-strips-inline-style-attrs]] + [[prod-csp-strict-dynamic-needs-dynamic-render]].

## Build — sweep the whole app, fix the load-bearing cases (do NOT touch the CSP)
1. **Inventory** (app-wide, `src/`): every `next/image` with `fill`, and every `style={{…}}` / `style="…"` that carries **layout-critical** properties (position, inset, width/height, transform, display, flex, grid, background-image used for layout). Static/non-layout inline styles (e.g. a one-off color that doesn't affect layout) are lower priority — focus on anything that, if stripped, **moves or collapses** an element.
2. **Move load-bearing positioning to CSS classes** (CSP-safe): Tailwind utilities or arbitrary-value classes (e.g. the HERO-FIX pattern — `absolute inset-0 h-full w-full` for fill images; `bg-[...]` for layout backgrounds). **Do NOT add `'unsafe-inline'` to `style-src`** — that's a security regression; fix the call sites instead.
3. **Match the HERO-FIX precedent** (already merged/landing — reuse the same approach for consistency). Preserve any CLS stabilization ([[arabic-fontswap-rewrap-cls]]).

## Out of scope
Changing the CSP/headers/middleware; non-layout cosmetic inline styles that don't shift layout (note them, don't churn them); the dashboard header/padding (SHELL-IA owns that); backend/RLS.

## Verify — under a PROD build (the env that exhibits the bug)
1. **Local prod build + strict CSP** (`next build && next start`, prod CSP): the layout-critical violations are gone — re-run the "Refused to apply inline style" count and show it dropped to ~0 for layout-critical cases (enumerate any intentionally-left non-layout ones).
2. **Visual spot-check** the highest-risk surfaces at mobile + desktop under the prod build: hero (regression-guarded already), any other `fill` images (cards, avatars, gallery, coach photos), backgrounds — none sidelined/collapsed.
3. **Guard:** extend coverage so a future inline-layout-style regression is caught under the prod-CSP webServer (the env where it bites) — at least for the worst offenders found.
4. Validate with a **TARGETED run** over the affected projects (E2E-TIERED `-f projects="…"`).

## Acceptance
1. App-wide inventory of `fill`/layout-critical inline styles delivered; load-bearing ones moved to CSP-safe classes; **prod-build inline-style violation count for layout cases ≈ 0** (with any intentional exceptions named); a prod-CSP regression guard added; CSP **not** weakened; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-csp-sweep` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **never weaken `style-src`** (fix call sites); **verify under a local PROD build + strict CSP** (dev hides the bug); **validate TARGETED, not full** (cost); **DO NOT merge** — report "CSP-SWEEP ready" + the before/after violation count + the targeted run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / CSP-SWEEP — prod-CSP inline-style sweep`: the inventory (count + worst offenders), the class-migration fix, the before/after prod-build violation count, the guard, the targeted run ID, an explicit **"layout-critical inline styles eliminated under prod CSP; not weakened; guard added: PASS/FAIL"** line, and a DRAG READ (prod-only breakage invisible in dev; this is the class of bug behind the recurring sidelined hero).
