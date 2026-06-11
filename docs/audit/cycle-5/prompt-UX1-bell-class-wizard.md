# CODER PROMPT UX-1 — Bell realtime crash fix + touch-first Add-Class wizard

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** V1 / IA phase, demo-critical repair slice (operator hit both defects in manual UI testing, 2026-06-11). Branch `prompt-ux1-bell-class-wizard` off current `main` (has IA-1/2/3). B3 follows this.

## Strategic context
Class creation is THE demo flow (admin creates a class → it appears in the IA-3 timetable AND on the public landing). The operator found it broken/clunky in manual testing, and the bell crashes with an unhandled runtime error. Both are credibility killers in front of Proline management. **Tenant-clean rule active.**

## Defect 1 — Notification bell realtime crash (diagnosed)
`src/components/notifications/notification-bell.tsx` builds `supabase.channel(`notifications:${user.id}`)`. supabase-js returns the **existing channel instance** for an already-used topic — and the bell mounts more than once (the `(dashboard)` double-shell + React strict-mode re-mounts), so the second mount calls `.on()` on an already-subscribed channel → `Error: cannot add postgres_changes callbacks … after subscribe()`.
**Fix:** make the channel topic unique per mount (e.g. append a random suffix) so each bell instance owns its own channel, keep the `removeChannel` cleanup; alternatively guard with a module-level shared subscription. Do NOT change the badge/poll/RLS behavior. Also harden the cleanup race (the async `getUser()` can resolve after unmount → only subscribe if still mounted, and remove the channel if it was created post-unmount).

## Defect 2 — Add-Class form (diagnosed: `classes/AddClassModal.tsx`)
- The **Day** dropdown and **Status** dropdown are still Radix `<Select>` — the SAME component class B2 root-caused as non-opening under the `(dashboard)` double-shell (B2 converted discipline/coach to native for this exact reason and left these two). This is the operator's "dropdowns empty / fields not functional."
- Dead **room** field — collected in the UI, never persisted (schedule insert correctly omits it). Misleads users.
- `status` default `'scheduled'` doesn't match the dropdown's own options (active/inactive/archived) — verify the real enum values in the schema and align (default should be the value that makes the class live in the timetable + landing).
- Hardcoded English error strings + a hardcoded ar/fr/en fee-label ternary.

