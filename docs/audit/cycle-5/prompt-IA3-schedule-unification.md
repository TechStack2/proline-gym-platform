# CODER PROMPT IA-3 — Schedule unification: week Timetable + coach Day-diary + PT conflict guard

> **For:** the MAIN coding agent (single track) · **Issued by:** Project Auditor · **Sequence:** V1 / IA phase, slice 3 (after IA-2 `milestone/IA2-green`). Branch `prompt-ia3-schedule` off current `main`. READ FIRST: the **Addendum** in [`cohesion-audit-admin-ia.md`](./cohesion-audit-admin-ia.md) (operator-approved design: two calendar species, one viewing surface).

## Strategic context
Benchmark Portal C: the Schedule workspace is the page gym managers live in, and ours is still a flat list that ignores the second calendar species entirely — **PT appointments are invisible on any calendar**, so multi-coach PT legibility (the operator's explicit concern) doesn't exist; double-bookings are caught by phone calls. Industry pattern (Mindbody/Glofox/TeamUp/Arbox): recurring classes edited as a *timetable template*, PT as *individual bookings*, both rendered on **one calendar with two views**. Deliberately out of scope (lean, V2): coach-availability engine, member self-booking of PT slots. **Tenant-clean rule active.**

## Role/Skill/Lens
`architect` + `e2e-runner`. **Recomposition + read-side logic only: ZERO new schema, ZERO write-path changes.** The conflict guard is a read-side WARNING — it must not block or alter any write (C1's lifecycle guards stay the single source of write rules). If a read needs a non-existent column, STOP and report.

## Build

### 1. `/schedule` — one calendar, two views (staff)
Keep the IA-1 segmented links (Schedule | Classes; class CRUD stays at `/classes`). Within Schedule, a view switcher:
- **Week · Timetable** (default): grid rows = time slots, cols = days (Mon-first, RTL-aware) from `classes` + `class_schedules` (gym-scoped, active). Event chips: class name + time + coach, **color-coded by discipline**. Filters: discipline, coach. Chip → class detail/roster. (Visual kin of the LP landing grid, admin density.)
- **Day · Coach diary**: date picker (default today) + resource columns = each coach with any event that day (fallback: all active coaches). Each column stacks that coach's **class slots** (from `day_of_week` = that date's weekday) and **PT sessions** (`pt_sessions` with a concrete date/time that day, any non-cancelled status). PT block → the existing C1 session lifecycle surface; class block → roster/attendance. This is the multi-coach PT legibility view.
- `/today` header gets a small "Open diary →" link to the Day view.

### 2. PT conflict guard (read-side, non-blocking)
In the EXISTING PT session scheduling/reschedule flow (C1 surfaces), when coach + date/time are chosen: query that coach's same-day events — class slots (weekday + time overlap) and other PT sessions (time overlap) — and if any overlap, render an inline **warning** (i18n: "Coach X already has {event} at {time}") with the booking still allowed (staff may intentionally double-book). NO changes to the write path, RPCs, or guards.

### 3. i18n
ar/en/fr for all new labels (views, filters, warning template); no `MISSING_MESSAGE`; Arabic-RTL correct in both views (grid direction flips).

## Verify (e2e, ephemeral TI gym)
1. **Timetable:** the seeded class renders in the week grid at its weekday/time; the discipline filter narrows it; chip links to the class.
2. **Diary + PT:** drive the existing 22R/C1 flow (approve PT package → schedule a session for the run coach today) → the Day view shows the coach's column containing BOTH the seeded class slot and the PT block; PT block links into the session lifecycle.
3. **Conflict guard:** schedule a second PT session overlapping the first (same coach) → the warning renders; booking still completes; no write-path regression (C1 tests stay green).
4. RTL smoke: `/ar` schedule renders without MISSING_MESSAGE.
5. Full suite green — no regression (36+ tests).

## Acceptance
1. Week Timetable + Day Coach-diary live, filtered, discipline-colored, both species visible — green in E2E CI (run ID/URL).
2. Conflict warning proven in CI (overlap → warning → booking still allowed).
3. ZERO migrations; zero write-path diffs (the diff must show no changes under `supabase/` and none to C1 action guards).
4. `tsc`+`build` clean; i18n complete; tenant-clean.

## Hygiene
Branch `prompt-ia3-schedule` off `main`; **dev port 3000**; scope every `git add` (never `-A`); **no Claude/Co-Authored-By trailer**; TI ephemeral gym; never weaken RLS/auth; leave the workspace on your branch only while working — do not touch `main`.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / IA-3 — Schedule unification`: the two views + sources, the conflict-guard query, CI run ID/URL, an explicit **"Both calendar species visible per coach + overlap warning: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **B3 family/household** (journey design in progress with the operator in parallel).

---

### Copy-paste activation block for the coder
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (single track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-ia3-schedule off main (git checkout main && git pull && git checkout -b prompt-ia3-schedule).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-IA3-schedule-unification.md
context: the Addendum at the bottom of docs/audit/cycle-5/cohesion-audit-admin-ia.md

RECOMPOSITION + read-side only — ZERO new schema, ZERO write-path changes (C1's lifecycle guards stay
the single write authority). If a read needs a non-existent column, STOP and report.
Do: (1) /schedule view switcher: Week·Timetable (default) — grid rows=time slots, cols=days, RTL-aware,
events from classes+class_schedules (gym-scoped, active), chips colored by discipline with name+time+
coach, filters discipline/coach, chip→class detail; Day·Coach-diary — date picker (default today),
columns per coach with events that day, each stacking class slots (day_of_week=that weekday) AND
pt_sessions (concrete date/time, non-cancelled); PT block→existing C1 lifecycle, class block→roster/
attendance. Keep IA-1's Schedule|Classes segments. /today header gets an "Open diary →" link. (2) PT
conflict guard in the EXISTING PT scheduling/reschedule flow: on coach+date/time selection, query that
coach's same-day class slots + other PT sessions; on overlap render a non-blocking inline warning
("Coach X already has … at …", i18n) — booking still allowed; NO RPC/guard/write changes. (3) i18n
ar/en/fr for all new labels; no MISSING_MESSAGE; tenant-clean (no hardcoded gym copy).
Verify in the E2E CI run, not tsc: seeded class renders in the week grid at its weekday/time + discipline
filter narrows; drive 22R/C1 (approve PT package, schedule a session today) → Day view shows the coach's
column with BOTH the class slot and the PT block, PT block links into the lifecycle; schedule a second
overlapping PT session for the same coach → warning renders AND booking still completes; /ar schedule
renders clean; FULL suite green (no regression, 36+). If the sandbox can't run the browser, push so
e2e.yml runs and report the run ID; do NOT fabricate. Dev port 3000; scope every git add (never -A); no
Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch — do not touch main.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / IA-3 — Schedule unification": the two
views + sources, the conflict-guard query, CI run ID/URL, an explicit "Both calendar species visible per
coach + overlap warning: PASS/FAIL" line, and a DRAG READ. Then STOP and tell me IA-3 is ready for
review.
```
