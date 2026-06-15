# CODER PROMPT TEAM-1 — Coach 360 hub + Day Diary reframe

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after FD-2 merges (branch `prompt-team1-coach-360` off `main`). Design: [`../design-360-today-coach.md`](../design-360-today-coach.md) (operator-locked). Mirror of the Member-360 pattern that worked. **Aim for zero schema** — `coach_availability` (PT-2), coach CRUD (ADM-1/2), `pt_assignments`/`pt_sessions`, `class_enrollments` all exist; verify real columns first.

## Strategic context
The "Open Diary" is thin and unintuitive — flat schedule, no PT, no management. **Gym 360 Pro** needs a coach-management hub as strong as Member-360. Split into two complementary surfaces, minimal overlap: the **Day Diary = the floor lens** (all coaches, one day) and **Coach 360 = the coach's file** (one coach, everything). Permissions (locked): owner + head_coach + **reception** view+manage; **deactivate** owner/head_coach only.

## Build

### 1. Day Diary reframe (the cross-coach floor lens)
Rework the IA-3 Day view: per-coach columns for the chosen day showing **classes AND booked PT sessions** (fix the missing PT — surface PT-2 `pt_sessions` with a concrete date that day; empty-state + a "book PT" affordance when none) + **open availability gaps** (published `coach_availability` windows minus booked = unbooked bookable slots = PT-upsell signal). Each coach header links → that coach's **Coach 360**. Keep the date picker + conflict warning. This answers "who's on the floor, who's free."

