# CODER PROMPT F2 — Notification Producer Root-Cause (foundation hardening, blocks Prompt 23) · ⚙️ PARALLEL (2 workstreams)

> **For:** TWO coding agents (parallel) · **Issued by:** Project Auditor · **Sequence:** Phase 0/foundation hardening — inserted after 22-R exposed an **un-pinned** RLS rejection in the notification producer path. **No new flow work (Prompt 23+) starts until this is understood and the general path is fixed.** The notification substrate underpins every Phase-1 handoff.
> **Execution:** Workstream **A** (producer root-cause & fix) and Workstream **B** (read-path verify & harness) run **concurrently on isolated branches**, then an integration gate. See the "Parallel execution model" section. The producer investigation itself is convergent and must NOT be fanned out further.
> Hand the relevant pointer to each agent. Self-contained. **This is a root-cause investigation first, a fix second. Do NOT start by writing a fix — start by reproducing and explaining.**

---

## Role, Skill, Lens
- **Act as `build-error-resolver` + `database-reviewer`** (`/Arsenal/ecc/agents/`).
- **Apply superpower `systematic-debugging`** (`/Arsenal/superpowers/skills/systematic-debugging/`): reproduce → isolate → identify the *single* root cause with evidence → fix → verify. **No guessing, no "likely", no fix-by-workaround until the cause is proven.** Then `verification-before-completion`.
- **Lens:** [cross-portal-workflow-map.md](../cross-portal-workflow-map.md) — notifications are the spine of every cross-portal handoff (state visibility = the L3 "Managed" bar).

## Strategic context — why this is foundational (read first)
The benchmark ([industry-benchmark.md](../industry-benchmark.md)) scored notifications **1/5 "write-never"** across portals — the #1 thing blocking every "Managed" behavior. Phase 1 (Connective Tissue) exists to fix that. Prompt 21 built a producer layer; 22-R then found the **staff-side producer path fails at runtime** for an unexplained reason and worked around it with a definer RPC. If that failure is systemic (e.g. server-action auth-context loss), it will sink Lead-convert / Trial / Attendance / Belt / Renewal notifications in Prompts 23–24 **and may corrupt other writes**. We pin it now.

## What is known (verified by the auditor — do not re-litigate, but verify the gaps)
- `approvePtRequest` ([(dashboard)/pt/actions.ts](../../src/app/[locale]/(dashboard)/pt/actions.ts)) originally called the shared `createNotification` helper ([src/lib/notifications/create.ts](../../src/lib/notifications/create.ts)) and got: **`new row violates row-level security policy for table "notifications"`**. The invoice INSERT in the *same* action **succeeded**.
- The fix shipped (`000021_pt_approval_notifications.sql`, `pt_emit_approved_notifications()` SECURITY DEFINER) **bypasses** the INSERT policy and **recomputes** the correct recipient profile ids via joins (`students.profile_id`, `coaches.profile_id`). It is green in CI (19/0). Keep it for now — but it may be masking the cause.
- The INSERT policy (`000015`): `WITH CHECK ( is_staff() AND gym_id = get_user_gym_id() AND recipient_in_gym(user_id, gym_id) )`. The first two predicates are also the guard inside `pt_emit_approved_notifications`, and that guard **passed** — so in that session `is_staff()` and `get_user_gym_id()` evaluate correctly. The differentiator is `recipient_in_gym(user_id, gym_id)`.

---

## ⚙️ Parallel execution model — TWO disjoint workstreams + an integration gate
This task is split into two workstreams that touch **non-overlapping files** and have **no mutual dependency** until the final gate. Run them **concurrently** (two agents, isolated branches/worktrees). The producer investigation must NOT be fanned out further — it is convergent debugging owned entirely by Workstream A.

