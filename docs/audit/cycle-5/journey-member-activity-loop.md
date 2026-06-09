# Journey Design — Member Activity Loop (Enroll → Attend → Progress → Promote)

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the rebuild prompt is issued.
> **Relationship to other docs:** picks up exactly where [`journey-lead-to-active-member.md`](./journey-lead-to-active-member.md) ends (T6 = "active member with a membership + first invoice"). This is the **recurring life** of that member. The PT-credit boundary is decided in [`analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md) (Option A — decoupled). Skeleton: [`cross-portal-workflow-map.md`](../cross-portal-workflow-map.md) (rows "Class + schedule" and "Belt / Curriculum").
> **Method:** as-is verified against code + schema (file:line / migration:line); to-be targets **L3 Managed**, with the eligibility feedback loop at **L4 (read-only hint)**.

---

## 0. Why this journey, why now (strategic context)

**Strangler decision:** rebuild ONE coherent journey on the sound base, measure drag. This journey deliberately strangles around the platform's **best-built** flow (group-class attendance, benchmark **4/5**) — so the drag read is especially informative: if even the strong flow is a slog to extend, the rewrite case strengthens; if it's clean, strangling is validated.

**Benchmark gaps this journey closes** ([`industry-benchmark.md`](../industry-benchmark.md)):

| Capability | Score now | This journey takes it to |
|---|---|---|
| Daily roster + attendance check-in (Portal C) | **4/5** at-par | adds the missing **`attendance_absent` handoff** → stays at-par, now Managed |
| Member-visible progress / belt (Portal B) | **1/5** "Behind" (admin-only; only current belt on home) | **dedicated `/portal/progress`**: rank + history + attendance streak + eligibility → L3 |
| Belt/rank engine (Portal D) | **4/5** at-par | fixes a **non-atomic promotion defect** + adds `belt_promoted` handoff → Managed |
| Skill assessments / promotion eligibility (Portal C) | **1/5** "Behind" | **read-only eligibility hint** from attendance + time-in-rank → **L4** |
| Class enrollment confirmation | (no producer) | `enrollment_confirmed` handoff → L3 |

**The Phase-1 point:** three handoffs in this loop are **0-producer** today — `enrollment_confirmed`, `attendance_absent`, `belt_promoted`. Connective tissue is exactly Phase 1.

**Roadmap placement** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): **Phase 1 — Connective Tissue** (TRACK C, minus the billing/renewal items which are Phase 4). Member self-booking/waitlist (Phase 2), gamified streaks/leaderboards (Phase 6), and PT-session delivery (its own PT/Coach journey) are out of scope.

---

## 0.1 Origination layer (applying the principle)

Per [[journey-maps-start-at-origination]] — how a student **enters a class** (the loop's entry), by the three mechanisms:
- **Self-serve** — member books/cancels their own class → **Phase 2 (2A)**, deferred.
- **Staff-manual** — admin enrolls a student via `EnrollStudentModal` on the class-detail page → **EXISTS** ([EnrollStudentModal.tsx:69](../../src/app/[locale]/(dashboard)/classes/[id]/EnrollStudentModal.tsx#L69)), but **fires no confirmation**.
- **Automated** — auto-enroll on membership / bulk import / recurring schedule → **none** (defer).

Attendance and promotion also have an "initiation" mechanism (coach marks; coach/admin promotes); self check-in (member) and offline-sync origination are Phase 6.

---

## 1. Journey at a glance

```
  ACTIVE MEMBER ──T1 enroll──▶ ENROLLED ──T2 attend (×N)──▶ ATTENDANCE ACCUMULATES
   (from Lead T6)              in class      coach marks         │
        ▲                                    present/absent/     │ T3 feeds eligibility
        │                                    late/excused        ▼   (min_classes_attended +
        │                                         │          ┌─────────────┐  min_months_in_rank)
        │ T5 sees rank/history/streak             │          │ ELIGIBLE?   │ read-only hint (L4)
        │ on /portal/progress  ◀──────────────────┼──────────│ (coach/belt │
        │                                         │          │  engine)    │
        └────────────── T4 promote (atomic) ◀─────┘          └─────────────┘
                        belt_promotions + current_belt_rank
                        belt_promoted → student (+ guardians)
   handoffs: enrollment_confirmed · attendance_absent · belt_promoted   (all 0-producer today)
```

**Happy path:** T1 → T2 (recurring) → T3 → T4 → T5. **The signature feedback arrow:** attendance count (T2) → eligibility (T3) → promotion (T4) → member sees it (T5).

---

## 2. The cast & the surfaces

| Actor | Role | Surface |
|---|---|---|
| **Reception / Owner** | enrolls student in class; runs belt engine | `(dashboard)/classes/[id]` (`EnrollStudentModal`); `(dashboard)/belts` ([belt-engine-client.tsx](../../src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx)) |
| **Coach** | marks attendance; sees eligibility hint; recommends/records promotion | `coach/attendance` ([page.tsx](../../src/app/[locale]/coach/attendance/page.tsx)) |
| **Member** | sees rank, history, streak, eligibility | **NEW `/portal/progress`** (today only a belt card on `portal/` home) |
| **Guardian (minor)** | receives absence/promotion alerts for the child | notifications (`guardians`→`guardian_students` link) |
| **System** | fires the three handoffs | bell + `/notifications` |

---

## 3. As-is teardown (verified — the rip-out / fix list)

### T1 — Enroll · **L2 (CRUD, no handoff)**
- `EnrollStudentModal` inserts into `class_enrollments` (UNIQUE(class_id, student_id), `is_active`) from the class-detail page ([EnrollStudentModal.tsx:69](../../src/app/[locale]/(dashboard)/classes/[id]/EnrollStudentModal.tsx#L69)). Enrollment counts surface on the classes list ([classes/page.tsx:50-70](../../src/app/[locale]/(dashboard)/classes/page.tsx#L50)).
- **Gap:** no `enrollment_confirmed` notification; no member-facing acknowledgement. (Capacity is *displayed* `count/capacity` but enforcement/waitlist is Phase 2 — out of scope.)

### T2 — Attend · **L2 (strong) — the platform's best flow, but handoff-less**
- Coach selects a class, the roster loads from `class_enrollments` ([coach/attendance/page.tsx:166](../../src/app/[locale]/coach/attendance/page.tsx#L166)), and marking does an idempotent **`.upsert`** into `attendance_records` keyed on UNIQUE(class_id, student_id, date), setting `status` (`present|absent|late|excused`) + `marked_by`, Zod-validated ([:249-252](../../src/app/[locale]/coach/attendance/page.tsx#L249)).
- **Gap:** **zero notifications** — no `createNotification` anywhere in the attendance surfaces. An `absent`/`late` mark tells no one (no parent alert). This is the single missing arrow on an otherwise at-par flow.

### T3 — Accumulate / Eligibility · **absent (L0)**
- `belt_hierarchies` already carries **`min_classes_attended`** and **`min_months_in_rank`** ([000002:184-185](../../supabase/migrations/000002_create_core_tables.sql#L184)) — the inputs for promotion eligibility — and `attendance_records` has the counts. **Nothing reads them together.** No eligibility signal exists anywhere.

### T4 — Promote · **L2, with an atomicity defect + no handoff**
- The belt engine writes the promotion as **two separate client calls**: `insert` into `belt_promotions` ([belt-engine-client.tsx:190](../../src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L190)) then `update` `students.current_belt_rank` ([:209](../../src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L209)), with a **manual JS rollback** (`delete` the promotion if the update fails — [:217](../../src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L217)). This is **not a DB transaction** → a crash between the two writes leaves rank and history inconsistent.
- **Gap:** no `belt_promoted` notification to the student/guardian.

### T5 — Member sees progress · **L1 (partial)**
- `portal/` home shows the **current belt + promotion date only** (latest `belt_promotions` row — [portal/page.tsx:18-63](../../src/app/[locale]/portal/page.tsx#L18)). **No** promotion history, **no** attendance streak/count, **no** eligibility, **no** dedicated page. There is no `/portal/progress` route.

**Verdict:** the loop *mechanically* exists (enroll/attend/promote all persist) but is **handoff-less, has a promotion-atomicity bug, surfaces almost nothing to the member, and never closes the attendance→eligibility feedback arrow.**

---

## 4. The data spine (verified schema)

```
class_enrollments ─(roster)─▶ attendance_records ─(count)─▶ [eligibility] ◀─ belt_hierarchies
   (class,student)              (class,student,date,status)        │           (min_classes_attended,
                                                                   ▼            min_months_in_rank, sort_order)
                                                            belt_promotions ──▶ students.current_belt_rank
                                                            (from/to rank,         + belt_promotion_date
                                                             coach, discipline)
   guardians ─(guardian_students)─▶ students            notifications (recipient = profile_id)
```

| Table | Key columns | Source |
|---|---|---|
| `class_enrollments` | class_id, student_id, is_active, UNIQUE(class,student) | [000003:55-63](../../supabase/migrations/000003_create_operational_tables.sql#L55) |
| `attendance_records` | class_id, student_id, attendance_date, **status** (`present\|absent\|late\|excused`), marked_by, UNIQUE(class,student,date) | [000003:68-90](../../supabase/migrations/000003_create_operational_tables.sql#L68); enum [000001:54-56](../../supabase/migrations/000001_create_enums.sql#L54) |
| `belt_hierarchies` | rank, sort_order, **min_months_in_rank**, **min_classes_attended**, per discipline | [000002:174-190](../../supabase/migrations/000002_create_core_tables.sql#L174) |
| `belt_promotions` | student_id, coach_id, discipline_id, belt_hierarchy_id, from_rank, to_rank, promotion_date, notes | [000002:194-211](../../supabase/migrations/000002_create_core_tables.sql#L194) |
| `students` | **current_belt_rank**, **belt_promotion_date** (added 000010, default `white`) | [000010:11-21](../../supabase/migrations/000010_add_belt_columns.sql#L11) |
| `guardians` / `guardian_students` | guardian.profile_id, is_primary_contact; link guardian↔student | [000002:130-151](../../supabase/migrations/000002_create_core_tables.sql#L130) |
| `notifications` | user_id(=recipient profile_id), gym_id, type, title_key, body_key, params | producer RLS 000015; [create.ts](../../src/lib/notifications/create.ts) |

**Recipient resolution (notifications):** the student's own `profiles.id`; **and** fan out to linked guardians' `profiles.id` via `guardian_students → guardians.profile_id` (so a minor's parent is alerted even when the child is login-less). This respects the guardian model without building Phase-2 family management.

---

## 5. The PT-credit boundary (decided — do not re-open)

Per [`analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md): **group-class attendance and PT-session delivery are distinct completion events.** Class attendance **never** consumes a PT credit; PT pack credits have exactly **one writer** — PT-session completion (the PT/Coach journey). The original M-C2 ("attended class → decrement PT") is **struck as a category error** (a PT session has no `class_id` and never lands in `attendance_records`). Journey A reads/writes **no PT table**.

