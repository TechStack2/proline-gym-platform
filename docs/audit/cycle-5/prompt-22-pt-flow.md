# CODER PROMPT 22 — PT Flow: Request → Approve → Bill → Roster → Consume (Phase 1 / Cycle 5, Track A)

> **For:** Coding agent · **Issued by:** Project Auditor · **Sequence:** Phase 1, Prompt 2 of 5. **Depends on Prompt 21** (notification substrate — verified-by-review, contract stable).
> Hand this prompt verbatim. It is self-contained but assumes you have the repo context from the initiation prompt.

---

## Role, Skill, Lens

- **Act as `architect`** (`/Arsenal/ecc/agents/architect.md`) to model the request→approve state machine, with **`tdd-guide`** (`/Arsenal/ecc/agents/tdd-guide.md`) discipline on the billing/credit logic.
- **Apply superpowers:** `brainstorming` (`/Arsenal/superpowers/skills/brainstorming/`) to model the state machine first; `systematic-debugging` (`/Arsenal/superpowers/skills/systematic-debugging/`) to wire the dead `increment_sessions_used()` path.
- **Maturity lens (CMMI):** take the PT flow from **L1 Ad-hoc → L3 Managed** — every step persists, hands off, notifies, and surfaces state to all parties; billing fires automatically.

## Context — gaps you are closing (from `docs/audit/gap-log.md`)

| Gap | Today | Target |
|-----|-------|--------|
| M-A1 | No student PT-request entry (portal read-only) | Student/parent requests a package + preferred coach |
| M-A2 | Staff assigns directly; no approval state | `requested → approved/rejected → assigned` state machine |
| M-A3 | Assign fires no invoice | Approval auto-creates a dual-currency invoice |
| M-A4 | No notification to student/coach | Notify at each transition |
| M-A5 | Coach portal never reads `pt_assignments` | Coach sees "My PT Students" + remaining credits |
| M-A6 | `increment_sessions_used()` never called | "Log session" decrements credits, blocks at 0 |

## The notification contract (from Prompt 21 — use exactly this)

```ts
import { createNotification, createNotificationForRole } from '@/lib/notifications/create';
import type { NotificationType } from '@/lib/notifications/types';
// createNotification({ recipientProfileId, gymId, type, titleKey, bodyKey, params?, entityType?, entityId?, actionUrl? }) => { id }
// createNotificationForRole({ role, gymId, type, titleKey, bodyKey, params?, ... }) => { count, recipientIds }
```
- Types already in the union + i18n: `pt_requested`, `pt_approved`, `pt_assigned`. i18n keys live at `notifications.<type>.{title,body}` in en/ar/fr — extend their `params` interpolation as needed (e.g. package name, coach name).
- `recipientProfileId` = the recipient's `profile_id` (= auth user id). For a student: `students.profile_id`. For a coach: `coaches.profile_id`.

## ⚠️ Two RLS facts you MUST design around

1. **The notification INSERT policy requires `is_staff()`.** A **student** cannot insert notifications. Therefore the **"PT requested → notify staff"** notification CANNOT use the TS helper from the student's session — emit it **inside the `SECURITY DEFINER` RPC** (see below), which bypasses RLS. Staff-side approval notifications (`pt_approved`/`pt_assigned`) run from a staff server action and CAN use the helper.
2. **`pt_assignments` RLS gives students SELECT only** — no INSERT. Do **not** add a broad student INSERT policy. Route the request through a `SECURITY DEFINER` RPC.

## Pre-task (micro-fix carried from Prompt 21)

In `supabase/migrations/000015_notifications_producer_rls.sql`, add `SET search_path = public` to the `recipient_in_gym` SECURITY DEFINER function (project convention — see `000009`). It is not yet applied, so edit in place.

## Build Deliverables

