# Analysis — Class Attendance vs PT-Session Credit: the Seam

> **Created:** 2026-06-09 · **Auditor:** Project Auditor (read-only) · **Trigger:** designing the Member Activity Loop ([journey-member-activity-loop.md](./journey-member-activity-loop.md)), the original Prompt-24 item **M-C2** ("if an attended class corresponds to a PT session, call `increment_sessions_used()`") forced a domain-modeling decision: *does showing up to a class ever consume a PT credit?*
> **Scope:** a cross-journey **boundary** decision — it binds both the Member Activity Loop (group-class attendance) and the future PT/Coach-delivery journey. Decide once, here.

---

## 1. The question

Two things a member can "attend":
- a **group class** (Muay Thai, Boxing, Kids…), and
- a **PT (personal-training) session** from a prepaid pack.

M-C2 assumed these overlap — that some attended classes *are* PT sessions, so marking attendance should decrement a PT pack. **Does the model support that, and is it the right design?**

---

## 2. As-is — TWO separate ledgers, no link (verified)

| | **Group-class attendance** | **PT (personal training)** |
|---|---|---|
| Record | `attendance_records` (class_id, student_id, attendance_date, status, marked_by) — UNIQUE(class_id, student_id, date) ([000003:68-90](../../supabase/migrations/000003_create_operational_tables.sql#L68)) | `pt_assignments` = the prepaid pack (sessions_total / sessions_used / **sessions_remaining GENERATED**) ([000012:11-25](../../supabase/migrations/000012_create_pt_assignments.sql#L11)); `pt_sessions` = a scheduled 1-on-1 (student, coach, package, **scheduled_at**, duration, status) ([000003:228-241](../../supabase/migrations/000003_create_operational_tables.sql#L228)) |
| Anchored to | a **`classes` row** (a recurring group class) | a **coach + a time** (`scheduled_at`) — **no `class_id`** |
| Billing consequence | **none** — covered by the membership | **decrements the pack** via `increment_sessions_used(assignment_id)` ([000012:47-69](../../supabase/migrations/000012_create_pt_assignments.sql#L47)) |
| Credit writer today | n/a | the 22-R coach "Log session" action calls `increment_sessions_used` directly |

**There is no FK between `attendance_records` and `pt_sessions`/`pt_assignments`.** A PT session is **not** a class and never appears in `attendance_records`. So the M-C2 premise — "an attended *class* corresponds to a PT session" — **is a category error in the current model**: you cannot mark class-attendance for a PT session, because a PT session has no `class_id` and no attendance row. Wiring `increment_sessions_used` into the class-attendance handler would have nothing correct to fire on.

> **Side finding (for the PT/Coach journey, not this one):** 22-R's "Log session" decrements `pt_assignments` but does **not** appear to complete a `pt_sessions` row — so the `pt_sessions` ledger (the *scheduled* 1-on-1) looks **orphaned**: credits move without a session record. The proper PT-delivery model (schedule `pt_sessions` → on delivery set `status='completed'` **and** decrement) should be reconciled when we design the PT/Coach journey.

---

## 3. The two completion events (they are genuinely different)

| | Group class | PT session |
|---|---|---|
| "Done" means | member checked in to a roster | a 1-on-1 was delivered |
| Consumes | nothing (membership entitlement) | exactly **one pack credit** |
| Source of truth | `attendance_records` | `pt_sessions.completed` + `pt_assignments.sessions_used` |
| Cadence | many per week, many students | scheduled, one student |
| Who triggers | coach roster check-in | coach logs the delivered session |

Conflating them risks the two worst failure modes in fitness billing: **double-decrementing** a pack (counted as both class attendance and PT) or **silent credit leakage** (a delivered PT session that no ledger recorded).

---

## 4. Industry best practice

Mindbody, Glofox, Mariana Tek, Zen Planner, Gymdesk all **separate "appointments / private sessions" from "group-class attendance"**:
- **Group class** = roster check-in against a membership entitlement; no per-visit charge.
- **Appointment / private session** = booked against availability, **consumes a session from a pack/credit ledger** on completion.

What they *share* is often only the **coach's "today" view** (one calendar showing both group classes and private appointments) — but the **completion semantics stay distinct**: completing a class writes attendance; completing an appointment logs the session **and** decrements the pack. The ledgers never merge; only the *check-in UX* may.

---

## 5. Options

**Option A — Decouple, with an explicit documented seam (RECOMMENDED).**
- Group-class attendance (Member Activity Loop) **never** touches PT credits.
- **PT credit consumption has exactly ONE writer:** the PT-session-completion action (PT/Coach journey).
- The seam is a written rule + (later) a shared coach "today" view that routes class-completion and PT-completion to their own handlers.
- *Pro:* matches the schema as built; clean, single-writer billing; keeps the two journeys' drag signals independent; zero risk of double-decrement. *Con:* the coach uses two completion actions (acceptable — they are two different events).

**Option B — Unified "visit" ledger with a `type` discriminator (class | appointment).**
- One attendance-like table where `type='appointment'` rows trigger a decrement.
- *Pro:* one check-in surface, one history. *Con:* a schema rebuild (collapse `attendance_records` + `pt_sessions`), re-do RLS/triggers, migrate data — a **large** change that fights the sound base we're strangling. Premature; revisit only if a unified member-facing history becomes a hard requirement.

**Option C — M-C2 literal (class attendance decrements PT).** *Rejected* — category error (§2); nothing valid to fire on; invites double-decrement.

---

## 6. Recommendation

**Adopt Option A.** Concretely:
1. **Member Activity Loop scope:** "Attend" = **group-class attendance only**. It records `attendance_records` and (new) fires `attendance_absent`. It **does not** read or write any PT table. M-C2 is **struck** from Journey A as a category error.
2. **Single-writer rule (durable):** *PT pack credits are consumed only by PT-session completion.* Written into both this analysis and the PT/Coach journey design. No other surface calls `increment_sessions_used`.
3. **Defer to the PT/Coach journey** (next-but-one design): the proper PT-delivery model — schedule `pt_sessions` → complete (status + decrement atomically) — and the reconciliation of the **orphaned `pt_sessions`** finding (§2). The optional shared coach "today" view (group classes + PT appointments in one calendar, distinct completion handlers) is a UX nicety for that journey or Phase 3, not now.
4. **Revisit Option B only if** a single unified member-facing "all my visits" history becomes a stated requirement — and treat it as a deliberate schema-consolidation project, not a slice.

**Net effect on the slice in flight:** Journey A gets *simpler and cleaner* (one ledger, one concern), and the critical PT-credit use case is preserved and given a proper home (its own journey) instead of being bolted onto attendance.

---

## 7. The seam, stated once

> **Group-class attendance and PT-session delivery are distinct completion events with distinct billing consequences. Class attendance never consumes a credit. PT pack credits have exactly one writer: PT-session completion. The only thing the two may share is the coach's "today" view; their ledgers never merge.**

This rule governs the Member Activity Loop, the PT/Coach journey, and any future "self check-in" (Phase 6) work.