---

## 6. To-be transactions (L3 Managed; T3 at L4)

All notifications use the **sanctioned F2 pattern**: `createNotification` / `createNotificationForRole` ([create.ts](../../src/lib/notifications/create.ts)) called directly from the staff/coach Server Action with the action's authed client + recipient `profile_id`; **RETURNING-free** (never add `.select()` to a producer insert); RLS 000015 is the only guardrail.

### T1 — Enroll
- **Trigger:** staff enrolls a student into a class (`EnrollStudentModal`).
- **Writes:** keep the existing `class_enrollments` insert.
- **Notifies:** **`enrollment_confirmed`** → the student (+ guardians if minor).
- **Propagates:** the class appears on the member's `portal/schedule` (already reads `class_enrollments`) and on the coach's roster for that class.
- **Acceptance:** enrolling fires `enrollment_confirmed` to the right recipient(s); the class shows on the member's schedule.

### T2 — Attend
- **Trigger:** coach marks the roster (keep the strong idempotent upsert).
- **Writes:** `attendance_records` upsert (unchanged shape).
- **Notifies:** for each `absent` or `late`, **`attendance_absent`** → the student (+ guardians if minor). `present`/`excused` fire nothing. (Idempotent upsert ⇒ guard against re-notifying on a re-mark of the same row — only notify on a transition into absent/late.)
- **Propagates:** attendance count accrues toward T3 eligibility; member's `/portal/progress` streak updates.
- **Acceptance:** marking absent/late produces exactly one `attendance_absent` per (student, class, date) transition, recipient-scoped; re-saving the roster does not re-notify.