### Schema — new migration `000016_pt_request_workflow.sql`
- Add to `pt_assignments`: `status` (new enum `pt_assignment_status`: `requested|approved|rejected|active|completed|cancelled`, default `active` for back-compat with existing direct-assign rows), `requested_at`, `approved_by` (UUID → profiles), `approved_at`, `rejected_reason TEXT`, `invoice_id` (UUID → invoices, nullable). Make `coach_id` nullable OR keep NOT NULL and require a preferred coach at request — your call, state it in the report.
- **RPC `request_pt(p_package_id UUID, p_coach_id UUID)`** — `SECURITY DEFINER`, `SET search_path = public`. Resolves the calling student (`students.profile_id = auth.uid()`), inserts a `pt_assignments` row with `status='requested'`, gym derived from the package. **Also inserts the `pt_requested` notification(s) to staff** (owner/receptionist) directly in SQL (definer bypasses the is_staff INSERT policy). Grant EXECUTE to `authenticated`.
- Add authorization to **`increment_sessions_used`**: only proceed if the caller is staff in the gym OR the assigned coach (today it checks neither). Keep `SET search_path = public`.

### M-A1 — Student request entry (Portal B, hybrid self-service)
- New page under `portal/` (e.g. `portal/pt/`) listing active packages; student picks a package + preferred coach → calls `request_pt` RPC → success toast. Show their existing requests/assignments with status + remaining credits.

### M-A2 + M-A3 + M-A4 — Staff approve/reject + auto-invoice + notify (Portal D)
- In `(dashboard)/pt`, add a **"Pending requests"** section. Approve → set `status='approved'`/`'active'`, set `approved_by`/`approved_at`, optionally reassign coach; **auto-create an invoice** (reuse the existing invoice-creation path used by `invoices/new` — dual-currency `amount_usd`/`exchange_rate`/`rate_date`, `invoice_type` = the PT/personal-training enum value, `due_date`, let the DB triggers fill `invoice_number` + totals), link `invoice_id`. Skip invoice if already paid/zero-price. Reject → `status='rejected'` + reason.
- On approval: `createNotification(pt_approved)` to the student and `createNotification(pt_assigned)` to the coach (helper, staff session).

### M-A5 — Coach roster (Portal C)
- Add "My PT Students" to `coach/` — server-fetch `pt_assignments` where the coach is `coach_id` and `is_active`, showing student name + `sessions_remaining`. (RLS `pt_assignments_coach` already permits this SELECT.)

### M-A6 — Log session / consume credit
- Add a "Log session" action (coach roster and/or staff `pt` view) that calls `increment_sessions_used(assignment_id)` via `.rpc(...)`, optimistically decrements, blocks at 0 (function already raises when exhausted). Surface remaining credits live.

## Constraints
- Surgical; match existing style; i18n keys only; every write gym-scoped; dual-currency on the invoice.
- Do NOT touch Lead or Attendance/Belt flows (Prompts 23/24).

## Acceptance Criteria (TDD — failing test first)
1. `request_pt` creates a `requested` assignment for the calling student **and** a `pt_requested` notification readable by staff (not by other gyms).
2. Approval flips status, **creates a linked invoice** (assert an `invoices` row with correct `student_id`/`gym_id`/dual-currency), and produces `pt_approved` (student) + `pt_assigned` (coach) notifications.
3. Coach roster query returns the assigned student with correct `sessions_remaining`.
4. "Log session" calls `increment_sessions_used` → `sessions_remaining` drops by 1; a second call at 0 is rejected.
5. `tsc --noEmit` ✅ · `next build` ✅ · migrations `000015`+`000016` apply in order (run if Docker available; otherwise mark deferred like P21 and commit the pgTAP/unit tests).

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`** with heading `## Cycle 5 / Phase 1 / Prompt 22 — PT Flow (Track A)`, mirroring the P21 template: Status, Deliverables, Evidence (file:line for each of M-A1…M-A6 + the RPC + invoice creation), Tests (pass/deferred), the `request_pt` + invoice-creation signatures, and any deviations affecting Prompts 23/24. State explicitly whether `coach_id` became nullable.

## Scope discipline & hand-back
Build only Track A. Stop after updating `audit-cycle-update.md`; tell the auditor Prompt 22 is ready for review. The auditor will verify and issue Prompt 23 (Lead → Onboard).