### 2. Coach 360 (single-coach file — the hub)
Reachable from the **Team** workspace (coach list → coach) and from the Diary. Mirror Member-360's panel anatomy:
- **Header:** photo (ADM-2 avatar), name, specialties (discipline chips), contact (tel: / wa.me), active status badge.
- **Schedule panel:** this coach's classes + PT (day/week toggle), with the conflict-aware view.
- **Availability panel:** view + **edit `coach_availability`** (recurring weekly windows + date overrides — the staff-side editor of what the coach app set in PT-2; staff can manage on the coach's behalf). Wizard/pill UI per the design-system; no dropdowns.
- **Roster panel:** members in this coach's classes (`class_enrollments`) + their PT clients (`pt_assignments`), each → Member-360.
- **Load/utilization:** sessions + classes this week / this month; a simple count (feeds FD-2's coach-load card).
- **Quick actions:** assign to a class · book a PT session for a client (PT-2 flow) · edit availability · **deactivate (owner/head_coach only — gate it; reception sees it disabled/hidden)**.
- All actions delegate to existing verified flows (ADM coach update, PT-2 booking, coach_availability writes). No new writers.

### 3. Permissions
Owner + head_coach + receptionist: view Diary + Coach 360, edit availability/assignments, book PT. **Deactivate** restricted to owner/head_coach (server-action gate on the caller's role + the existing RLS; reception gets no deactivate control). Verify `coaches`/`coach_availability` staff RLS already covers reception writes in-gym (tighten ONLY if a real gap — name it; don't weaken).

## Out of scope
Commissions/payroll (V2 per scope-lock); coach self-service changes beyond the PT-2 coach app; new schema unless a read needs a genuinely missing column (then minimal + named); Member-360 changes.

## Verify (e2e, ephemeral TI gym)
1. **Diary floor lens:** the seeded coach's column shows that day's class slot AND a booked PT session (drive a PT-2 booking first); an unbooked availability window shows as an open gap; the coach header links to Coach 360.
2. **Coach 360:** open the seeded coach → profile + schedule + availability (edit a window, it persists) + roster (a class member + a PT client both visible, each linking to Member-360) + load count.
3. **Permissions:** as receptionist, availability edit + PT booking succeed, but **deactivate is absent/blocked**; as owner, deactivate works (then re-activate to keep the suite clean).
4. `/ar` clean (no MISSING_MESSAGE); full suite green — no regression (FD-2's count + TEAM-1 tests).

## Acceptance
1. Diary shows both class + PT per coach + open gaps + links to Coach 360; Coach 360 renders all panels from live data; green in E2E CI (run ID/URL).
2. Permissions proven (reception manages scheduling/availability; deactivate owner/head_coach only); `database-reviewer`: no RLS weakened, deactivate gated on the caller's role, all actions reuse existing writers.
3. Real-columns audit of `coach_availability`/`pt_sessions`/`class_enrollments` reported; any addition minimal + named (target zero).
4. i18n ar/en/fr; RTL; design-system; `tsc`+`build` clean.

## Hygiene
Branch `prompt-team1-coach-360` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; migrations (if any) via Verify-Foundation before e2e; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / TEAM-1 — Coach 360 + Day Diary`: the diary reframe, the Coach-360 panels + sources, the permission gating, real-columns audit, CI run ID/URL, an explicit **"Day Diary floor lens (class+PT+gaps) + Coach 360 hub + reception-manage/owner-deactivate: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Then: final demo polish / readiness re-confirm before the next demo.

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms FD-2 is merged)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform / "Gym 360 Pro" (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-team1-coach-360 off main (git checkout main && git pull && git checkout -b prompt-team1-coach-360
— main must contain FD-2). Read in full and execute exactly:
  docs/audit/cycle-5/prompt-TEAM1-coach-360.md
design: docs/audit/design-360-today-coach.md (operator-locked)

Mirror the Member-360 pattern. AIM FOR ZERO schema (coach_availability [PT-2], coach CRUD [ADM-1/2],
pt_assignments/pt_sessions, class_enrollments exist — verify real columns first; any addition minimal+named).
Do: (1) DAY DIARY = cross-coach floor lens: per-coach columns for the chosen day show classes AND booked
PT (surface PT-2 pt_sessions; empty-state+book when none) + open availability gaps (published
coach_availability minus booked); coach header links → Coach 360; keep date picker + conflict warning.
(2) COACH 360 = single-coach file (from Team list + diary), Member-360 panel anatomy: header (avatar,
name, specialty chips, tel:/wa.me, active badge); schedule (classes+PT, day/week); AVAILABILITY view+edit
(staff edit coach_availability windows+overrides, pill UI, no dropdowns); roster (class_enrollments members
+ pt_assignments clients, each → Member-360); load/utilization (sessions+classes this week/month);
quick actions (assign class, book PT [PT-2], edit availability, deactivate). All delegate to existing
verified writers — no new ones. (3) PERMISSIONS: owner+head_coach+RECEPTION view+manage availability/
assignments/booking; DEACTIVATE owner/head_coach ONLY (server-action gate on caller role; reception's
control hidden/disabled); verify coaches/coach_availability staff RLS covers reception in-gym (tighten only
a real gap, named; don't weaken). Out of scope: commissions/payroll, Member-360 changes. i18n ar/en/fr,
RTL, design-system, tenant-clean.
Verify in the E2E CI run, not tsc: diary shows the seeded coach's class slot AND a booked PT (drive a PT-2
booking) + an open availability gap + header links to Coach 360; Coach 360 renders profile+schedule+
availability(edit persists)+roster(class member + PT client both → Member-360)+load; as receptionist
availability-edit + PT-book succeed but deactivate is absent/blocked, as owner deactivate works (re-activate
after); /ar clean; FULL suite green (no regression). Migrations (if any) via Verify-Foundation -f apply=true
BEFORE e2e. If the sandbox can't run the browser, push so e2e.yml runs and report the run ID; do NOT
fabricate. Dev port 3000; scoped git add + git show --stat; no Claude/Co-Authored-By trailer; never weaken
RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / TEAM-1 — Coach 360 + Day Diary": the diary
reframe, Coach-360 panels+sources, permission gating, real-columns audit, CI run ID/URL, an explicit "Day
Diary floor lens (class+PT+gaps) + Coach 360 hub + reception-manage/owner-deactivate: PASS/FAIL" line, and
a DRAG READ. Then STOP and tell me TEAM-1 is ready for review.
```