### T3 — Accumulate → Eligibility (read-only hint, **L4**)
- **Trigger:** computed on read (coach attendance view + belt engine), not a write.
- **Logic:** for a student's current rank in a discipline, compare **classes attended since last promotion** (`attendance_records` count where date ≥ `belt_promotion_date`) and **months in rank** (`now − belt_promotion_date`) against the next `belt_hierarchies` row's `min_classes_attended` / `min_months_in_rank` (ordered by `sort_order`). Surface an **"eligible for promotion" hint** (met / not-yet, with the shortfall).
- **Notifies:** none (a hint, not an event). **Never auto-promotes.**
- **Acceptance:** a student meeting both thresholds shows "eligible" to the coach/belt-engine; one below shows the gap. Pure read; no state change.

### T4 — Promote (atomic — fixes the defect)
- **Trigger:** coach/admin promotes (optionally from the eligibility hint).
- **Writes — ONE atomic RPC** `promote_student(p_student_id, p_to_hierarchy_id, p_notes, …)` (staff-only, gym-scoped, SECURITY DEFINER): insert `belt_promotions` (from_rank = current, to_rank, coach, discipline, date) **and** update `students.current_belt_rank` + `belt_promotion_date` **in the same transaction**. Replaces the two-write + manual-rollback path.
- **Notifies:** **`belt_promoted`** → the student (+ guardians if minor).
- **Propagates:** new rank on the belt engine, on `portal/` home, and on `/portal/progress` (history + reset streak baseline).
- **Acceptance:** promotion is all-or-nothing (no rank/history divergence on failure); `belt_promoted` reaches the student/guardian; the new rank + history surface to the member.

