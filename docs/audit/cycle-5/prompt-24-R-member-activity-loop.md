# CODER PROMPT 24-R — Member Activity Loop: Clean Rebuild (single sequential slice)

> **For:** Coding agent (ONE agent, sequential — **not** a parallel mission) · **Issued by:** Project Auditor · **Sequence:** Phase 1, after 23-R. This replaces the deferred parallel Prompt 24 (TRACK C), scoped to the **activity loop only** (billing/renewal items moved to Phase 4; PT-credit decoupled to its own journey).
> **Strangler framing:** rebuild ONE journey cleanly on the current base and report an honest **drag read** at the end. This slice extends the platform's **strongest** flow (group-class attendance, 4/5), so the drag read is especially informative — be candid.
> **The spec is the journey design doc + the seam analysis — read both first; they are authoritative:**
> 📎 [`docs/audit/cycle-5/journey-member-activity-loop.md`](./journey-member-activity-loop.md)
> 📎 [`docs/audit/cycle-5/analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md) (the PT-credit boundary — binding)
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `tdd-guide` + `database-reviewer`** (`/Arsenal/ecc/agents/`): `tdd-guide` drives the notification side-effects + the eligibility computation; `database-reviewer` verifies the new atomic `promote_student` RPC (staff-only, gym-scoped, truly transactional) and that notification fan-out introduces no cross-gym leak. Pull in `architect` to model the eligibility/feedback loop.
- **Apply superpower `test-driven-development`** (`/Arsenal/superpowers/skills/test-driven-development/`): write the failing assertions first — "marking absent produces exactly one `attendance_absent` for the right recipients (and re-saving does NOT re-notify)"; "promotion is atomic (rank + history never diverge)"; "the member sees rank/history/streak on `/portal/progress`." Then `verification-before-completion`: **"done" = green in the e2e behavior harness in CI**, not `tsc`/`build`.
- **Lens:** [`cross-portal-workflow-map.md`](../cross-portal-workflow-map.md) — a **vertical slice** with a real feedback arrow: **enroll → attend (×N) → attendance accumulates → eligibility → promote → member sees progress**. Maturity target: **L3 Managed**, with the **eligibility hint at L4** (read-only).

## Strategic context — what this closes, and what it deliberately does NOT (read first)
**Directly responsive to the benchmark** ([`industry-benchmark.md`](../industry-benchmark.md)). It closes:
- *Member-visible progress* **1/5 "Behind"** (belts admin-only; only current belt on home) → **dedicated `/portal/progress`** (rank + history + attendance streak + eligibility) → L3.
- *Attendance handoff* — attendance is **4/5 at-par** but **handoff-less** → add `attendance_absent` (with guardian fan-out) → Managed.
- *Belt engine* **4/5 at-par** but a **non-atomic promotion defect** → atomic RPC + `belt_promoted` handoff → Managed.
- *Promotion eligibility / assessments* **1/5** → a **read-only eligibility hint** from attendance + time-in-rank → **L4**.
- `enrollment_confirmed` handoff (0 producers today).

**Where it sits** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): **Phase 1 — Connective Tissue** (TRACK C, activity loop). Make the loop **real, Managed, and visible** — NOT best-in-class yet.
- **Do NOT build now (later phases; keep extensible):** member **self-booking / cancel / waitlist** + capacity enforcement (**Phase 2 / 2A**); **gamification** — streak *badges*, leaderboards, certificates (**Phase 6**; show a streak *number*, not a game); **skill assessments / curriculum** beyond the eligibility hint (**Phase 3 / 3B**); **offline / self check-in** attendance origination (**Phase 6**; don't regress `attendance_records.offline_sync_id`); coach↔parent **messaging** (Phase 3).
- **Leapfrog lanes to respect:** Arabic-first RTL on `/portal/progress` + every new surface; WhatsApp-friendly notifications (the `attendance_absent`/`belt_promoted` producers are the WhatsApp-native plug-in point); offline-readiness of the attendance upsert.

## ⛔ PT-credit boundary (binding — do not cross)
Per [`analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md): **group-class attendance NEVER consumes a PT credit.** This slice reads/writes **no PT table** (`pt_assignments`, `pt_sessions`, `pt_packages`) and **never calls `increment_sessions_used`**. The original M-C2 ("attended class → decrement PT") is **struck as a category error** (a PT session has no `class_id` and never lands in `attendance_records`). PT-session delivery + credit is a separate PT/Coach journey.

