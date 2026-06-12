# CODER PROMPT UX-2 — Uniform entry (FormWizard everywhere) + trials loop-closure + settings completion

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after ML-1 merges (branch `prompt-ux2-uniform` off post-ML-1 `main`). Design: [`../design-uniform-experience.md`](../design-uniform-experience.md) points [2][3][5] (operator-ratified 2026-06-12).

## Strategic context
Three operator findings, one slice: (a) the remaining prototype-era entry forms break the UX-1 wizard convention the operator explicitly wants platform-wide; (b) `/coach/trials` is a non-actionable island — the trial outcome never reaches the prospect pipeline, so staff chase coaches on WhatsApp for "did he show?"; (c) Settings is missing from the PWA/mobile nav and its plans/belts views are STATIC — gyms cannot edit membership plans or define belt ladders (the ADM-2 "empty ladders" root cause, still unfixed at the config level; ML-1's plan-change also deserves editable plans). **Tenant-clean active. Parallel lane frozen — all surfaces yours.**

## Build

### 1. Shared `FormWizard` component + conversions
Extract the UX-1/E1 wizard idiom into ONE shared component (steps with progress, chips/pills selectors, tappable presets, review step, full-screen sheet on mobile / modal on desktop, RTL-aware, no dropdowns) and convert the remaining prototype forms to it:
- **Add student** (staff): identity (names ar/en/fr, phone, DOB/gender) → guardian step for minors (search-by-phone-first, B3 origination) → membership plan selection (optional at creation) → review. Existing write path (the F1-era identity chain) — presentation rebuild only.
- **Add lead/prospect**: contact → interest (discipline chips, source chips) → next action date → review (23R write path).
- **Add/edit coach**: re-shell the ADM-2 repaired form into the wizard (same fields, same write path).
- **Membership plans + belt ladders + gym settings sections**: their editors (§3) use the same component.
Name every form converted; any form left unconverted must be named with a reason.

### 2. Trials — close the loop (the 360 journey)
- **Coach side:** trials for the coach's day appear on their schedule/today surface (not just the tab); the trials list becomes actionable — one-tap outcome: **Showed** (+ optional note + "interested?" toggle) / **No-show**. Verify `trial_classes` REAL columns first; add an outcome/note column only if missing (small migration OK).
- **Flow-back:** outcome updates the lead (stage → trial-done / no-show, `next_action_date` set per the 23R derivation), notifies staff (F2 pattern), and surfaces in the Prospects tab + the Inbox trials section if pending follow-ups exist.
- Staff scheduling a trial (23R flow) notifies the assigned coach (verify — wire if missing).

### 3. Settings completion
- **PWA nav bug:** Settings missing from the mobile/PWA nav — find and fix in `nav-config.ts` (it's role-gated config, likely dropped from the mobile More sheet).
- **Membership plans CRUD:** create/edit/archive plans (names ar/en/fr, price USD/LBP, duration, is_active) as a wizard; archive-pattern; plans feed ML-1's renewal/plan-change pickers (verify integration).
- **Belt-ladder editor:** per-discipline rank ladder CRUD on `belt_hierarchies` (ordered ranks, add/rename/reorder/archive) — the durable fix for "empty ladders": a gym can now define ranks before promotions. Reorder = tap-up/down (no drag dependency).
- Both editors live under Settings Configuration with the disciplines pattern; gym-scoped; **never weaken RLS** (verify both tables' staff policies are gym-scoped — the ADM-2/E1 sweep lesson; tighten if bare).

## Out of scope
Shell accent theming + i18n-bypass refactor (FRX, next); ON-1 invites; any new domain.

## Verify (e2e, ephemeral TI gym)
1. **Wizard convention:** create a student through the new wizard (with guardian step for a minor) → lands in Members with the guardian linked; create a lead through its wizard → appears in Prospects with next-action date.
2. **Trials loop:** staff schedule a trial (23R) → coach notified → coach's surface shows it → coach marks Showed+interested → lead stage flips to trial-done + staff notified + Prospects reflects it; a No-show path asserts too.
3. **Settings:** Settings visible in mobile nav (viewport assert); create a membership plan → it appears in ML-1's renewal/plan-change pickers; build a belt ladder for a new discipline → promote a student to its first rank (the ADM-2 flow now works for a fresh discipline end-to-end).
4. Full suite green — no regression (ML-1's count + UX-2 tests).

## Acceptance
1. The proofs green in E2E CI (run ID/URL); converted forms named; trials round-trip asserted both outcomes.
2. Real-columns audit of `trial_classes` + `belt_hierarchies` + `membership_plans`; additions named; staff RLS on all three verified gym-scoped (tightened if bare — name it).
3. ONE FormWizard implementation; no dropdowns anywhere in converted flows; i18n ar/en/fr; RTL; `tsc`+`build` clean.

## Hygiene
Branch `prompt-ux2-uniform` off post-ML-1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations (if any) via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / UX-2 — Uniform entry + trials loop + settings completion`: forms converted (named), the trials flow-back design, settings fixes (incl. the nav bug root cause), real-columns audits, CI run ID/URL, an explicit **"All entry flows wizard-uniform + trial outcome reaches the pipeline + plans/belts editable: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **FRX (locale fidelity + shell accents)**.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms ML-1 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ux2-uniform off main (git checkout main && git pull && git checkout -b prompt-ux2-uniform
— main must contain ML-1; verify run_lifecycle_tick exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-UX2-uniform-entry-settings.md
design: docs/audit/design-uniform-experience.md points [2][3][5]

Do: (1) Extract ONE shared FormWizard (steps/chips/presets/review, sheet-on-mobile, RTL, NO dropdowns)
and convert the remaining prototype forms: add student (incl. guardian step for minors, B3 search-by-
phone-first), add lead (discipline/source chips + next-action), add/edit coach (re-shell ADM-2's form),
plus the §3 editors — same write paths, presentation rebuild only; NAME every form converted and any
left with a reason. (2) TRIALS LOOP: verify trial_classes REAL columns (add outcome/note only if
missing); trials appear on the coach's day surface; one-tap outcome Showed(+note+interested)/No-show →
lead stage flips (trial-done/no-show) + next_action_date set + staff notified (F2 pattern) → Prospects
reflects; staff scheduling a trial notifies the assigned coach (wire if missing). (3) SETTINGS: fix the
PWA/mobile nav bug (Settings missing — nav-config role gating); membership plans CRUD wizard (feeds
ML-1's renewal/plan-change pickers — verify); belt-ladder editor per discipline on belt_hierarchies
(ordered add/rename/reorder/archive, tap-reorder) — the durable empty-ladders fix; verify staff RLS on
trial_classes/belt_hierarchies/membership_plans is gym-scoped (tighten if bare, name it). Archive-
pattern everywhere; i18n ar/en/fr; RTL; tenant-clean. Parallel lane frozen — all surfaces yours.
Verify in the E2E CI run, not tsc: student wizard with guardian step → Members + guardian linked; lead
wizard → Prospects + next-action; trials round-trip BOTH outcomes (schedule → coach notified → coach
marks → stage flips + staff notified); Settings visible in mobile nav (viewport assert); new plan
appears in ML-1 pickers; new discipline's belt ladder → promote a student to its first rank end-to-end;
FULL suite green (no regression). Migrations (if any) via Verify-Foundation with -f apply=true BEFORE
e2e. If the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT fabricate.
Dev port 3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS;
stay on your branch (auditor docs may land on main — don't rebase mid-run; report divergence).
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / UX-2 — Uniform entry + trials loop +
settings completion": forms converted, trials flow-back, settings fixes (nav-bug root cause), real-
columns audits, CI run ID/URL, an explicit "All entry flows wizard-uniform + trial outcome reaches the
pipeline + plans/belts editable: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me UX-2 is ready
for review.
```
