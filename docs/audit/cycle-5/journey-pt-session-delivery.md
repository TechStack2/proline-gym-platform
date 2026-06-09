# Journey Design — PT Session Delivery (Schedule → Deliver → Consume → Recover)

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only — design, not code)
> **Status:** DESIGN — awaiting sign-off before the rebuild prompt.
> **This is C1 in** [`../journey-catalog.md`](../journey-catalog.md) — the **delivery half of PT**, the other half of the [attendance↔PT-session seam](./analysis-class-attendance-vs-pt-session-seam.md), and it **completes D4** (PT package lifecycle). 22-R built PT *acquisition* (request→approve→bill→roster); this builds *delivery* (the part that consumes credits) — designed deep, multi-angle, best-practice, with **error recovery + edge cases first-class** per the standing mandate.
> **Method:** as-is verified against code + schema; to-be targets **L3 Managed**.
> **Decided forks:** no-show credit = **gym-configurable (default: forfeits)**; late-cancel = **gym-configurable (default: free the credit)**; scheduling = **full schedule→deliver lifecycle**.

---

## 0. Why this journey, why now (strategic context)

**Benchmark** ([`industry-benchmark.md`](../industry-benchmark.md)): *"PT session logging → pack decrement — `increment_sessions_used()` exists but … no real session record"* — **0/5 "Behind"**, and *"Coach sees assigned PT students"* was the 22-R win. This journey takes PT delivery from a **bare counter bump** to a real **appointment lifecycle with credit integrity and recovery** → L3.

**Single-writer rule (binding, from the seam analysis):** *PT pack credits have exactly one writer — PT-session completion.* Today the "one writer" is a counter with no session record; this journey makes **`pt_sessions` the source of truth** and the counter a consistent, audited consequence of it.

**Roadmap** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): straddles **Phase 1** (the credit-consumption handoff is connective tissue) and **Phase 3** (fuller coach surface). We build the lifecycle + integrity now; coach availability/booking-UX polish stays Phase 3.

**Deferred (keep extensible):** member **self-booking** of a PT slot (Phase 2/5); coach **availability calendar** (Phase 3); real WhatsApp reminders (Phase 6). Leapfrog lanes respected: Arabic-RTL surfaces, dual-currency already on the PT invoice (22-R), offline-friendly.

---

## 0.1 Origination layer (how a PT session enters the system)

- **Staff/coach schedules** a session from an **active assignment** (the primary path this slice builds).
- **Coach logs-on-delivery** — records a session that just happened (schedule + complete in one step).
- **Member self-books** a PT slot → **Phase 2/5, deferred** (the assignment + credits already exist as the entitlement).

A session can only originate against an `pt_assignments` row that is **`status='active'`, has `sessions_remaining > 0`, and is not past `expires_at`** — enforced at origination.

---

## 1. Journey at a glance

```
  PT ASSIGNMENT (active, N credits)         ── origination ──▶ schedule / log
   (from 22-R: request→approve→bill→roster)                         │
        │                                                            ▼
        │                                        ┌──────────── SCHEDULED ───────────┐
        │                                        │ pt_sessions(status=scheduled,     │
        │                                        │ coach, scheduled_at)              │
        │                                        ▼                                   ▼
        │                              DELIVER → COMPLETED                 CANCEL / NO_SHOW
        │                              status=completed                    (policy decides credit)
        │                              + ONE credit decremented            │
        │                              (atomic, idempotent)                ▼
        │                                        │              RESTORE credit (staff, audited)
        ▼                                        ▼
  remaining hits 0 → assignment status=completed; member sees session history + credits
  handoffs: pt_session_scheduled · pt_session_completed · pt_session_cancelled · pt_credits_exhausted
```

**Happy path:** assignment → schedule → deliver → complete (−1 credit) → state-back. **Branches:** no-show, cancel (within/after policy window), reschedule, coach reassignment, restore/refund, pack expiry, exhaustion.

---