| | **Workstream A — Producer Root-Cause & Fix** | **Workstream B — Read-Path Verify & Harness** |
|---|---|---|
| **Role** | `build-error-resolver` + `database-reviewer` | `e2e-runner` |
| **Owns (files)** | `src/app/[locale]/(dashboard)/pt/actions.ts`, `src/lib/notifications/create.ts`, `src/lib/supabase/server.ts` (only if World A), new `supabase/migrations/0000XX_*` | `e2e/*.spec.ts`, the notification **bell/consumer** component(s) (surgical `data-testid` only), `e2e/README.md` |
| **Does** | The investigation + the general-path fix below (Steps 0–2 + Fix) | Independently builds the **"recipient SEES the bell"** proof and audits the 6 consumers + realtime — runs against **current `main`** (the `pt_approved`/`pt_assigned` rows already exist via `000021`), so it does NOT wait for A |
| **Branch** | `f2-producer-fix` | `f2-readpath-harness` |
| **Reports to** | `audit-cycle-update.md` sub-heading **"F2-A"** | sub-heading **"F2-B"** |

**Why B is genuine parallel value, not theater:** B independently corroborates A's diagnosis. If B logs in as `student@` and the bell shows `pt_approved` (ids resolve, recipient can read), that's hard evidence the recipient ids are valid → supports **World B** (RLS correctly rejected a bad row), *independent of* A's instrumentation. Agreement across two surfaces = high confidence on a decision that gates all of Phase 1.

**No-collision rule:** A never edits `e2e/`; B never edits the producer/migrations. Both only **append** to `audit-cycle-update.md` under their own sub-heading. Whoever merges second rebases.

**Integration gate (after BOTH finish — A owns it):** merge `f2-readpath-harness` into `f2-producer-fix`, run the **full E2E suite green in CI** against the fixed producer path (B's bell assertions must pass on A's fix), reconcile A's diagnosis with B's corroboration into **one** root-cause verdict, then merge to `main`.

---

## The investigation (Workstream A) — discriminate between these hypotheses with EVIDENCE
Do **not** pick one and fix it. Reproduce the failure, then capture the actual values at the failure point and let them decide. Fastest smoking gun first:

**Step 0 — read the original call site (git archaeology).** `git show <commit-before-000021>:src/app/[locale]/(dashboard)/pt/actions.ts` (the commit prior to `e25363c`). **What exact value was passed as `recipientProfileId` to `createNotification`?** Was it the student/coach **`profile_id`**, or a row id (`students.id` / `coaches.id`) / `coach_id` off the assignment? Record it verbatim.

**Step 1 — reproduce deterministically.** On a throwaway branch, re-wire `approvePtRequest` to call the helper again (or a minimal server action that inserts one notification with the *same* client used for the successful invoice insert), and add temporary logging that, immediately before the failing INSERT and **via the same client**, captures:
- `select auth.uid()` (is the session present?)
- `select is_staff()`, `select get_user_gym_id()`
- the exact `user_id` (recipientProfileId) and `gym_id` being inserted
- `select recipient_in_gym(<that user_id>, <that gym_id>)`
- `select exists(select 1 from profiles where id = <that user_id>)` and that row's `gym_id`

**Step 2 — read which predicate is false** and classify:
- **World B (caller bug — RLS working as designed):** `auth.uid()`/`is_staff()`/`get_user_gym_id()` are all correct, but `recipient_in_gym` is **false** because the `user_id` passed was **not a valid profile id in that gym** (wrong id at the call site). → The substrate is fine; the policy correctly rejected a bad row.
- **World A (auth-context loss — systemic):** `auth.uid()` is **NULL** (or `is_staff()` false / `get_user_gym_id()` null) at the INSERT, i.e. the **Next.js server Supabase client lost the session mid-Server-Action**. → This is bigger than notifications; confirm whether the invoice insert only succeeded because the `invoices` INSERT policy is *more permissive* (read its actual policy — does it require `is_staff()`? If not, the invoice success proves nothing about auth context).
- **World C (other):** e.g. `recipient_in_gym` errors on a missing `EXECUTE` grant, a `search_path` issue, or the gym_id passed ≠ `get_user_gym_id()`. Document precisely.