### T5 — Member-visible progress (the retention payoff)
- **Surface:** NEW **`/portal/progress`** showing, for the logged-in member: **current rank per discipline**, **promotion history** (`belt_promotions` timeline), **attendance count/streak** since last promotion, and the **eligibility status** from T3. RLS-scoped to the member's own student row. Arabic-RTL.
- **Acceptance:** the member sees their rank, history, streak, and "X of Y classes toward next belt" — the whole loop made visible.

---

## 7. Cross-portal propagation matrix (this journey)

| Transaction | Admin (source) | Coach | Student portal | Notifications |
|---|---|---|---|---|
| T1 Enroll | EnrollStudentModal → enrollment | class roster gains student | class on `/portal/schedule` | **`enrollment_confirmed`** → student (+guardian) |
| T2 Attend | (history/reports) | marks present/absent/late/excused | streak updates on `/portal/progress` | **`attendance_absent`** → student (+guardian) on absent/late |
| T3 Eligibility | belt engine shows hint | "eligible" hint on roster | "X of Y toward next belt" | — (read-only) |
| T4 Promote | belt engine (atomic) | promotes from hint | new rank + history | **`belt_promoted`** → student (+guardian) |
| T5 Progress | — | — | **`/portal/progress`** (rank/history/streak/eligibility) | bell reflects |

Feedback arrows made real: **attendance (T2) → eligibility (T3) → promotion (T4) → member visibility (T5)**.

---

## 8. Branch & edge paths

- **Minor → guardian fan-out** — absence/promotion notices go to the student *and* linked guardians (`guardian_students`); primary contact prioritized.
- **Present/absent/late/excused** — only `absent`/`late` notify; `excused` does not; `present` does not.
- **Re-mark / idempotent upsert** — notify only on a transition *into* absent/late, never on re-save (avoid alert spam).
- **Unenroll / transfer** — `class_enrollments.is_active=false`; out of active roster; no notification required this slice.
- **Multi-discipline belts** — rank is per discipline (`belt_promotions.discipline_id`); eligibility + progress are computed per discipline.
- **Promotion correction/rollback** — handled by a new promotion (or a staff correction); the atomic RPC prevents partial state. Demotion/undo UI is out of scope.

---

## 9. As-is → To-be gap + maturity ladder

| Transaction | As-is | Target | Gap to close | Benchmark cap |
|---|:--:|:--:|---|---|
| T1 Enroll | L2 | **L3** | `enrollment_confirmed` handoff | (CRM/engagement) |
| T2 Attend | L2 (strong) | **L3** | `attendance_absent` handoff + guardian fan-out; transition-guard | Attendance 4 (hold) |
| T3 Eligibility | L0 | **L4** | compute hint from attendance + time-in-rank vs `belt_hierarchies` | Assessments 1→ (hint) |
| T4 Promote | L2 (+bug) | **L3** | atomic `promote_student` RPC; `belt_promoted` handoff | Belt engine 4 (hold) |
| T5 Progress | L1 | **L3** | `/portal/progress` (rank/history/streak/eligibility) | Visible progress 1→3 |

