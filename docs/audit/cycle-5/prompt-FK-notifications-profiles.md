# CODER PROMPT FK — Notifications reach login-less members (relax FK → profiles)

> **For:** Coding agent (ONE agent, sequential) · **Issued by:** Project Auditor · **Sequence:** **V1 slice #1** (Phase-1 carried debt). Branch `prompt-fk-notifications` off `main`.
> **Why:** `notifications.user_id` FKs `auth.users`, so **login-less gym-managed members can't receive any notification** — the producer INSERT fails the FK (23503) and is swallowed by the best-effort helpers (23-R's `lead_converted`, D1's `invoice_issued`/`payment_received` to a converted member all silently dropped). This is the prerequisite for **G1 WhatsApp delivery** and all member-facing comms. See [[notifications-fk-blocks-loginless]] + [v1-market-readiness-scope.md](../v1-market-readiness-scope.md).
> Self-contained. **Small migration; the rigor is migration-safety + verification, not scope.**

---

## Role, Skill, Lens
- **Act as `database-reviewer` + `e2e-runner`** (`/Arsenal/ecc/agents/`): `database-reviewer` owns the safe FK swap + integrity; `e2e-runner` proves it (login-less members can't read in-app, so prove via an admin-context existence check).
- **Apply superpower `verification-before-completion`** + `systematic-debugging`: "done" = a notification to a **login-less** member **persists** (admin-asserted) AND no existing notification behavior regresses — green in CI.
- **Lens:** `profiles` is the post-000018 **universal identity**; align the FK with it.

## Strategic context
Closes the Phase-1 carried debt that silently drops member notifications. **V1 must-have #1.** Unblocks G1 (WhatsApp delivery reads these persisted rows server-side) and member comms generally (benchmark: push/comms 1/5 → enables the delivery layer). No benchmark *feature* by itself — it's the substrate fix the next member-facing slices depend on.

## The fix (decided: relax FK → profiles)
1. **Migration `0000XX_notifications_user_fk_profiles.sql`:** drop the existing FK `notifications_user_id_fkey` (→ `auth.users`), add **`FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`**.
2. **Migration safety (mandatory):** existing rows all reference valid profiles (login users have `profiles.id = auth.users.id`), **except** possible orphans whose `user_id` has no `profiles` row. Before adding the constraint, **delete orphan notifications** (`user_id NOT IN (SELECT id FROM profiles)` — they're unreadable anyway) **or** add the FK `NOT VALID` then `VALIDATE CONSTRAINT` and report any failures. Keep `ON DELETE CASCADE`.
3. **Do NOT touch the RLS** (`notifications_select_self`/`update_self`/`insert_staff_same_gym`) — they're correct (`select_self` stays `user_id = auth.uid()`; login-less members read in-app only once provisioned a login — by design, out of scope). `recipient_in_gym` already validates against `profiles`.
4. **No producer/consumer code change needed** — the helpers already insert with the recipient `profile_id`; the FK was the *only* blocker. Confirm the producer no longer needs the best-effort swallow to hide a 23503 (keep best-effort as defensive, but it should no longer fire on login-less recipients).
5. **Do NOT** backfill previously-dropped notifications (forward-only; the durable state — `portal/billing`, the student/membership rows — is the truth). **Do NOT** make `user_id` nullable. **Do NOT** build A4 (real login provisioning) or G1 (WhatsApp) here.

## Verification (login-less can't read in-app → assert persistence in admin context)
In the **ephemeral run gym** (TI harness): convert a lead → a **login-less** member (`profiles.id = gen_random_uuid()`, no `auth.users`) → issue that member an invoice (fires `invoice_issued` to their `profile_id`). Assert via an **admin-context query** (Management API, like the residue checks) that the `invoice_issued` notification **row EXISTS** for that profile — **pre-fix it's absent (FK-rejected); post-fix it's present.** Also confirm **no regression:** the existing login-user notification specs (bell/`/notifications` for `student@`/`coach@`) stay green.

## Acceptance Criteria
1. FK swapped to `profiles(id) ON DELETE CASCADE`; migration applied to the cloud ledger; orphans handled (report count).
2. A notification to a **login-less** member **persists** (admin-asserted in CI; pre/post contrast noted).
3. **No regression** — existing notification specs green; RLS unchanged.
4. `tsc` + `next build` clean. No producer/consumer/RLS code weakened; no `user_id` nullability; no A4/G1 scope.

> **Honesty rule:** verify in CI; if the sandbox can't run the browser, push so `e2e.yml` runs and report the run ID; do not fabricate.

## Hygiene
Scope every `git add` (never `-A`); `node_modules` gitignored; branch `prompt-fk-notifications` off `main`; **dev server on port 3000** (`npm run dev`); use the TI ephemeral-gym + helpers (no raw `:visible`); login `button[type="submit"]`.

## REQUIRED — Update the shared progress file
Append to **`audit-cycle-update.md`**, heading `## Cycle 5 / V1 / FK — Notifications → profiles`. Include: the migration name + orphan count, the **admin-context proof** that a login-less member's notification now persists (pre/post), the no-regression confirmation, the CI run ID/URL, an explicit **"Login-less notification persistence: PASS/FAIL"** line, and a short **DRAG READ**.

## Scope discipline & hand-back
The FK migration + its verification only. No RLS/producer/consumer changes, no A4/G1, no backfill. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next the auditor issues the **admin-UI repairs** slice (classes list/detail/enroll + students search), then **B2** (self-booking + waitlist).

---

### Copy-paste pointer for the coder
```text
You are the coding agent for the PRO LINE Gym Platform.
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-fk-notifications off main (git checkout main && git pull && git checkout -b prompt-fk-notifications).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-FK-notifications-profiles.md

Fix: notifications.user_id FKs auth.users, so login-less gym-managed members can't receive ANY
notification (producer INSERT fails FK 23503, swallowed best-effort). Relax it:
  Migration: drop notifications_user_id_fkey (→auth.users), add FK (user_id) REFERENCES profiles(id)
    ON DELETE CASCADE. Migration-safety: before adding, DELETE orphan notifications whose user_id has no
    profiles row (unreadable anyway) OR add NOT VALID then VALIDATE; report the orphan count.
  Do NOT touch RLS (select_self/update_self/insert_staff_same_gym are correct; recipient_in_gym already
    checks profiles). No producer/consumer code change needed — the FK was the only blocker. Do NOT make
    user_id nullable, do NOT backfill missed notifications, do NOT build real-login (A4) or WhatsApp (G1).
  VERIFY (login-less can't read in-app): in the ephemeral run gym, convert a lead → a login-less member →
    issue them an invoice (fires invoice_issued to their profile_id) → assert via an ADMIN-CONTEXT query
    (Management API, like the residue checks) that the invoice_issued row EXISTS for that profile (pre-fix
    absent, post-fix present). Confirm no regression: existing login-user notification specs stay green.
Verify in the E2E CI run, not tsc; if the sandbox can't run the browser, push so e2e.yml runs and report
the real run ID; do NOT fabricate. Scope every git add (never -A); node_modules gitignored; dev on port
3000; use the TI ephemeral-gym + helpers; don't weaken RLS/auth.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / FK — Notifications → profiles" with the
migration name + orphan count, the admin-context proof (login-less notification persists, pre/post), the
no-regression confirmation, CI run ID/URL, an explicit "Login-less notification persistence: PASS/FAIL"
line, and a short DRAG READ. Then STOP and tell me FK is ready for review.
```
