# CODER PROMPT 22-R — PT Slice Re-Validation (behavior-green on the coherent gym)

> **For:** Coding agent · **Issued by:** Project Auditor · **Sequence:** Phase 1, after Phase 0 closed (gate PASS). Prompt 22 built the PT flow as **PARTIAL** before the identity foundation existed — every portal was empty then, so it was never truly exercised. Now the gym is coherent and the V1 harness is the standing gate. **Re-validate the whole PT vertical slice end-to-end and lock it under the harness.**
> Hand verbatim. Self-contained.

---

## Role, Skill, Lens
- **Act as `e2e-runner` + `tdd-guide`** (`/Arsenal/ecc/agents/`); pull in `database-reviewer` only if an RLS/RPC gap is found.
- **Apply superpower `verification-before-completion`** (`/Arsenal/superpowers/skills/verification-before-completion/`): "done" = observed green in CI across all four portals, **not** `tsc`/`build`. Also `systematic-debugging` for any step that doesn't surface.
- **Lens:** the [cross-portal-workflow-map.md](../cross-portal-workflow-map.md) — PT is a vertical slice: **student requests → staff approves+invoices → coach delivers → state flows back to student**. Maturity target: **L3 Managed** (every step persists, notifies, and surfaces state).

## Strategic context — what this closes, and what it deliberately does NOT (read first)
This slice is **directly responsive to the industry benchmark** ([industry-benchmark.md](../industry-benchmark.md)). It closes three capabilities the benchmark scored **0/5 "Behind"**:
- Portal B (Member): *"PT booking / pack visibility — PT is admin-assigned, **invisible to member**"* → member can now request a package + see status/credits.
- Portal C (Coach): *"PT session logging → pack decrement — `increment_sessions_used()` exists but **never called**; no UI"* → coach logs a session that decrements.
- Portal C (Coach): *"Coach sees assigned PT students — coach portal **never reads `pt_assignments`**"* → coach PT roster.