## 2. The cast & the surfaces

| Actor | Role | Surface |
|---|---|---|
| **Coach** | schedules/logs, delivers, completes, marks no-show | `coach/pt` ([pt-roster-client.tsx](../../src/app/[locale]/coach/pt/pt-roster-client.tsx)) + a new session lifecycle UI |
| **Reception / Owner** | schedules on behalf, corrects, **restores credits**, sets policy | `(dashboard)/pt` + `(dashboard)/settings` (policy toggles) |
| **Student / parent** | sees scheduled sessions, history, remaining credits | `portal/pt` ([pt-request-client.tsx](../../src/app/[locale]/portal/pt/pt-request-client.tsx)) |
| **System** | fires the handoffs | bell + `/notifications` |

---

## 3. As-is teardown (verified — the rip-out / fix list)

### Delivery · **L1 (a counter, no story)**
- **`pt_sessions` is NEVER written** — no `insert`/`update` anywhere in `src` (verified). The table that should record each 1-on-1 (`scheduled_at`, `duration_minutes`, `status` ∈ scheduled/completed/cancelled/no_show — [000003:228-241](../../supabase/migrations/000003_create_operational_tables.sql#L228), enum [000001:59-61](../../supabase/migrations/000001_create_enums.sql#L59)) is **fully orphaned**.
- The coach "Log session" action is a **bare counter bump**: `supabase.rpc('increment_sessions_used', { assignment_id })` + toast ([pt-roster-client.tsx:43-50](../../src/app/[locale]/coach/pt/pt-roster-client.tsx#L43)). `increment_sessions_used` ([000012:47-69](../../supabase/migrations/000012_create_pt_assignments.sql#L47)) just `sessions_used += 1` guarded by `sessions_used < sessions_total`. **No session record, no date, no coach attribution, no notes, no notification, no no-show/cancel, no refund.**
- Consequence: you know *how many* credits were used but never *when / by whom / what happened*. No member-visible history, no recovery path, no audit.

**Verdict:** PT delivery is a write-only counter. The `pt_sessions` ledger, the lifecycle states, and every recovery path are **absent**.

---

## 4. The data spine (verified schema)

```
pt_assignments ──1:N──▶ pt_sessions          (the session ledger — currently empty)
  status (requested/approved/active/             status (scheduled/completed/cancelled/no_show)
   completed/cancelled), coach_id,               scheduled_at, duration_minutes, package_id, coach_id
   sessions_total/used/REMAINING(generated),
   expires_at, invoice_id                     audit_logs ◀── credit moves (old/new JSONB, changed_by)
                                              gyms ◀── NEW PT-policy settings (no-show/late-cancel)
                                              notifications (recipient = profile_id)
```

| Table | Key columns | Source |
|---|---|---|
| `pt_assignments` | `status`, `coach_id`, `sessions_total`, `sessions_used`, **`sessions_remaining` GENERATED**, `expires_at`, `invoice_id`, `CHECK sessions_used ≤ total` | [000012:11-25](../../supabase/migrations/000012_create_pt_assignments.sql#L11), [000016](../../supabase/migrations/000016_pt_request_workflow.sql) |
| `pt_sessions` | `student_id`, `coach_id`, `package_id`, `scheduled_at`, `duration_minutes`, `status` | [000003:228-241](../../supabase/migrations/000003_create_operational_tables.sql#L228) — **+ needs `assignment_id` FK** (today it links `package_id`, not the assignment that holds the credits) |
| `gyms` | **+ PT policy columns** (`pt_no_show_forfeits` bool default true; `pt_late_cancel_window_hours` int default 0) | [000002:10-32](../../supabase/migrations/000002_create_core_tables.sql#L10) (no settings today) |
| `audit_logs` | table_name, record_id, operation, old_data/new_data, changed_by | [000003:466-477](../../supabase/migrations/000003_create_operational_tables.sql#L466) |

**Schema gap to fix:** `pt_sessions` references `package_id` but **not the `assignment_id`** that owns the credits. Add `assignment_id UUID REFERENCES pt_assignments(id)` so completion can decrement the correct assignment deterministically.

---

## 5. The completion contract (the heart — single-writer + atomic + idempotent)

A new **`complete_pt_session(p_session_id)`** RPC (staff/coach, gym-scoped, SECURITY DEFINER) is the **only** path that consumes a credit:
1. Lock the `pt_sessions` row; **if already `completed`, return no-op** (idempotency — double-click / retry safe; never double-decrement).
2. Verify the linked `pt_assignments` is active, `sessions_remaining > 0`, not expired.
3. Set `pt_sessions.status='completed'` **and** `sessions_used += 1` on the assignment **in one transaction**.
4. If `sessions_remaining` reaches 0 → set assignment `status='completed'`.
5. Write an `audit_logs` row for the credit move.

The **bare `increment_sessions_used` path is retired** from the UI (kept defined, forward-only); all consumption flows through `complete_pt_session`. Cancel/no-show/restore are sibling RPCs with the same locking + audit discipline.

---

## 6. To-be transactions (L3 Managed)

All notifications via the **sanctioned F2 pattern** (`createNotification`/`createNotificationForRole`, authed client, recipient `profile_id`, RETURNING-free; guardian fan-out for minors).

### T1 — Schedule (origination)
- **Trigger:** coach/staff schedules from an active assignment (or logs-on-delivery = schedule+complete).
- **Writes:** `pt_sessions` (assignment_id, student, coach, scheduled_at, duration, status `scheduled`). **Preconditions enforced:** assignment active + `remaining>0` + not past `expires_at`; else reject with a clear reason.
- **Notifies:** **`pt_session_scheduled`** → student (+guardian) and the assigned coach.
- **Propagates:** appears on coach roster/calendar + student `portal/pt`.
- **Acceptance:** scheduling creates a `scheduled` session, notifies both parties, and is blocked on an exhausted/expired/inactive assignment.

### T2 — Deliver → Complete (consumes the credit)
- **Trigger:** coach/staff marks the scheduled session delivered.
- **Writes:** `complete_pt_session` (§5) — atomic, idempotent, audited; assignment auto-completes at 0.
- **Notifies:** **`pt_session_completed`** → student (credits updated); **`pt_credits_exhausted`** → student + staff when remaining hits 0.
- **Acceptance:** completion decrements exactly one credit, records the session, is idempotent (re-complete = no-op), and surfaces in the student's history.

### T3 — No-show
- **Trigger:** coach/staff marks `no_show`.
- **Writes:** `pt_sessions.status='no_show'`; **credit forfeited iff `gyms.pt_no_show_forfeits`** (default true) → decrement via the same atomic+audited path; else no decrement.
- **Notifies:** **`pt_session_no_show`** → student (+guardian) + staff.
- **Acceptance:** no-show records the session and consumes a credit only per the gym policy; auditable; refundable via T5.

### T4 — Cancel / Reschedule
- **Cancel trigger:** member or staff cancels a scheduled session.
- **Writes:** `status='cancelled'`; **credit freed by default** (`pt_late_cancel_window_hours=0`); if the gym sets a window and `now` is within it of `scheduled_at` → treated like a no-show (forfeits). If a credit was already decremented, **restore it** (atomic+audited).
- **Reschedule:** update `scheduled_at`/`coach_id` on a `scheduled` session — **no credit effect**; re-notify both parties.
- **Notifies:** **`pt_session_cancelled`** → the other party (+guardian).
- **Acceptance:** cancel frees the credit per policy (default free); reschedule moves the slot with no credit change; both notify.

### T5 — Restore / Refund credit (recovery)
- **Trigger:** staff corrects an erroneous completion/no-show.
- **Writes:** **`restore_pt_credit(p_assignment_id, p_session_id, p_reason)`** (staff-only, gym-scoped): `sessions_used -= 1` **guarded `≥ 0`** (never restore above total / below zero), reopen/void the session as appropriate, reactivate the assignment if it had auto-completed, **write `audit_logs`** with the reason.
- **Notifies:** optional staff confirmation.
- **Acceptance:** a credit can be restored exactly once per consuming event, never below 0, fully audited.

### T6 — Member-visible session history + credits (state-back)
- **Surface:** `portal/pt` shows the student's **scheduled upcoming sessions**, **session history** (completed/no-show/cancelled with dates/coach), and **remaining credits per assignment**. RLS-scoped, Arabic-RTL.
- **Acceptance:** the member sees their sessions and accurate remaining credits that reconcile with the assignment counter.

### Policy settings (supports T3/T4)
- Add `gyms.pt_no_show_forfeits` (default **true**) + `gyms.pt_late_cancel_window_hours` (default **0** = always free) and a minimal toggle in `(dashboard)/settings`. Both read inside the RPCs (server-side source of truth, not client-trusted).

---

## 7. Cross-portal propagation matrix

| Transaction | Admin | Coach | Student portal | Notifications |
|---|---|---|---|---|
| T1 Schedule | (oversight) | new session on roster/calendar | upcoming session on `portal/pt` | `pt_session_scheduled` → student + coach |
| T2 Complete | credit ledger ↓ | mark delivered | history += session; credits ↓ | `pt_session_completed`; `pt_credits_exhausted` at 0 |
| T3 No-show | policy-driven ↓ | mark no_show | history; credits per policy | `pt_session_no_show` → student + staff |
| T4 Cancel/Resched | — | cancel/reschedule | slot freed/moved | `pt_session_cancelled` → other party |
| T5 Restore | restore + audit | — | credits ↑ corrected | (staff confirm) |
| T6 History | — | — | sessions + credits visible | bell reflects |

---

## 8. Error recovery & edge cases (first-class — the mandate)

| # | Case | Designed behavior |
|---|---|---|
| E1 | **Double-complete** (double-click/retry) | `complete_pt_session` is **idempotent** — row lock + "already completed → no-op"; **never double-decrements**. |
| E2 | **Decrement below zero** | guarded (`sessions_used < sessions_total` on the assignment, existing CHECK); completion on an exhausted assignment is rejected with a clear reason. |
| E3 | **Restore above total / double-restore** | `restore_pt_credit` guards `sessions_used ≥ 1` before decrementing it; one restore per consuming event; audited. |
| E4 | **Concurrent completion race** (two staff) | row-level lock in the RPC serializes; the loser sees the no-op/exhausted result. |
| E5 | **Pack expiry mid-flow** | scheduling rejects past `expires_at`; a session scheduled before expiry but completed after → policy: allow completion (honor the booked slot) but block *new* scheduling; documented. |
| E6 | **Assignment auto-complete at 0** | completion that hits 0 sets assignment `status='completed'`; a subsequent restore reactivates it to `active`. |
| E7 | **Coach reassignment** | update `pt_sessions.coach_id` on a scheduled session; re-notify; no credit effect. |
| E8 | **Reschedule** | move `scheduled_at`; no credit effect; re-notify; cannot reschedule a completed/cancelled session. |
| E9 | **No-show then dispute** | T5 restore reverses the forfeited credit with an audited reason. |
| E10 | **Orphaned historical data** | existing `sessions_used` counts have **no `pt_sessions` rows** (the bare-increment era). One-time **backfill**: synthesize `completed` `pt_sessions` (placeholder `scheduled_at`, note "migrated") so history reconciles with the counter — OR record a documented baseline offset. (Decide at build; backfill preferred for a coherent member history.) |
| E11 | **Partial failure** | every credit-affecting op is a single-transaction RPC; any failure rolls back both the session-state change and the counter — they can never diverge. |
| E12 | **Cross-gym / authz** | all RPCs staff/coach-gated + gym-scoped; a coach can only act on their gym's sessions; RLS unchanged/not weakened. |
| E13 | **Notify failure non-fatal** | the atomic credit/session change is fatal; notification + any side-effect are best-effort *after* (the 23-R lesson) — a notification hiccup never un-consumes/un-restores a credit. |

---

## 9. As-is → To-be gap + maturity ladder

| Transaction | As-is | Target | Gap to close |
|---|:--:|:--:|---|
| T1 Schedule | L0 | **L3** | write `pt_sessions` (un-orphan it); preconditions; `pt_session_scheduled` |
| T2 Complete | L1 (counter) | **L3** | atomic+idempotent `complete_pt_session`; session record; `pt_session_completed`/exhausted |
| T3 No-show | L0 | **L3** | configurable forfeit; audited decrement |
| T4 Cancel/Resched | L0 | **L3** | configurable window (default free); credit restore on already-decremented; reschedule |
| T5 Restore | L0 | **L3** | `restore_pt_credit`, guarded + audited |
| T6 History | L0 | **L3** | member-visible sessions + accurate remaining credits |

**In scope:** the `pt_sessions.assignment_id` FK + the four RPCs (`schedule_pt_session`, `complete_pt_session`, `cancel/no_show`, `restore_pt_credit`), retire the bare-increment UI path, the gym PT-policy settings, the coach lifecycle UI, the student PT history, the orphaned-data backfill, and a behavior-green e2e spec covering the happy path **+ the key edge cases (E1/E2/E3/E5/E10/E11)**.

**Deferred:** member self-booking (P2/5), coach availability calendar (P3), WhatsApp reminders (P6).

---

## 10. Open decisions for the user

Forks decided (no-show configurable/default-forfeit; late-cancel configurable/default-free; full schedule→deliver). Remaining defaults I'll take unless redirected:
1. **Policy home:** two columns on `gyms` (+ a `(dashboard)/settings` toggle) vs a new `gym_settings` table. *Default = columns on `gyms`* (simplest; one gym today).
2. **Orphaned-data backfill (E10):** synthesize `completed` placeholder sessions to match existing `sessions_used`, vs start-fresh with a documented offset. *Default = backfill placeholders* (coherent member history).
3. **No-show default value:** `pt_no_show_forfeits = true`. *Default = true* (protects coach time; member-friendly via T5 restore).
4. **Who completes/cancels:** coach **and** reception (staff). *Default = both.*

---

## 11. Rebuild-slice definition (seeds the coder prompt — not the prompt itself)

**One sequential slice on the current base.**
- **Migrations:** `pt_sessions.assignment_id` FK; `gyms` PT-policy columns; `schedule_pt_session` / `complete_pt_session` (atomic+idempotent, single-writer) / `cancel_or_no_show_pt_session` (policy-aware) / `restore_pt_credit` (guarded+audited) RPCs; retire the bare-increment UI call; one-time orphaned-data backfill.
- **UI:** coach PT session lifecycle (schedule/deliver/complete/no-show/cancel/reschedule) replacing the bare "Log session"; `(dashboard)/settings` PT-policy toggles; `portal/pt` session history + remaining credits; Arabic-RTL; i18n (ar/en/fr) for the new notification types + UI strings, no `MISSING_MESSAGE`.
- **Notifications:** `pt_session_scheduled/completed/cancelled/no_show`, `pt_credits_exhausted` via the sanctioned pattern + guardian fan-out.
- **Behavior-green e2e:** schedule → complete (−1, idempotent) → no-show (policy) → cancel (free) → restore → member history; plus the edge assertions (double-complete no-op; exhausted-block; restore-not-below-zero). Cloud DB, CI; fail loudly.
- **Strategic-context block** + **F2 hygiene** + a candid **drag read** (does the PT acquisition base from 22-R make delivery clean, or does the orphaned `pt_sessions` / counter model fight us?).

---

*Awaiting sign-off. On approval I issue ONE sequential coder prompt for C1 — to run after 24-R lands (sequential slices).*