**State the root cause in one sentence, backed by the captured values.** This is the deliverable that gates everything else.

## The fix (Workstream A) — driven by the evidence, for the GENERAL path (not just PT)
- **If World B:** the helper is sound. Fix the *contract* so a wrong recipient id can't be passed silently — e.g. make `createNotification` accept a typed `recipientProfileId` and/or resolve/validate it, and correct any call sites. Decide & document: **direct `createNotification` from staff server actions is the sanctioned pattern** (RLS is the guardrail), and `pt_emit_approved_notifications` can stay (works) or be simplified to the helper. Prompts 23/24 then use the helper with correct profile ids.
- **If World A:** fix the **server Supabase client** so a Server Action retains auth across multiple writes (correct `supabase-ssr` cookie handling for Next 16 / thread one request-scoped authed client through the whole action — confirm `auth.uid()` is non-null right before each write). Then verify the helper insert succeeds **without** a definer bypass. Decide & document whether definer-RPC emit becomes the standard (defense-in-depth) or the fixed helper is enough. **Audit other server-action writes for the same latent bug** and list any found.
- **If World C:** apply the targeted fix (grant / search_path / id source) and document.

Whatever the world: **do not weaken the notifications RLS.** The `is_staff() + same-gym + recipient_in_gym` policy stays as the guardrail.