Where it sits ([platform-elevation-roadmap.md](../platform-elevation-roadmap.md)): **Phase 1 — Connective Tissue.** The roadmap's rule is *"foundation before features; connective tissue before engagement surfaces."* So your job is to make the PT plumbing **real and L3-Managed** — NOT to make it best-in-class yet.
- **Do NOT build now (later phases — but don't make choices that block them):** member **self-booking/online purchase** of PT (Phase 2 · 2A), coach **availability** + the fuller coach PT surface (Phase 3 · 3A), package auto-renewal/dunning (Phase 4). Keep the request→approve→bill→deliver→state-back contract clean and extensible so those layers drop on top without rework.
- **Leapfrog lanes to respect** (don't regress): Arabic-first RTL, dual-currency on the invoice, WhatsApp/offline-friendliness.

## Why this exists (read before touching code)
Prompt 22 shipped the PT migrations/RPCs/pages but was reported PARTIAL and verified only by `tsc`/build — at a time when **no demo login had a profile/gym**, so the flow could not actually run. Phase 0 (F1/F1.1) since fixed the identity chain and the cloud DB now has the full migration chain (incl. `000016_pt_request_workflow`, `000015_notifications_producer_rls`). Your job is **not** to rebuild the flow — it's to **prove it works on a real login**, fix whatever the proof exposes, and make the harness fail forever if it regresses.

## What's already in place (verify, don't assume)
- Mig `000016`: `pt_assignment_status` enum + status columns, **`request_pt(p_package_id, p_coach_id)`** SECURITY DEFINER (inserts assignment + staff `pt_requested` notification), **`get_coach_pt_roster()`**, authorized **`increment_sessions_used()`**. Confirm `coach_id` nullability and the exact signatures in the file.
- Mig `000015`: notification producer RLS + realtime.
- Student PT page under `portal/pt/` (V1 confirmed it lists ≥1 package).
- Coach roster + staff `(dashboard)/pt` approve/reject paths (per the Prompt 22 report — verify they exist and are wired).

## The re-validation (drive it as a real user, on the coherent gym)
Run the full chain as the seeded demo accounts (`student@`/`owner@`/`coach@`/`reception@` `@prolinegym.lb`) against the **cloud** DB the harness uses. At each step, **observe the persisted state and the cross-portal propagation**:

1. **student@** `/portal/pt` → request a package + preferred coach (the demo coach) → calls `request_pt`. Assert: a `pt_assignments` row `status='requested'` for this student, and a `pt_requested` notification readable by **staff** (and not by another gym).
2. **owner@/reception@** `(dashboard)/pt` "Pending requests" → the request shows → **approve** → status flips to `approved`/`active`, `approved_by`/`approved_at` set, **a dual-currency invoice is auto-created and linked** (`invoice_id`), and `pt_approved` (student) + `pt_assigned` (coach) notifications fire.
3. **coach@** `coach/` "My PT Students" → the assigned student appears with correct `sessions_remaining`. **Log session** → `increment_sessions_used` decrements by 1; at 0 it's rejected.
4. **student@** sees the assignment status + remaining credits update (state flows back), and the invoice surfaces in `/portal/billing`.

If any step doesn't surface, **fix the cause** (within the PT slice only) — and if it's an RLS/embed issue, diagnose it the way V1-F3 was (confirm the policy/query before adding anything; don't add a broad student INSERT on `pt_assignments` — the request goes through the definer RPC).

## Lock it under the harness (the durable deliverable)
Add a **PT cross-portal spec** to `e2e/` following `e2e/README.md`, asserting the propagation above with resilient selectors (add surgical `data-testid`s if needed). It must:
- Drive the real login form per role and assert **real data at each portal** (request visible to staff; approval creates the invoice; coach roster shows the student + credits; log-session decrements).
- Be idempotent / re-runnable (clean up or scope to a uniquely-named request so re-runs don't accumulate state).
- Fail loudly (not skip) if any portal doesn't reflect the step.

## Acceptance Criteria — the harness is the judge
1. The full PT slice is **green in the E2E CI run** against the cloud DB (report the run ID + URL), screenshots uploaded.
2. `pt_requested`/`pt_approved`/`pt_assigned` notifications are produced and readable by the right recipients only.
3. Approval creates a correct dual-currency invoice linked to the assignment; coach roster + log-session credit math is correct (blocks at 0).
4. `tsc` + `next build` clean. No RLS/auth weakened to pass; any data fix is gym-scoped.

> **Honesty rule (from F1/F1.1):** if your sandbox can't run Playwright/cloud, say so and **push so the `e2e.yml` CI runs it** — then report the actual CI run ID + result. Do **not** fabricate a "what rendered" table; CI is the source of truth.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 1 / Prompt 22-R — PT Slice Re-Validation`. Include: a step-by-step PASS/FAIL table (the 4 chain steps), the **E2E CI run ID + URL**, any defect found + its fix (file:line), confirmation of the notification recipients and the invoice row, and an explicit **"PT slice behavior-green: PASS/FAIL"** line.

## Scope discipline & hand-back
Re-validate + harden the **PT slice only** + its harness spec. No new features, no adjacent refactors. Stop after updating `audit-cycle-update.md`; tell the auditor whether the PT slice is behavior-green. Next the auditor issues **Prompt 23** (Lead → Onboard).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Your next task is fully specified here — read it in full and execute it exactly:
  docs/audit/cycle-5/prompt-22-R-pt-slice-revalidation.md

Phase 0 is closed (identity fixed, gate PASS). Prompt 22 built the PT flow but it was never truly run (all portals were empty then). Re-validate the WHOLE PT vertical slice on the coherent gym as real logins: student requests PT -> staff approves + auto-invoices + notifies -> coach sees roster + logs a session (credits decrement, blocks at 0) -> state + invoice flow back to the student. Fix only what the proof exposes (PT slice only; don't add a broad student INSERT on pt_assignments — the request goes through the request_pt definer RPC). Then add a PT cross-portal spec to e2e/ so this can never silently regress. Verify in the E2E CI run, not tsc — if your sandbox can't run the browser, push so e2e.yml runs and report the actual run ID + result; do NOT fabricate results. When done, append to audit-cycle-update.md under "Cycle 5 / Phase 1 / Prompt 22-R — PT Slice Re-Validation" with a 4-step PASS/FAIL table, the CI run ID/URL, and an explicit "PT slice behavior-green: PASS/FAIL" line. Then STOP and tell me 22-R is ready for review.
```
