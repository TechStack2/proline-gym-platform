# CODER PROMPT AX-1 — Arabic-first fidelity + targeted design elevation (+ shell accents)

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after UX-2 merges (branch `prompt-ax1-arabic-design` off post-UX-2 `main`). Design: [`../design-demo-feedback-v1.md`](../design-demo-feedback-v1.md) §6–7 + [`../design-uniform-experience.md`](../design-uniform-experience.md) [4]. **Client-stated defect from the live demo: "Arabic is not fully active on multiple pages and the font is not the best."** An Arabic-first product with broken Arabic is unsellable in this market — Arabic leads this slice.

## Build

### 1. Arabic fidelity (priority #1 — the audit IS the work)
- **Page-by-page `/ar` audit across all four shells** (landing, dashboard, portal, coach): produce a TABLE (page → defects found → fixed). Defect classes to hunt: (a) the known `isRTL ? ar : en` i18n **bypasses** (I18N-1's report-only list: HeroSection, PricingSection, TrialCTASection, FacilitySection, portal pages — start there, then sweep for the pattern globally); (b) components rendering **English under /ar** (hardcoded strings, missing `useTranslations`, wrong-locale data fields like `name_en` instead of localized pick); (c) **RTL breakage** (margins/paddings/chevrons/order not flipping — use logical properties/`rtl:` variants); (d) numerals/dates rendering inconsistently (pick one convention: Western digits, localized month names — state it in the design note).
- **Arabic webfont:** replace the default with a proper Arabic typeface via `next/font` — choose **IBM Plex Sans Arabic** or **Cairo** (pick one, justify in the audit; pair with the existing Latin stack via `font-family` fallback chains), correct weights (400/500/700), `display: swap` with size-adjusted fallback to avoid CLS, applied to BOTH `ar` content and mixed-content surfaces. The landing hero in Arabic must look like a brand, not a browser default.
- **Extend the ar e2e smoke** (I18N-1's spec): every shell's key surfaces under `/ar` assert a known ARABIC string renders (not the English fallback) — this makes "Arabic is active" a permanent regression guard, not a one-time fix.

### 2. Targeted design elevation (the owner's "layout could be improved")
- **First write `docs/design-system.md`** (the mini design-system note — ~1 page): type scale (display/heading/body/caption sizes + weights for BOTH scripts), spacing rhythm (4px grid steps used), card anatomy (padding, radius, border/shadow, header/body/footer), color tokens (brand red/black/white + semantic states + the per-shell accents below), empty-state pattern (icon + one-liner + action), button hierarchy. Every rule must be one the codebase can actually follow.
- **Apply it to the 6–8 most-seen surfaces:** landing (section rhythm, hero typography), Today (card hierarchy), Member-360 (panel anatomy, header), portal home, schedule (timetable/diary chips), money (tables/tally). Surgical: re-style, do NOT restructure flows or rename testids (the suite must stay green untouched where possible — name any spec adjustments).
- **Per-shell identity:** accent token + labeled header badge per app — staff/dashboard = brand red, coach = black/gold, member portal = a distinct cool accent — applied to header chrome, active-nav states, and per-shell PWA `theme-color`. Tenant-clean: accents are per-ROLE platform tokens layered over gym branding.

## Out of scope
New features/flows; schema (ZERO migrations); FIN-1/GRW-1 content; full design-system rebuild of every component.

## Verify (e2e, ephemeral TI gym)
1. The extended ar smoke passes: every shell's key surfaces render Arabic (assert known ar strings; no `MISSING_MESSAGE`; no English-fallback leak on the audited pages).
2. Existing full suite green (61+) — restyling broke nothing (testids stable; any spec change named + justified).
3. The landing under `/ar` renders the new font (assert the font-family on a heading via computed style or the next/font class) with no layout-shift regression on the hero.
4. Shell accents: each shell's header carries its accent/badge (smoke assert per shell).

## Acceptance
1. The page-by-page ar audit TABLE (page → defects → fixed) in the audit log — this is the slice's centerpiece.
2. `docs/design-system.md` committed; the 6–8 surfaces named with before/after notes.
3. Font choice justified; CLS guarded; ar smoke extended as a permanent gate.
4. Zero migrations; i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-ax1-arabic-design` off post-UX-2 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / AX-1 — Arabic fidelity + design elevation`: the ar audit table, font decision, design-system summary, surfaces elevated, CI run ID/URL, an explicit **"Arabic fully active on all audited pages + brand font + suite green: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **FIN-1** (horizons + owner finances + win-back).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms UX-2 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ax1-arabic-design off main (git checkout main && git pull && git checkout -b
prompt-ax1-arabic-design — main must contain UX-2; verify the FormWizard component exists before
starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-AX1-arabic-design-elevation.md
context: docs/audit/design-demo-feedback-v1.md §6–7 (client-stated defects from the live demo)

ARABIC LEADS — client quote: "Arabic is not fully active on multiple pages and the font is not the
best." ZERO migrations.
Do: (1) ARABIC FIDELITY: page-by-page /ar audit across ALL FOUR shells producing a TABLE (page →
defects → fixed); hunt four defect classes — isRTL?ar:en i18n BYPASSES (start from I18N-1's report-only
list: HeroSection/PricingSection/TrialCTASection/FacilitySection/portal pages, then sweep the pattern
globally), English-under-/ar (hardcoded strings, missing useTranslations, name_en instead of localized
pick), RTL breakage (logical properties / rtl: variants), numeral+date convention (pick one, state it);
ARABIC WEBFONT via next/font — IBM Plex Sans Arabic or Cairo (pick + justify), weights 400/500/700,
display:swap with size-adjusted fallback (no CLS), paired with the Latin stack; EXTEND the ar e2e smoke:
every shell's key surfaces under /ar assert a known ARABIC string renders — a permanent regression
guard. (2) DESIGN ELEVATION: FIRST write docs/design-system.md (~1 page: type scale for both scripts,
4px spacing rhythm, card anatomy, color tokens incl. per-shell accents, empty-state pattern, button
hierarchy) then apply it to landing, Today, Member-360, portal home, schedule, money — SURGICAL
restyling, no flow changes, testids stable (name+justify any spec adjustment). (3) SHELL IDENTITY:
accent token + labeled header badge per app (staff=brand red, coach=black/gold, portal=distinct cool
accent) on header chrome, active-nav, per-shell PWA theme-color; tenant-clean (per-ROLE tokens).
Verify in the E2E CI run, not tsc: extended ar smoke green (Arabic asserted on every shell, no English-
fallback leak on audited pages, no MISSING_MESSAGE); FULL suite green (61+, restyle broke nothing); /ar
landing renders the new font (computed-style assert) without hero layout shift; each shell's header
carries its accent (smoke per shell). If the sandbox can't run the browser, push so e2e.yml runs and
report the run ID; do NOT fabricate. Dev port 3000; scoped git add + git show --stat; no Claude/
Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / AX-1 — Arabic fidelity + design
elevation": the ar audit TABLE (the centerpiece), font decision, design-system summary, surfaces
elevated, CI run ID/URL, an explicit "Arabic fully active on all audited pages + brand font + suite
green: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me AX-1 is ready for review.
```
