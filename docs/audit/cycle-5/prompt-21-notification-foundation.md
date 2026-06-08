# CODER PROMPT 21 — Notification Producer Layer (Phase 1 / Cycle 5, Foundation) 🚦 BLOCKING

> **For:** Coding agent · **Issued by:** Project Auditor · **Sequence:** Phase 1, Prompt 1 of 5 (run alone; Prompts 22–24 depend on this)
> **Hand this prompt verbatim to the coder. It is self-contained.**

---

## Role, Skill, Lens (adopt these)

- **Act as the `architect` role** — `/Users/techstack/Desktop/Agentics/Arsenal/ecc/agents/architect.md`. Design a clean, reusable producer layer; then hand the RLS/migration to a `database-reviewer` pass (`/Arsenal/ecc/agents/database-reviewer.md`) before you finish.
- **Apply the `test-driven-development` superpower** — `/Users/techstack/Desktop/Agentics/Arsenal/superpowers/skills/test-driven-development/`. Write the failing test FIRST (see Acceptance), then make it pass.
- **Maturity lens (CMMI):** you are building the **feedback-loop substrate** that lifts every workflow from L1 Ad-hoc → L3 Managed. No flow can hit "Managed" until this exists.

## Mission Context (why this is first)

PRO LINE's `notifications` table has **6 consumer sites** (read / mark-read / display) and **ZERO producer sites** — nothing in the app ever creates a notification. Verify yourself:

```bash
grep -rn "from('notifications')" src   # only .select()/.update() — no .insert()
```

Every downstream feature (booking confirmations, waitlist alerts, renewal nudges, lead/PT/belt handoffs) depends on a notification producer layer. Build it now. **Do NOT wire the individual flow events yet** — that is Prompts 22–24. Your job is the reusable substrate + RLS + realtime + one reference producer proven by a test.

## Build Deliverables

1. **Server helper** `src/lib/notifications/create.ts`:
   - `createNotification({ recipientProfileId, type, titleKey, bodyKey, params, entityType, entityId, gymId })` → inserts one row.
   - `createNotificationForRole({ role, gymId, type, titleKey, bodyKey, params, entityType, entityId })` → fan-out to all profiles holding `role` in that gym (e.g. notify all `owner`/`receptionist`).
   - **Store i18n KEYS + a params JSON, not rendered strings** — the client renders via existing next-intl namespaces. Add a `notifications` i18n namespace to `src/i18n/messages/{en,ar,fr}.json` with the keys you emit.
   - Use the server Supabase client (`src/lib/supabase/server.ts`). Gym-scope every insert.

2. **Canonical `type` values** (define as a TS union/const the flow prompts will import):
   `pt_requested, pt_approved, pt_assigned, lead_new, trial_scheduled, lead_converted, attendance_absent, belt_promoted, membership_expiring, invoice_overdue, enrollment_confirmed`

3. **Migration** `supabase/migrations/000015_notifications_producer_rls.sql`:
   - RLS so an authenticated **staff** user can `INSERT` a notification addressed to another profile **within the same gym** (staff → student/coach), and any user can `SELECT`/`UPDATE` only their **own** notifications.
   - **No cross-gym insert or read.** Run your own `database-reviewer` pass and state in the report that you checked for cross-gym leakage.
   - Keep the migration chain sequential (next number after 000014).

4. **Realtime:** confirm the bell/dropdown subscribe to `INSERT` on `notifications` (Supabase Realtime). If not subscribed, wire it so a new notification appears **without a refresh** (state visibility = Managed). Files: `src/components/notifications/notification-bell.tsx`, `notification-dropdown.tsx`.

## Constraints

- Surgical: do not refactor unrelated modules. Match existing code style.
- i18n keys only (no hardcoded/locale-ternary strings) — consistent with prior cycles.
- Every DB write gym-scoped. Reuse existing auth/gym helpers used by `(dashboard)` pages.

## Acceptance Criteria (TDD — write the test first)

Write a failing test, then satisfy it:
1. **Recipient-scoped delivery:** `createNotification(...)` for student S in gym G ⇒ S can `SELECT` it; a different user / another gym **cannot**.
2. **Role fan-out:** `createNotificationForRole({ role: 'receptionist', gymId: G, ... })` creates one row per receptionist in G, none outside G.
3. **Live bell:** inserting a notification increments the recipient's bell **without a page refresh** (realtime).
4. `tsc --noEmit` and `next build` pass clean; migration `000015` applies in order.

## REQUIRED — Update the shared progress file

Append a section to **`/Users/techstack/Desktop/Agentics/Projects/proline-gym-platform/audit-cycle-update.md`** using EXACTLY this template (the auditor reads this to verify and to write Prompt 22):

```markdown
## Cycle 5 / Phase 1 / Prompt 21 — Notification Producer Layer

**Status:** COMPLETE | PARTIAL | BLOCKED
**Date:** <date>

### Deliverables
- Helper: `src/lib/notifications/create.ts` — functions: <signatures>
- i18n keys added: <namespace + key list> in en/ar/fr
- Migration: `000015_notifications_producer_rls.sql` — <what RLS policies>
- Realtime: <wired? where? bell increments live: yes/no>
- `type` union exported at: <file:line>

### Evidence (file:line)
- createNotification: <file:line>
- createNotificationForRole: <file:line>
- RLS INSERT policy (same-gym only): <file:line>
- Realtime subscription: <file:line>

### Tests
- <test file> — recipient-scoped delivery: PASS/FAIL
- role fan-out: PASS/FAIL
- live bell: PASS/FAIL
- `tsc --noEmit`: PASS/FAIL · `next build`: PASS/FAIL · migration applies: PASS/FAIL

### Cross-gym leak check (database-reviewer pass)
- <result + how verified>

### Notes / deviations / follow-ups for the auditor
- <anything that affects Prompts 22–24, e.g. final helper signature the flow prompts must import>
```

---

**Do NOT** implement PT/Lead/Attendance/Belt event wiring in this prompt — only the substrate + one reference producer exercised by the tests. The flow events come in Prompts 22 (PT), 23 (Lead), 24 (Enroll/Attend/Progress/Bill).