**In scope:** T1–T5 as above, the atomic promotion RPC, the eligibility computation (read-only), `/portal/progress`, the three notification producers + guardian fan-out, and a behavior-green e2e spec.

**Deliberately deferred (keep extensible; don't block):**
- Member **self-booking / cancel / waitlist** + capacity enforcement → **Phase 2 (2A)**.
- **Gamification** (streak badges, leaderboards, digital certificates) → **Phase 6** — T5 shows a streak *number*, not a game.
- **Skill assessments / curriculum checkpoints** (beyond the eligibility hint) → **Phase 3 (3B)**.
- **PT-session delivery + credit** → its own **PT/Coach journey** (the seam, §5).
- **Offline / self check-in** attendance origination → **Phase 6** (`attendance_records.offline_sync_id` is ready).
- Coach↔parent **messaging** → Phase 3.

**Leapfrog lanes to respect:** Arabic-first RTL on `/portal/progress` and all new surfaces; WhatsApp-friendly notifications (the `attendance_absent`/`belt_promoted` producers are where WhatsApp-native plugs in later); offline-readiness (don't regress the attendance upsert's `offline_sync_id`).

---

## 10. Open decisions for the user

The three structural forks (eligibility hint **in**; dedicated `/portal/progress` **in**; PT seam **decoupled**) are decided. Smaller defaults I'll take unless you redirect:
1. **Guardian fan-out:** notify student **and** all linked guardians (primary contact first). *Default = yes, fan out.*
2. **Attendance-notify scope:** notify on `absent` **and** `late`; `excused`/`present` silent. *Default = absent+late.*
3. **Eligibility surface:** show the hint to **coach + belt-engine (staff)** and the "toward next belt" number to the **member**; do not show a blunt "you're eligible" claim to the member (avoids entitlement pressure on the coach). *Default = staff sees "eligible"; member sees progress number.*
4. **Promotion RPC name/shape:** `promote_student(...)` mirroring `convert_lead_to_member`. *Default = yes.*

---

## 11. Rebuild-slice definition (seeds the coder prompt — not the prompt itself)

**One sequential slice on the current base.** Extend the strong attendance flow + fix the promotion defect; add the missing handoffs, eligibility, and member visibility.

- **Migrations:** atomic `promote_student(...)` RPC (staff-only, gym-scoped) replacing the two-write client path; (confirm `class_enrollments` staff INSERT RLS already supports `EnrollStudentModal`).
- **Server actions / handlers:** enrollment-confirm, attendance-mark side-effect (transition-guarded `attendance_absent`), promote (call RPC + `belt_promoted`) — all via the **sanctioned notification pattern**, with **guardian fan-out** helper (`guardian_students → guardians.profile_id`).
- **Eligibility:** a read helper computing classes-since-promotion + months-in-rank vs `belt_hierarchies`; surfaced on the coach attendance view + belt engine (staff) and as a progress number to the member.
- **UI:** NEW **`/portal/progress`** (rank per discipline / history / streak / eligibility number), Arabic-RTL; eligibility hint on coach + belt-engine; i18n keys (`notifications.enrollment_confirmed/attendance_absent/belt_promoted.*` + progress strings) in **ar/en/fr**, no `MISSING_MESSAGE`.
- **Behavior-green e2e:** new spec asserting on the cloud DB — enroll → `enrollment_confirmed` + class on member schedule; mark absent → `attendance_absent` to student/guardian (and no re-notify on re-save); promote (atomic) → `belt_promoted` + new rank; `/portal/progress` shows rank/history/streak/eligibility. Fail loudly if any portal doesn't reflect a step.
- **Strategic-context block** (benchmark gaps §0 + Phase-1 placement + deferrals §9) carried in the prompt.
- **F2 hygiene:** scoped `git add`, gitignored `node_modules`, manual worktree if needed.
- **Drag read:** candid "clean vs slog" — *especially* meaningful here since we're extending the platform's strongest flow.

---

*Awaiting sign-off. On approval I issue ONE sequential coder prompt for this slice — and queue the PT/Coach delivery journey (the seam's other half) as the next design.*