## Workstream B — Read-path verify + close the harness coverage hole (runs in parallel, against current `main`)
- The harness must **assert the recipient actually SEES the notification**: extend the E2E suite (a new `e2e/notifications.spec.ts`, so it doesn't collide with `pt.spec.ts` ownership) to **log in as `student@`** and assert the **bell/notifications surface shows `pt_approved`**, and as `coach@` shows `pt_assigned`. The required rows already exist on `main` (created via `000021`), so B does **not** wait for A.
- **Audit the consumer side:** the 6 notification consumers + the bell component + realtime subscription — confirm an authenticated recipient's unread notifications render and the realtime INSERT updates the bell without a refresh. Add surgical `data-testid`s on the bell/list only.
- **Report the corroboration:** does the recipient see the notification on current `main`? (Yes = independent evidence the recipient ids are valid → supports World B.) This feeds A's verdict at the integration gate.
- B keeps the PT slice green; it must not edit producer code or migrations.

## Integration gate (Workstream A owns, after BOTH workstreams finish)
- Merge `f2-readpath-harness` → `f2-producer-fix`; resolve A's diagnosis **and** B's corroboration into **one** root-cause verdict (World A/B/C).
- Run the **full E2E suite green in CI** on the fixed producer path — **B's bell assertions must pass on A's fix** (this is the real proof: producer fix + recipient visibility together). Then merge to `main`.

## Acceptance Criteria
1. **Root cause stated in one sentence with the captured evidence** (Workstream-A Step-1 values + Workstream-B corroboration) — World A/B/C named.
2. The **general** staff→user notification path is fixed/decided accordingly (not just PT), with the **sanctioned pattern written down for Prompts 23/24**.
3. If World A: the server-client auth fix is in, `auth.uid()` confirmed non-null before action writes, and any other affected writes are listed.
4. Harness asserts the **recipient sees the notification** (`pt_approved` for student, `pt_assigned` for coach) on the fixed path; full E2E **green in CI** (report run ID + URL).
5. `tsc` + `next build` clean. Notifications RLS unchanged (not weakened).

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / Phase 0 / Prompt F2 — Notification Producer Root-Cause`, with sub-headings **F2-A** (producer) and **F2-B** (read-path/harness). Include: the Step-0 original-id finding, the Step-1 captured values (table), B's recipient-sees-bell result, the **one-sentence root cause (World A/B/C)**, the fix + the **sanctioned notification pattern for 23/24**, and the integration CI run ID + result. End with an explicit **"Notification producer path: ROOT-CAUSED + FIXED — yes/no"** line.

## Scope discipline & hand-back
Two workstreams investigate/fix the **notification producer path** + close the **read-path/harness** gap only — no Prompt 23 work, no fanning out the producer investigation further. Stop after the integration gate + updating `audit-cycle-update.md`; tell the auditor the root cause (World A/B/C), the sanctioned pattern, and whether other writes are at risk. Next the auditor issues **Prompts 23 + 24 as a parallel `dispatch-mission`** using the now-proven pattern.

---

### Copy-paste pointers — dispatch BOTH in parallel (isolated branches), then the integration gate

**▶ Workstream A — Producer Root-Cause & Fix** (branch `f2-producer-fix`)
```text
You are coding agent A for the PRO LINE Gym Platform (branch f2-producer-fix).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Read in full and execute ONLY "Workstream A" + "The fix (Workstream A)" sections of:
  docs/audit/cycle-5/prompt-F2-notification-producer-rootcause.md

STOP the flow work. ROOT-CAUSE (systematic-debugging, do NOT guess) why createNotification from
a staff Server Action is RLS-rejected — it was worked around with definer RPC 000021. First
`git show` the call site in the commit before e25363c to see exactly what recipientProfileId was
passed (a wrong id like students.id/coaches.id instead of profile_id makes recipient_in_gym()
correctly reject the row = RLS working as designed, NOT a fragile helper). Reproduce and capture
auth.uid(), is_staff(), get_user_gym_id(), the inserted user_id/gym_id, and
recipient_in_gym(user_id,gym_id) at the failure point. Classify World A (Next server client lost
auth mid-action — audit other writes), World B (bad id), or World C. Fix the GENERAL staff->user
path per the evidence; keep the notifications RLS intact; write the sanctioned pattern for 23/24.
You OWN: (dashboard)/pt/actions.ts, lib/notifications/, lib/supabase/server.ts (World A only),
new migrations. Do NOT touch e2e/ (that's Workstream B). Append findings to audit-cycle-update.md
under "F2-A". Then run the integration gate per the doc only AFTER Workstream B reports done:
merge f2-readpath-harness into your branch, get the full E2E suite green in CI, merge to main.
STOP and tell me F2-A is ready for review with the one-sentence root cause.
```

**▶ Workstream B — Read-path Verify & Harness** (branch `f2-readpath-harness`)
```text
You are coding agent B for the PRO LINE Gym Platform (branch f2-readpath-harness).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Read in full and execute ONLY the "Workstream B" section of:
  docs/audit/cycle-5/prompt-F2-notification-producer-rootcause.md

Work against current main — the pt_approved/pt_assigned rows already exist (created by 000021),
so you do NOT wait for Workstream A. Close the harness hole: add e2e/notifications.spec.ts that
logs in as student@ and asserts the notification bell shows pt_approved, and as coach@ shows
pt_assigned (the current PT spec proves approval/roster/decrement but never checks the bell).
Audit the 6 notification consumers + the bell component + the realtime subscription: confirm an
authenticated recipient's unread notifications render and a realtime INSERT updates the bell
without refresh. Add surgical data-testids on the bell/list ONLY. You OWN: e2e/*.spec.ts, the
bell/consumer component(s), e2e/README.md. Do NOT touch producer code or migrations (that's
Workstream A). Report explicitly: does the recipient SEE the notification on current main?
(That corroborates the root cause.) Append to audit-cycle-update.md under "F2-B", push branch
f2-readpath-harness, and tell me F2-B is ready and whether the recipient sees the bell.
```

> **Note:** 2 workstreams → two pointers (not `dispatch-mission`, which your governance reserves for 3+ agents). The real 3-agent `dispatch-mission` fan-out is the NEXT step (Prompts 23 ∥ 24 + 25 integration gate), which the auditor designs once F2 sets the notification pattern.
