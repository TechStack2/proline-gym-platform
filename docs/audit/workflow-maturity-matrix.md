# Workflow Maturity Matrix — PRO LINE Gym Platform

> **Created:** 2026-06-08 (Cycle 5 kickoff)
> **Auditor:** Project Auditor (read-only, no code)
> **Mandate:** Behavioral re-audit of cross-user workflows. Target maturity bar for V1 = **MANAGED** (every handoff fires a notification + shows state to all parties; billing triggers fire).
> **Maturity ladder (open-design substitute — `/open-design/` is not installed):** CMMI-style — **Ad-hoc → Defined → Managed → Optimized**.
> **Method:** Each flow traced through actual source code (not feature claims). File:line evidence cited.

---

## 0. Maturity Ladder Definitions (the "open-design lens")

| Level | Definition (applied to this platform) |
|-------|----------------------------------------|
| **L1 Ad-hoc** | A step exists in isolation. No handoff to the next actor. State not shared. Data may be discarded. |
| **L2 Defined** | The full step sequence exists and persists data correctly, but the next actor must be told manually (no notification). State is visible if you go look for it. |
| **L3 Managed** | Every handoff fires a notification to the receiving actor; state is surfaced to all parties; downstream side-effects (billing, roster, credit) fire automatically. ← **V1 TARGET** |
| **L4 Optimized** | Reminders, escalations, retries, analytics, and feedback loops (e.g., attendance → promotion eligibility) are automated. |

---

## 1. The Notification Substrate (cross-cutting — gates every flow)

**Finding (CRITICAL):** The notification system is **write-never**. There are **6 consumer sites** that read / mark-as-read / display notifications ([notification-bell.tsx](src/components/notifications/notification-bell.tsx), [notification-dropdown.tsx](src/components/notifications/notification-dropdown.tsx), [notifications-client.tsx](src/app/[locale]/(dashboard)/notifications/notifications-client.tsx), [notifications/page.tsx](src/app/[locale]/(dashboard)/notifications/page.tsx)) and **0 producer sites** — no code anywhere inserts a row into `notifications`.

**Consequence:** The MANAGED bar is **unreachable for all three flows** until a notification producer layer exists. This is the single highest-leverage gap and must be built **first** (foundation), before the three flow tracks wire their events into it.

---

## 2. Flow A — PT Request → Approve → Bill → Roster

**As-is (traced):**
```
[student/parent]  ──✗ no entry point──>  (cannot request; portal is read-only)
[staff] ── pt-client.handleAssign() ──> INSERT pt_assignments (credit record)  ✓
        └─✗ no invoice   └─✗ no notification   └─✗ no approval state
[coach] ──✗ never sees PT students (coach portal reads class_enrollments only)
[credit] increment_sessions_used() defined in 000012 but NEVER called → credits never decrement
```

