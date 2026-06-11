# CODER PROMPT REP-1 — Attendance history & reports repair + coach date picker (PARALLEL TRACK)

> **For:** the PARALLEL coding agent (Opus session, separate worktree) · **Issued by:** Project Auditor · **Sequence:** runs CONCURRENTLY with FD-1 (mainline). Branch `prompt-rep1-reporting` off current `main`.
> **PARALLEL-TRACK RULES (non-negotiable):** (1) **ZERO schema/migration/policy changes** — if a fix seems to need one, STOP and report. (2) **Touch ONLY:** `(dashboard)/attendance/history`, `(dashboard)/reports`, `coach/attendance` + their components/queries, e2e specs for them, and a dedicated i18n namespace (`reports.*` / `attendanceHistory.*` — do NOT edit keys outside your namespace). Do NOT touch /today, /inbox, /students, /money, PT surfaces, nav, or any shared component (if a shared component needs a change, STOP and report). (3) Dev server on **port 3100** (3000 belongs to the mainline). (4) Work ONLY in your worktree; never check out branches in the main repo folder.

## Strategic context
Known DOA cluster (deferred at AR, now pulled in-timeline via the parallel track): **attendance/history and attendance/reports are dead** — they query `class_schedules.date`, which doesn't exist (the recurring model is `day_of_week`; actual occurrences live in `attendance_records.attendance_date` + `schedule_id`). Coach attendance has **no date picker** (day-of-week only — a coach can't mark or review yesterday). The IA-1 rider repaired attendance *marking*; this slice repairs the read/reporting side. Reports re-enters the nav (Settings "Configuration" row or its existing route) once it actually works.

## Build
1. **`/attendance/history`:** rewrite on the real model — filters: date range (default this week), class, discipline (active+gym-scoped pickers — ADM-2 sweep conventions); rows from `attendance_records` (attendance_date, class, student via profiles, status, marked-by); per-day summary line (present/absent/late counts). Pagination or sensible limit.
2. **`/reports`:** repair to a small, honest set computed from real columns (no invented analytics): attendance by class (last 30d: sessions held, avg attendance, fill rate vs capacity), attendance by discipline, per-student attendance leaders/at-risk (≥X absences in 30d). Date-range picker. Export = none (V2) — render tables only.
3. **Coach `/coach/attendance`:** add a **date picker** (default today) — coach sees that date's *their* classes (weekday-derived) with rosters and can mark/correct attendance for that date via the EXISTING marking write path (no new writes; same upsert). Past dates only up to a sensible window (e.g., 7 days back; no future marking).
4. **Nav re-entry:** reports becomes reachable again (Settings Configuration row link or its route restored to the More sheet — smallest viable change WITHOUT touching `nav-config.ts` if possible; if nav-config must change, make it a one-line addition and flag it in the report for the auditor's merge-order attention).
5. i18n ar/en/fr **within your namespaces only**; RTL; no `MISSING_MESSAGE` on your pages.

## Verify (e2e, ephemeral TI gym — your specs only + full-suite no-regression)
1. Mark attendance via the existing flow (or reuse a spec helper) → `/attendance/history` shows the record under today's date with correct status; date-range filter excludes/includes correctly.
2. `/reports` renders the by-class table with the seeded class's real fill numbers (not NaN/empty); date range changes the aggregates.
3. Coach logs in → date picker → yesterday → sees their class roster for that weekday and can mark a correction that persists.
4. **Full suite green** — no regression (the FD-1 baseline may land mid-flight; if main moves, finish on your base, report, and the auditor handles rebase + re-run).

## Acceptance
1. History + reports render real data, filters work — green in E2E CI (run ID/URL).
2. Coach date picker proven (past-date mark persists via the existing write path).
3. ZERO schema/migrations; zero files touched outside the §Rules surface list (the diff is the proof); i18n namespaced; `tsc`+`build` clean.

## Hygiene
Branch `prompt-rep1-reporting`; worktree-only; **port 3100**; scope every `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; never weaken RLS.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / REP-1 — Attendance reporting (parallel track)`: the real-model query rewrite, the report set, the coach date-picker design, CI run ID/URL, an explicit **"History + reports render real data + coach can mark past dates: PASS/FAIL"** line, and a DRAG READ. (If `audit-cycle-update.md` conflicts at merge because the mainline appended too, that's expected — the auditor resolves.)

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL to the operator. The AUDITOR (not you) decides merge order vs the mainline slice.

---

### Operator setup (one-time, from the MAIN repo folder)
```bash
cd /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform
git worktree add ../proline-rep1 -b prompt-rep1-reporting origin/main
cd ../proline-rep1 && npm install
# open ../proline-rep1 in a NEW VS Code window → start the Opus session there → paste the block below
```

### Copy-paste activation block for the PARALLEL coder (Opus session)
```text
You are the PARALLEL coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-rep1  (a git worktree on branch
prompt-rep1-reporting — NEVER work in the main repo folder, never switch branches)

Read in full and execute exactly:
  docs/audit/cycle-5/prompt-REP1-attendance-reporting.md
Read for environment/conventions: docs/audit/cycle-5/SESSION-STATE.md + the tail of audit-cycle-update.md

PARALLEL-TRACK RULES: ZERO schema/migration/policy changes (if needed, STOP and report). Touch ONLY
(dashboard)/attendance/history, (dashboard)/reports, coach/attendance + their components/queries/specs +
a dedicated i18n namespace (reports.* / attendanceHistory.* — never edit outside it). Do NOT touch
/today, /inbox, /students, /money, PT surfaces, nav-config (one-line addition max, flagged), or shared
components (STOP and report instead). Dev server on PORT 3100 — 3000 belongs to the mainline agent.
Do: (1) /attendance/history rewritten on the REAL model (attendance_records.attendance_date +
schedule_id; the old class_schedules.date column DOESN'T EXIST — that's the DOA) with date-range/class/
discipline filters (active + gym-scoped pickers) + per-day summary. (2) /reports repaired honest-and-
small: attendance by class (30d: sessions held, avg attendance, fill rate), by discipline, per-student
leaders/at-risk; date-range picker; tables only, no export. (3) coach/attendance gets a DATE PICKER
(default today, up to 7 days back, no future): coach sees that date's own classes + rosters and marks/
corrects via the EXISTING upsert write path — no new writes. (4) Reports reachable again (smallest nav
change, flagged). (5) i18n ar/en/fr in your namespaces; RTL; no MISSING_MESSAGE on your pages.
Verify in the E2E CI run, not tsc: mark attendance → history shows it under today + range filter works;
reports render real fill numbers for the seeded class (no NaN); coach picks yesterday → marks a
correction that persists; FULL suite green. Trigger CI with: gh workflow run "E2E Verification
(behavior-green gate)" --ref prompt-rep1-reporting — and report the run ID; do NOT fabricate. If main
moves under you mid-flight, finish on your base and report — the AUDITOR handles rebase/merge order.
Scope every git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken RLS.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / REP-1 — Attendance reporting (parallel
track)": the query rewrite, report set, date-picker design, CI run ID/URL, an explicit "History +
reports render real data + coach can mark past dates: PASS/FAIL" line, and a DRAG READ. Then STOP and
tell the operator REP-1 is ready for the auditor's review.
```