## Sanctioned NOTIFICATION pattern (F2 — use everywhere)
Call **`createNotification` / `createNotificationForRole`** ([src/lib/notifications/create.ts](../../src/lib/notifications/create.ts)) **directly from the staff/coach Server Action**, passing the action's **authenticated `supabase` client** + the recipient's **`profile_id`**. **RETURNING-free** — **NEVER add `.select()`/RETURNING to a producer insert** (the F2 `42501` root cause). RLS `000015` is the only guardrail; no `SECURITY DEFINER` bypass.
- **Guardian fan-out (minors):** resolve recipients = the student's own `profiles.id` **and** linked guardians' `profiles.id` via `guardian_students → guardians.profile_id` (primary contact first). So a login-less child's parent is alerted.

---

## What you are building — T1…T5 (see the journey doc §6 for full anatomy)

### T1 — Enroll
- Keep the existing `class_enrollments` insert ([EnrollStudentModal.tsx:69](../../src/app/[locale]/(dashboard)/classes/[id]/EnrollStudentModal.tsx#L69)). On enroll, emit **`enrollment_confirmed`** → student (+ guardians if minor) from the enroll server action.

### T2 — Attend (extend the strong flow; do not rewrite it)
- Keep the idempotent `.upsert` into `attendance_records` ([coach/attendance/page.tsx:249-252](../../src/app/[locale]/coach/attendance/page.tsx#L249)). On a mark of **`absent`** or **`late`**, emit **`attendance_absent`** → student (+ guardians). `present`/`excused` fire nothing.
- **Transition-guard:** notify only on a transition *into* absent/late for a given (student, class, date) — **re-saving the roster must NOT re-notify**. (Check prior status before firing.)

### T3 — Accumulate → Eligibility (read-only hint, **L4**)
- Compute, per student per discipline: **classes attended since last promotion** (`attendance_records` where `attendance_date ≥ students.belt_promotion_date`, status in present/late) and **months in rank** (`now − belt_promotion_date`), vs the **next** `belt_hierarchies` row (by `sort_order`, same discipline) `min_classes_attended` / `min_months_in_rank` ([000002:184-185](../../supabase/migrations/000002_create_core_tables.sql#L184)).
- Surface **"eligible / not-yet (+ shortfall)"** to the **coach attendance view + belt engine** (staff). To the **member** (on `/portal/progress`) show only the **progress number** ("X of Y classes toward next belt"), not a blunt "you're eligible." **Read-only — never auto-promote.**

### T4 — Promote (atomic — fix the defect)
- New **`promote_student(p_student_id, p_to_hierarchy_id, p_discipline_id, p_notes, …)`** RPC (staff-only, gym-scoped, SECURITY DEFINER): insert `belt_promotions` (from_rank = current, to_rank, coach, discipline, promotion_date) **and** update `students.current_belt_rank` + `belt_promotion_date` **in ONE transaction**. Replace the two-write + manual-JS-rollback client path ([belt-engine-client.tsx:190,209,217](../../src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L190)).
- Emit **`belt_promoted`** → student (+ guardians).

### T5 — Member-visible progress (the retention payoff)
- NEW route **`/portal/progress`**, RLS-scoped to the member's own student row: **current rank per discipline**, **promotion history** (`belt_promotions` timeline), **attendance count/streak** since last promotion, and the **eligibility progress number** from T3. Arabic-RTL.

### i18n
- Add `notifications.enrollment_confirmed / attendance_absent / belt_promoted` (`.title`/`.body`) + all new UI strings to **ar/en/fr** ([src/i18n/messages/](../../src/i18n/messages/)). No `MISSING_MESSAGE`.

### §10 defaults (apply as specified)
Guardian fan-out **on** (primary contact first); notify on **absent + late** only; staff see **"eligible"**, member sees the **progress number**; promotion RPC named **`promote_student`**.

## Lock it under the harness (the durable deliverable)
Add a **Member-Activity-Loop spec** to `e2e/` (own file, e.g. `e2e/activity-loop.spec.ts`) per [`e2e/README.md`](../../e2e/README.md), resilient selectors (surgical `data-testid`s if needed). On the **cloud DB**, drive real logins and assert real state:
1. **Enroll:** enrolling a student fires `enrollment_confirmed` (right recipient) and the class appears on the member's `/portal/schedule`.
2. **Attend:** marking `absent`/`late` fires exactly one `attendance_absent` to the student (+ guardian); **re-saving the same roster does NOT produce a second notification**; `present`/`excused` fire none.
3. **Promote:** the atomic RPC promotes (rank + history consistent) and fires `belt_promoted`; a forced mid-transaction failure leaves **no** divergence (rank ↔ history).
4. **Progress:** `/portal/progress` shows the member's rank, promotion history, attendance streak, and "X of Y toward next belt."
- Idempotent / re-runnable (uniquely-scoped data per run). **Fail loudly** (not skip) if any portal doesn't reflect a step.

## Acceptance Criteria — the harness is the judge
1. The full activity loop is **green in the E2E CI run** against the cloud DB (report run ID + URL); screenshots uploaded.
2. `enrollment_confirmed` / `attendance_absent` / `belt_promoted` are produced, recipient-scoped (student + guardians, no cross-gym leak); attendance notify is **transition-guarded** (no re-notify on re-save).
3. Promotion is **atomic** via `promote_student` (no rank/history divergence on failure); the old two-write client path is gone.
4. The eligibility hint computes correctly (staff "eligible"; member progress number) and **never auto-promotes**.
5. `/portal/progress` renders rank/history/streak/eligibility, RLS-scoped, Arabic-RTL.
6. `tsc` + `next build` clean. **No PT table touched; `increment_sessions_used` never called.** No RLS/auth weakened; the promotion RPC is staff-only + gym-scoped.

> **Honesty rule (from F1/F1.1/22-R/23-R):** if your sandbox can't run Playwright/cloud, say so and **push so `e2e.yml` CI runs it** — then report the actual CI run ID + result. Do **not** fabricate a "what rendered" table; CI is the source of truth.

## Hygiene (F2 lessons — non-negotiable)
- **Scope every `git add`** to the files you changed — **never `git add -A`**.
- `node_modules` stays **gitignored**.
- Manual git worktree only if you parallelize locally (the Agent-tool `isolation:"worktree"` fails here). This slice is sequential.
- Dev on a **non-3000 port** (`npm run dev -- -p 3100`); `(dashboard)` renders twice → scope Playwright with `:visible`/`.first()`; login is `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 1 / Prompt 24-R — Member Activity Loop Rebuild`. Include:
- A **per-transaction PASS/FAIL table** (T1, T2, T3, T4, T5) with **file:line** proof.
- The **E2E CI run ID + URL** and result.
- Migration(s) added (the `promote_student` RPC) + confirmation it applied to the cloud ledger.
- Notification recipients confirmed (student + guardian fan-out) and the transition-guard proof (no re-notify on re-save).
- Atomicity proof for the promotion (rank ↔ history consistent under failure).
- An explicit **"Member activity loop behavior-green: PASS/FAIL"** line.
- **DRAG READ (required, candid):** did extending the platform's strongest flow (attendance) + the belt engine feel **CLEAN** (like 22-R/F2/23-R) or a **SLOG**? Cite specifics — what the sound base gave you for free vs what fought you (the non-atomic promotion path, the missing eligibility plumbing, i18n, RLS, type drift). This extends the strangle-vs-rewrite signal across a *strong* flow — do not soften it.

## Scope discipline & hand-back
Build the **Member Activity Loop only** (T1–T5) + its harness spec. No PT coupling, no self-booking/waitlist, no gamification, no adjacent refactors. Stop after updating `audit-cycle-update.md`; tell the auditor whether the loop is behavior-green **and give the drag read**. Next the auditor designs the **PT/Coach delivery journey** (the seam's other half).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full, then read the two docs it points to, and execute exactly:
  docs/audit/cycle-5/prompt-24-R-member-activity-loop.md
  docs/audit/cycle-5/journey-member-activity-loop.md            (authoritative anatomy)
  docs/audit/cycle-5/analysis-class-attendance-vs-pt-session-seam.md  (PT-credit boundary — binding)

Strategic context: we are STRANGLING, not rewriting. Rebuild ONE journey cleanly on the current
base and report an honest drag read — this slice extends the platform's STRONGEST flow (group-class
attendance), so the drag read matters. Implement the Member Activity Loop to L3 (eligibility at L4):
  T1 Enroll — keep the class_enrollments insert; emit enrollment_confirmed -> student (+guardians).
  T2 Attend — keep the strong idempotent attendance_records upsert; on absent/late emit
     attendance_absent -> student (+guardians), TRANSITION-GUARDED (re-saving the roster must NOT
     re-notify); present/excused fire nothing.
  T3 Eligibility (read-only L4 hint) — classes since belt_promotion_date + months-in-rank vs the
     next belt_hierarchies row (sort_order, same discipline) min_classes_attended/min_months_in_rank;
     show "eligible/not-yet" to coach+belt-engine (staff) and a "X of Y toward next belt" number to
     the member; NEVER auto-promote.
  T4 Promote — NEW atomic RPC promote_student(...) (staff-only, gym-scoped): insert belt_promotions
     + update students.current_belt_rank/belt_promotion_date in ONE transaction, replacing the
     two-write + manual-JS-rollback client path; emit belt_promoted -> student (+guardians).
  T5 /portal/progress — NEW route, RLS-scoped to own student: rank per discipline + promotion history
     + attendance streak + eligibility number, Arabic-RTL.
BINDING BOUNDARY: group-class attendance NEVER consumes a PT credit. Touch NO PT table
(pt_assignments/pt_sessions/pt_packages); NEVER call increment_sessions_used. M-C2 is struck.
Notifications: sanctioned pattern — createNotification/createNotificationForRole directly from the
staff/coach Server Action with the action's authed client + recipient profile_id; RETURNING-free
(no .select() on a producer insert); guardian fan-out via guardian_students->guardians.profile_id.
Add i18n (ar/en/fr) for the 3 notification types + progress strings; Arabic-RTL; no MISSING_MESSAGE.
Add e2e/activity-loop.spec.ts asserting enroll->confirm + class on schedule; absent->attendance_absent
(and NO re-notify on re-save); atomic promote->belt_promoted + consistent rank/history; /portal/progress
shows rank/history/streak/eligibility. Verify in the E2E CI run, not tsc — if your sandbox can't run
the browser, push so e2e.yml runs and report the actual run ID + result; do NOT fabricate results.
Hygiene: scope every git add (never -A); node_modules gitignored; non-3000 dev port; (dashboard)
renders twice -> :visible/.first(); login is button[type="submit"]. Do NOT weaken any RLS/auth.
When done, append to audit-cycle-update.md under "Cycle 5 / Phase 1 / Prompt 24-R — Member Activity
Loop Rebuild" with a per-transaction PASS/FAIL table (file:line), CI run ID/URL, the promote_student
migration, notification recipients + transition-guard proof, promotion atomicity proof, an explicit
"Member activity loop behavior-green: PASS/FAIL" line, AND a candid DRAG READ (clean vs slog, with
specifics — especially meaningful since this extends the strongest existing flow). Then STOP and tell
me 24-R is ready for review.
```