| Step | As-is behavior | Evidence | Maturity |
|------|----------------|----------|----------|
| Request (student) | No UI exists; portal 100% read-only | `portal/` 0 mutations | **L1** |
| Approve (admin) | No request/approve state — staff assigns directly | [pt-client.tsx:306-349](src/app/[locale]/(dashboard)/pt/pt-client.tsx#L306-L349) | **L1** |
| Assign credits | `pt_assignments` row created correctly w/ Zod + gym scope | [pt-client.tsx:331-339](src/app/[locale]/(dashboard)/pt/pt-client.tsx#L331-L339) | **L2** |
| Bill if unpaid | No invoice created on assign; invoices are manual-only | [invoice-form.tsx] only insert site | **L1** |
| Notify | No notification to student or coach | grep: 0 producers | **L1** |
| Roster (coach) | Coach portal never reads `pt_assignments` | grep coach/: 0 hits | **L1** |
| Consume credit | `increment_sessions_used()` exists, never invoked | [000012:47-60](supabase/migrations/000012_create_pt_assignments.sql#L47-L60); 0 `.rpc()` calls | **L1** |

**Flow A overall maturity: L1 (Ad-hoc).** Only the credit-record insert reaches L2; the flow has no entry, no billing, no notification, no roster handoff, no credit consumption.

---

## 3. Flow B — Lead → Trial → Convert → Onboard

**As-is (traced):**
```
[public]  submit_public_lead() RPC ──> INSERT leads(status='new')  ✓  └─✗ no staff notification
[staff]   trial scheduling: date+time inputs NOT wired ──> writes status='trial_scheduled' only
          └─✗ chosen date/time DISCARDED   └─✗ trial_classes never written
[staff]   "Convert" ──> sets leads.status='converted' + converted_at
          └─✗ no students row   └─✗ no membership   └─✗ no invoice   └─✗ converted_student_id stays NULL
```

| Step | As-is behavior | Evidence | Maturity |
|------|----------------|----------|----------|
| Capture lead | Public RPC inserts lead correctly | [000009:8-34](supabase/migrations/000009_public_lead_submissions.sql#L8-L34) | **L2** |
| Notify staff of new lead | None | grep: 0 producers | **L1** |
| Schedule trial | Date input + time select are **cosmetic**; only `status` is written; date/time discarded; `trial_classes` never populated | [leads-client.tsx:320-342](src/app/[locale]/(dashboard)/leads/leads-client.tsx#L320-L342) | **L1** |
| Convert to student | **Cosmetic** — flips status + stamps `converted_at`; creates no student/membership/invoice; `converted_student_id` never set | [leads-client.tsx:108-160](src/app/[locale]/(dashboard)/leads/leads-client.tsx#L108-L160) | **L1** |
| Notify lead | None | grep: 0 producers | **L1** |

**Flow B overall maturity: L1 (Ad-hoc).** Lead capture reaches L2; everything after is a status-label change with no real handoff. "Convert to student" is the most misleading "✅ Complete" claim in the project — it produces no student.

---

## 4. Flow C — Enroll → Attend → Progress → Bill

**As-is (traced):**
```
[staff] enroll student ──> class_enrollments  ✓  └─✗ no enrollment confirmation to student
[coach] attendance: solid — upsert attendance_records w/ Zod + marked_by  ✓ (L2/L3 mechanics)
        └─✗ no absence notification   └─✗ does NOT decrement PT credits   └─✗ no promotion-eligibility signal
[admin] belt promotion: atomic insert+update, rollback, rank-order validation, stepper  ✓ (L2/L3 mechanics)
        └─✗ no notification to student/parent on promotion
[billing] no membership expiry/renewal reminder; auto_renew column unused; overdue invoices never remind
```

| Step | As-is behavior | Evidence | Maturity |
|------|----------------|----------|----------|
| Enroll | `class_enrollments` insert; staff-only | (dashboard)/classes | **L2** |
| Notify student of enrollment | None | grep: 0 producers | **L1** |
| Attendance capture | Robust: Zod-validated upsert, `marked_by`, conflict key | [coach/attendance/page.tsx:223-281](src/app/[locale]/coach/attendance/page.tsx#L223-L281) | **L2** |
| Absence notification | None | grep: 0 producers | **L1** |
| Attendance → PT credit | Not linked; `increment_sessions_used()` never called | grep: 0 `.rpc()` | **L1** |
| Progress signal | No "eligible for promotion" indicator from attendance | belt-engine has no eligibility input | **L1** |
| Belt promotion | Robust: atomic, rollback, rank-order, 3-step stepper, history | [belt-engine-client.tsx:141-240](src/app/[locale]/(dashboard)/belts/belt-engine-client.tsx#L141-L240) | **L2** |
| Promotion notification | None | grep: 0 producers | **L1** |
| Membership/renewal billing | No expiry reminder, no renewal, no overdue reminder; `auto_renew` unused | grep: no renew/reminder logic | **L1** |

**Flow C overall maturity: L2 mechanics, L1 connective tissue.** The individual steps (attendance, promotion) are the most mature code in the platform, but **no step hands off to the next** — every arrow between actors is missing.

---

## 5. Summary Scorecard

| Flow | Mechanics | Handoffs / Notifications | Billing side-effects | Overall (target = L3) |
|------|:--:|:--:|:--:|:--:|
| **A — PT** | L1–L2 | L1 | L1 | **L1** |
| **B — Lead→Onboard** | L1 | L1 | L1 | **L1** |
| **C — Enroll→Attend→Progress→Bill** | **L2** | L1 | L1 | **L1 / L2 mixed** |
| **Notification substrate** | — | **absent** | — | **blocks all** |

**Conclusion:** The prior audit (Cycles 1–4) raised *per-module parity* (i18n, RLS, Zod, build) to a high bar but never tested *cross-user behavior*. Every cross-actor handoff in the platform is currently **L1 Ad-hoc**. Reaching the V1 MANAGED bar requires: (1) a notification producer layer, then (2) wiring real handoffs + billing side-effects into the three flows. This is the scope of **Cycle 5**.

See [`gap-log.md`](./gap-log.md) for itemized gaps with assigned ECC roles / superpowers / maturity lens, and [`cycle-5-prompts.md`](./cycle-5-prompts.md) for the coding-agent prompts.
