# CODER PROMPT REG-FIX — class registration fails on the notifications FK (blocking bug)

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-reg-fix` off `main` (≥ `8f0f738`). **Bug fix — blocking real registrations.** Registering a member to a class fails with `insert or update on table "notifications" violates foreign key constraint "notifications_user_id_fkey"`, rolling back the whole registration. Make notification emits resilient — **no behavior change beyond that.**

## Why (root-caused, not guessed)
Repro (from the operator): staff → "Register <member> to a class" → "Register & approve" → **"Registration failed — notifications_user_id_fkey violation."** This is a core **Operate** flow, broken for any gym whose state trips it. Root cause (audited): `request_class_registration` (mig `000034`) emits a **staff** notification via an **un-guarded** insert:
```sql
-- class_requested → staff (owner + receptionist)
INSERT INTO notifications (user_id, …)
SELECT ur.user_id, … FROM user_roles ur
WHERE ur.gym_id = v_class.gym_id AND ur.role IN ('owner','receptionist');
```
A staff `user_role` whose `user_id` is **not in the FK target** (`profiles` — migration `000032` re-pointed `notifications_user_id_fkey` from `auth.users` → `profiles`) makes this insert FK-violate. Unlike the member-side helpers `_notify_class_student` (000034) and `_notify_student_billing` (000031) — which resolve only `profile_id IS NOT NULL` recipients **and** wrap the insert in `EXCEPTION WHEN OTHERS THEN NULL` (best-effort) — this staff emit is **un-guarded**, so its failure **rolls back the registration transaction.** This is the systemic [[notifications-fk-blocks-loginless]] class (also touches D1/C1, `lead_converted`).

## Build — a notification emit must NEVER roll back its parent state change
1. **Guard the staff-notify in `request_class_registration`** — emit only to recipients present in the FK target: add `AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ur.user_id)` to the `user_roles` select, **and** wrap the emit best-effort so it can never abort the registration.
2. **Sweep every other notification insert** in the RPC/trigger layer (`grep -rn "INSERT INTO notifications" supabase/migrations`) for the same un-guarded pattern; apply the **valid-recipient filter + best-effort guard** consistently. The member-side helpers are the reference — mirror them everywhere so **no notification emit can roll back its parent transaction.**
3. **Find + flag the data oddity** — determine *why* a staff role's `user_id` lacks a `profiles` row (orphaned / profile-less staff account). Note it in the drag-read; if there's a clear data cleanup on the live gym, **state it explicitly — do not silently mutate prod data.**
- `CREATE OR REPLACE` the affected functions in a new migration; **apply via Verify-Foundation** (`-f apply=true -f migrations='000065_…'`, confirm **HTTP 201**). Forward-only, additive. **RLS untouched.**

## Out of scope
New notification types/content; the registration business rules (E1 one-open-reg, belt/age gates — keep intact); portal/offline work. Purely: make notification emits non-fatal + correctly targeted.

## Verify (e2e, ephemeral TI gym)
1. **Reproduce the failure then prove the fix:** construct the condition — a gym with an `owner`/`receptionist` `user_role` whose `user_id` has **no `profiles` row** — then **register a member to a class → it SUCCEEDS** (assert the `class_registrations` row + the issued invoice exist; the staff-notify no longer rolls it back).
2. **No regression:** a normal registration (valid staff + member profiles) still emits the staff + member notifications; the existing `notifications.spec` stays green.
3. `/ar` clean; full suite green. **Anchor any new `testMatch`; run the new spec isolated first; bound every wait.**

## Acceptance
1. Registering a member to a class succeeds even when a notification recipient is missing from the FK target; **no notification emit can roll back its parent state change**; green in E2E CI (run ID/URL).
2. Migration via VF (HTTP 201, flagged); RLS untouched; the data oddity flagged in the drag-read.

## Hygiene
Branch `prompt-reg-fix` off `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; never weaken RLS; migration via VF (confirm 201); **DO NOT merge** — report "REG-FIX ready" + CI run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / REG-FIX — registration notifications FK`: the un-guarded emit(s) fixed, the valid-recipient + best-effort pattern, the data-oddity finding (why a staff role lacked a profile), VF run/HTTP 201, CI run ID/URL, an explicit **"register a member to a class succeeds when a notify recipient lacks a profile; no notify rolls back its state change: PASS/FAIL"** line, and a DRAG READ.