**Rebuild as a touch-first wizard** (operator's explicit ask: "onboarding style, more touch to select"). Replace the dense modal with a stepper (full-screen sheet on mobile, modal on desktop):
1. **Step 1 · Basics** — names (ar/en/fr), **discipline as tappable chips** (from live disciplines), **coach as tappable chips** (avatar + name). No dropdowns anywhere in the wizard — chips, pills, and native inputs only.
2. **Step 2 · Weekly schedule** — **day-of-week pills (multi-select)**; one time row (start/end native time inputs + quick presets like 17:00/18:00/19:00/20:00 tappable) applied to all selected days, with optional per-day override (expand a selected day to customize). This matches the real M/W/F same-time pattern.
3. **Step 3 · Capacity & pricing** — capacity stepper (− / value / +), monthly fee USD (B2 product), status pills (the real enum values).
4. **Review → Create** — summary card, then the existing insert path (classes + class_schedules, gym_id resolution kept). On success: toast + the new class visible immediately.
Drop the room field (it lives on `classes` — out of scope; do not add it back elsewhere). All labels/errors i18n ar/en/fr; Arabic-RTL. **Zero schema changes; same insert path** (this is a presentation rebuild, not a new flow).

## Out of scope (do not touch)
The Next.js 14.2.35 upgrade nag (post-V1 maintenance); PT/coach surfaces (IA-3 just shipped them); any RLS/RPC.

## Verify (e2e, ephemeral TI gym)
1. **Wizard:** owner creates a class entirely through the wizard (chip discipline, chip coach, day pills Mon+Wed+Fri, preset time, fee) → class appears in `/classes` list AND as chips in the IA-3 week Timetable on Mon/Wed/Fri at the chosen time. (If cheap: also assert it renders on the anon landing schedule.)
2. **Bell:** collect `page.on('pageerror')` across a dashboard navigation sequence (login → /today → /inbox → /schedule) and assert ZERO unhandled errors; bell badge behavior unchanged (existing IA tests stay green).
3. `/ar` wizard renders clean (no MISSING_MESSAGE).
4. Full suite green — no regression (37+ tests).

## Acceptance
1. Wizard-created class proven in list + timetable in E2E CI (run ID/URL); no Radix selects remain in the flow; dead room field gone; status default aligned with the real enum.
2. Zero `pageerror` across the nav sequence; bell fix shown in the diff (unique topic or shared subscription + race-safe cleanup).
3. Zero migrations; i18n complete; `tsc`+`build` clean.

## Hygiene
Branch `prompt-ux1-bell-class-wizard` off `main`; **dev port 3000**; scope every `git add` (never `-A`) and **verify `git show --stat` before pushing** (your own IA-3 lesson); **no Claude/Co-Authored-By trailer**; TI ephemeral gym; never weaken RLS; stay on your branch — do not touch `main`.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / UX-1 — Bell fix + Add-Class wizard`: the bell root-cause + chosen fix, the wizard steps, the status-enum finding, CI run ID/URL, an explicit **"Wizard-created class appears in timetable + zero page errors: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **B3 family/household** (design doc in progress on locked operator forks).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ux1-bell-class-wizard off main (git checkout main && git pull && git checkout -b prompt-ux1-bell-class-wizard).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-UX1-bell-class-wizard.md

Demo-critical repair slice — ZERO schema changes. Two diagnosed defects:
(1) BELL CRASH: notification-bell.tsx reuses topic `notifications:${user.id}` — supabase-js returns the
existing already-subscribed channel on the second mount (double-shell + strict mode) so `.on()` throws
"cannot add postgres_changes callbacks after subscribe()". Fix: unique per-mount channel topic (or a
shared module-level subscription) + race-safe cleanup (getUser may resolve after unmount). Keep badge/
poll/RLS behavior identical.
(2) ADD-CLASS: AddClassModal still has Radix Selects on Day + Status (the B2-diagnosed non-opening
component under the double-shell — the operator's "empty dropdowns"), a dead room field (collected,
never saved), status default 'scheduled' that mismatches its own options (verify the REAL enum; default
must make the class live in timetable+landing), and hardcoded error/label strings. REBUILD as a touch-
first wizard (full-screen sheet mobile / modal desktop), NO dropdowns anywhere: Step 1 Basics (names
ar/en/fr, discipline CHIPS, coach CHIPS) → Step 2 Weekly schedule (day-of-week PILLS multi-select, one
start/end time row with tappable presets applied to all selected days, optional per-day override) →
Step 3 Capacity stepper + monthly fee USD + status pills → Review → Create via the EXISTING insert path
(classes + class_schedules, gym_id resolution kept). Drop the room field. i18n ar/en/fr everywhere,
RTL-correct.
Verify in the E2E CI run, not tsc: owner creates a class fully through the wizard (Mon+Wed+Fri preset
time) → appears in /classes AND as chips in the IA-3 week Timetable at the right slots; collect
page.on('pageerror') across login → /today → /inbox → /schedule and assert ZERO unhandled errors; /ar
wizard clean; FULL suite green (37+, no regression). If the sandbox can't run the browser, push so
e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scope every git add (never -A) and
check git show --stat before pushing; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your
branch — do not touch main.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / UX-1 — Bell fix + Add-Class wizard":
bell root-cause + fix, wizard steps, the status-enum finding, CI run ID/URL, an explicit "Wizard-created
class appears in timetable + zero page errors: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me
UX-1 is ready for review.
```
