# CODER PROMPT C1 — PT Session Delivery: Clean Build (single sequential slice)

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** Phase 1, **after 24-R lands** (slices stay sequential). Branch `prompt-c1-pt-delivery` off the freshly-merged `main`. Catalog id **C1** (completes D4 — PT package lifecycle).
> **Strangler framing:** build ONE journey on the current base + report a candid **drag read**. PT *acquisition* (22-R) is done; this is **delivery** — the part that consumes credits.
> **The spec is the design doc + the seam analysis — read both first; binding:**
> 📎 [`docs/audit/cycle-5/journey-pt-session-delivery.md`](./journey-pt-session-delivery.md)
> 📎 [`docs/audit/cycle-5/analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md) (single-writer rule — binding)
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `architect` + `database-reviewer`** (`/Arsenal/ecc/agents/`): `architect` models the session lifecycle state machine; `database-reviewer` verifies every credit-affecting RPC is **atomic, idempotent, gym-scoped, staff/coach-gated**, and that the counter and the session ledger can never diverge. `tdd-guide` drives the edge-case tests.
- **Apply superpower `test-driven-development`**: write the failing assertions first — "completing the same session twice decrements only once"; "completing an exhausted assignment is rejected"; "restore never drops `sessions_used` below 0"; "cancel frees the credit by default." Then `verification-before-completion`: **"done" = green in the e2e behavior harness in CI**, not `tsc`/`build`.
- **Lens:** [`cross-portal-workflow-map.md`](../cross-portal-workflow-map.md) — vertical slice: assignment → schedule → deliver → consume → recover → state-back to the student. **L3 Managed**.

## Strategic context — what this closes, and what it does NOT
**Benchmark** ([`industry-benchmark.md`](../industry-benchmark.md)): PT session logging **0/5** ("`increment_sessions_used` exists but no real session record"). This makes PT delivery a real **appointment lifecycle with credit integrity + recovery** → L3, completing **D4**.
**Roadmap** ([`platform-elevation-roadmap.md`](../platform-elevation-roadmap.md)): Phase 1 (the credit handoff is connective tissue) + Phase 3 (coach surface).
- **Do NOT build now (keep extensible):** member **self-booking** of PT slots (Phase 2/5); coach **availability calendar** (Phase 3); real **WhatsApp** reminders (Phase 6).
- **Leapfrog lanes:** Arabic-RTL on every new surface; dual-currency already on the PT invoice (22-R); offline-friendly.

## ⛔ Seam boundary (binding — the inverse of 24-R)
Per [`analysis-class-attendance-vs-pt-session-seam.md`](./analysis-class-attendance-vs-pt-session-seam.md): **PT pack credits have exactly ONE writer — PT-session completion (this journey).** Group-class attendance (`attendance_records`) **never** consumes a PT credit. Do not couple this to class attendance. The bare `increment_sessions_used` UI path is **retired** here; all consumption flows through the new `complete_pt_session` RPC.

## Sanctioned NOTIFICATION pattern (F2)
`createNotification` / `createNotificationForRole` ([create.ts](../../src/lib/notifications/create.ts)) directly from the staff/coach Server Action, authed client + recipient `profile_id`, **RETURNING-free** (never `.select()` on a producer insert). Guardian fan-out for minors via `guardian_students → guardians.profile_id`.

---

## The completion contract (the heart — build this exactly)
A new **`complete_pt_session(p_session_id)`** RPC (staff/coach, gym-scoped, SECURITY DEFINER) is the **only** credit consumer:
1. **Lock** the `pt_sessions` row; if already `completed` → **no-op return** (idempotent — never double-decrement).
2. Verify the linked assignment is `active`, `sessions_remaining > 0`, not past `expires_at`.
3. Set `pt_sessions.status='completed'` **and** `pt_assignments.sessions_used += 1` **in one transaction**.
4. If `sessions_remaining` hits 0 → assignment `status='completed'`.
5. Write an `audit_logs` row for the credit move.
Cancel/no-show/restore are sibling RPCs with the **same lock + atomic + audit** discipline.

## What you are building — T1…T6 (full anatomy in the design doc §6)
- **Schema:** add **`pt_sessions.assignment_id UUID REFERENCES pt_assignments(id)`** (today it links `package_id`, not the credit-owning assignment); add gym PT-policy columns **`pt_no_show_forfeits` (default true)** + **`pt_late_cancel_window_hours` (default 0)**.
- **T1 Schedule:** `schedule_pt_session` from an **active** assignment (precondition: active + `remaining>0` + not expired, else reject with a reason) → `pt_sessions(status=scheduled, assignment_id, coach, scheduled_at, duration)`; **`pt_session_scheduled`** → student (+guardian) + coach. Support **log-on-delivery** (schedule+complete in one step).
- **T2 Complete:** `complete_pt_session` (the contract above); **`pt_session_completed`** → student; **`pt_credits_exhausted`** → student + staff at 0.
- **T3 No-show:** `status='no_show'`; **forfeit credit iff `gyms.pt_no_show_forfeits`** (read server-side); **`pt_session_no_show`** → student (+guardian) + staff.
- **T4 Cancel / Reschedule:** cancel → `status='cancelled'`; **credit freed by default**; if `pt_late_cancel_window_hours>0` and `now` within the window of `scheduled_at` → forfeit like a no-show; **restore the credit if already decremented**. Reschedule → move `scheduled_at`/`coach_id` on a `scheduled` session, **no credit effect**, re-notify. **`pt_session_cancelled`** → other party.
- **T5 Restore/Refund:** `restore_pt_credit(p_assignment_id, p_session_id, p_reason)` (staff-only): `sessions_used -= 1` **guarded `≥ 0`**, reopen/void the session, reactivate the assignment if it auto-completed, **write `audit_logs`** with the reason.
- **T6 Member history:** `portal/pt` shows upcoming scheduled sessions + history (completed/no-show/cancelled w/ date+coach) + **remaining credits per assignment**, RLS-scoped, Arabic-RTL.
- **Policy settings:** a minimal toggle in `(dashboard)/settings` for the two policy fields (read **server-side** in the RPCs, never client-trusted).
- **Orphaned-data backfill (E10):** existing `sessions_used` counts have **no `pt_sessions` rows** — synthesize `completed` placeholder sessions (note "migrated") so member history reconciles with the counter.
- **i18n (ar/en/fr):** `notifications.pt_session_scheduled/completed/cancelled/no_show`, `pt_credits_exhausted` + new UI strings; no `MISSING_MESSAGE`.

## Error recovery & edge cases — these are ACCEPTANCE ITEMS, not nice-to-haves
Build + assert (design doc §8): **E1** double-complete = no-op (one decrement); **E2** complete-on-exhausted rejected; **E3** restore guarded ≥0 / once per event; **E4** concurrent-completion serialized by row lock; **E5** expiry: block new scheduling past `expires_at`, honor an already-scheduled slot; **E6** auto-complete at 0 + reactivate on restore; **E7** coach reassignment (no credit effect); **E8** reschedule only a `scheduled` session; **E10** backfill; **E11** partial-failure rolls back session-state AND counter together; **E13** the atomic credit/session change is fatal, notification/side-effects best-effort after (23-R lesson).

## §10 defaults (apply as specified)
Policy fields = columns on `gyms` + a `(dashboard)/settings` toggle; backfill placeholders for orphaned history; `pt_no_show_forfeits` default **true**; coach **and** reception can complete/cancel.

## Lock it under the harness
Add `e2e/pt-delivery.spec.ts` per [`e2e/README.md`](../../e2e/README.md), on the **cloud DB**, real logins. Assert: schedule → `pt_session_scheduled`; complete → −1 credit + history + `pt_session_completed`; **double-complete = still −1 (E1)**; complete-on-exhausted **rejected (E2)**; no-show forfeits per policy; cancel **frees** the credit (default); **restore not below 0 (E3)**; member sees sessions + accurate remaining credits. Idempotent/re-runnable; **fail loudly**.

## Acceptance Criteria — the harness is the judge
1. Full lifecycle **green in E2E CI** (run ID + URL); screenshots.
2. `complete_pt_session` is the **only** credit writer; **atomic + idempotent**; counter ↔ session ledger never diverge; assignment auto-completes at 0.
3. No-show/cancel honor the **server-side gym policy**; restore is guarded + audited.
4. The orphaned `pt_sessions` is reconciled (backfill); the bare-increment UI path is gone.
5. Member PT history + remaining credits render, RLS-scoped, Arabic-RTL.
6. `tsc` + `next build` clean. **No class-attendance coupling**; no RLS/auth weakened; RPCs staff/coach-gated + gym-scoped.

> **Honesty rule:** if your sandbox can't run Playwright/cloud, push so `e2e.yml` runs and report the actual run ID + result; do **not** fabricate.

## Hygiene (F2 lessons)
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-c1-pt-delivery` off the merged `main`; non-3000 dev port; `(dashboard)` renders twice → `:visible`/`.first()`; login `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 1 / Prompt C1 — PT Session Delivery`. Include: a per-transaction PASS/FAIL table (T1–T6) with **file:line**, the **edge-case proof** (E1/E2/E3 at minimum), the **CI run ID + URL**, migrations applied (the new RPCs + `assignment_id` FK + policy columns + backfill), notification recipients, an explicit **"PT delivery behavior-green: PASS/FAIL"** line, AND a candid **DRAG READ** (did the 22-R acquisition base make delivery clean, or did the orphaned `pt_sessions` / counter model fight you?).

## Scope discipline & hand-back
PT delivery lifecycle only + its harness spec. No class-attendance coupling, no self-booking, no availability calendar, no adjacent refactors. Stop after updating `audit-cycle-update.md`; report behavior-green + the drag read. Next the auditor processes 24-R + advances the catalog (D1 Billing & Payment).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Run AFTER 24-R is merged. Branch prompt-c1-pt-delivery off the freshly-merged main.
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-C1-pt-session-delivery.md
  docs/audit/cycle-5/journey-pt-session-delivery.md                  (authoritative anatomy)
  docs/audit/cycle-5/analysis-class-attendance-vs-pt-session-seam.md (single-writer rule — binding)

Build the PT SESSION DELIVERY lifecycle (PT acquisition req->approve->bill->roster is done in 22-R;
this is the part that CONSUMES credits). Today pt_sessions is ORPHANED (never written) and "Log
session" is a bare increment_sessions_used counter with no record — replace that.
  Schema: add pt_sessions.assignment_id FK (link the credit-owning assignment, not just package_id);
    add gym policy columns pt_no_show_forfeits (default true) + pt_late_cancel_window_hours (default 0).
  THE COMPLETION CONTRACT: complete_pt_session(p_session_id) is the ONLY credit writer — lock the row,
    no-op if already completed (idempotent, never double-decrement), verify assignment active/remaining>0/
    not expired, set status=completed AND sessions_used+=1 in ONE transaction, auto-complete assignment
    at 0, write audit_logs. Cancel/no-show/restore are siblings with the same lock+atomic+audit.
  T1 schedule_pt_session (preconds + pt_session_scheduled to student+coach; support log-on-delivery);
  T2 complete (contract above; pt_session_completed; pt_credits_exhausted at 0);
  T3 no_show (forfeit credit iff gyms.pt_no_show_forfeits, read server-side; pt_session_no_show);
  T4 cancel (free credit by default; if pt_late_cancel_window_hours>0 and within window -> forfeit;
     restore if already decremented) + reschedule (no credit effect); pt_session_cancelled;
  T5 restore_pt_credit (staff-only, sessions_used-=1 guarded >=0, reactivate assignment, audit);
  T6 portal/pt shows upcoming + history + remaining credits, RLS-scoped, Arabic-RTL;
  Settings: (dashboard)/settings toggle for the 2 policy fields (server-side source of truth);
  Backfill: synthesize completed placeholder pt_sessions for existing sessions_used (orphaned history).
EDGE CASES ARE ACCEPTANCE ITEMS: E1 double-complete=one decrement; E2 complete-on-exhausted rejected;
E3 restore never below 0; E4 concurrent completion serialized; E5 expiry blocks new scheduling;
E6 auto-complete-at-0 + reactivate-on-restore; E7 reassign; E8 reschedule only scheduled; E10 backfill;
E11 partial failure rolls back session+counter together; E13 atomic change fatal, notifications best-effort.
BINDING: PT credit has ONE writer (completion). Class attendance NEVER consumes a PT credit — no coupling.
Notifications: sanctioned pattern (createNotification/ForRole, authed client, recipient profile_id,
RETURNING-free); guardian fan-out for minors. i18n ar/en/fr for the new types + UI; no MISSING_MESSAGE.
Add e2e/pt-delivery.spec.ts asserting the happy path + E1/E2/E3 on the cloud DB; verify in the E2E CI
run, not tsc — if the sandbox can't run the browser, push so e2e.yml runs and report the real run ID +
result; do NOT fabricate. Scope every git add (never -A); node_modules gitignored; non-3000 dev port;
(dashboard) renders twice -> :visible/.first(); login is button[type="submit"]; do NOT weaken RLS/auth.
When done, append to audit-cycle-update.md under "Cycle 5 / Phase 1 / Prompt C1 — PT Session Delivery"
with a per-transaction PASS/FAIL table (file:line), edge-case proof (E1/E2/E3), CI run ID/URL, migrations
applied, notification recipients, an explicit "PT delivery behavior-green: PASS/FAIL" line, AND a candid
DRAG READ. Then STOP and tell me C1 is ready for review.
```
