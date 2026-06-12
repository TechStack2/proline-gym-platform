# ON-1-S — Identity Adoption Spike (research-only)

> **Spike, not a feature.** Deliverable = this doc. NO migrations applied, NO `src/` changes, NO RLS changes. Branch `prompt-on1-spike` off `main`. Live evidence gathered via a **read-only** Verify-Foundation `run_sql` dispatch (diagnose mode, `apply=false`) — run [`27397254932`](https://github.com/TechStack2/proline-gym-platform/actions/runs/27397254932); the temporary diagnostic block was reverted, so the branch diff is doc-only.

## TL;DR — Recommendation headline

> **Adopt a login-less member by PRE-CREATING the GoTrue auth user with the member's EXISTING `profiles.id` (Option B) — never re-key the profile.** The F1 trigger already does `ON CONFLICT (id) DO NOTHING`, so it NO-OPs on the existing profile; all 8 child FKs stay valid because the profile's id never changes; and 000018 already removed the `profiles.id → auth.users` FK, so the auth user can be deleted later without touching the profile (clean rollback to login-less). The ONE gating unknown is a live confirmation that GoTrue accepts a caller-supplied `id` — **needs a service-role key** (see §Operator inputs). Zero identity-mechanism migration; only an additive `must_change_password` flag (carried in the auth user's `app_metadata`, no schema change) + a middleware gate.

---

## 1. FK dependency map of `profiles.id` — the re-key blast radius

**Source of truth:** migration chain (`grep "REFERENCES profiles"`), **confirmed live** against the cloud DB (chain applied through 000039) via `pg_constraint`. `on_update`/`on_delete` codes: `a`=NO ACTION, `r`=RESTRICT, `c`=CASCADE, `n`=SET NULL, `d`=SET DEFAULT.

| Child table | Child column | ON UPDATE | ON DELETE | Constraint | Migration | Notes if re-keyed |
|---|---|---|---|---|---|---|
| `students` | `profile_id` | **NO ACTION** | CASCADE | `students_profile_id_fkey` | 000002 | core member link |
| `coaches` | `profile_id` | **NO ACTION** | CASCADE | `coaches_profile_id_fkey` | 000002 | coach link |
| `guardians` | `profile_id` | **NO ACTION** | CASCADE | `guardians_profile_id_fkey` | 000002 | B3 guardian = a profile |
| `external_coaches` | `profile_id` | **NO ACTION** | SET NULL | `external_coaches_profile_id_fkey` | 000003 | rentals |
| `notifications` | `user_id` | **NO ACTION** | CASCADE | `notifications_user_id_fkey` | 000032 | swapped auth.users→profiles (FK memory) |
| `invoices` | `payer_profile_id` | **NO ACTION** | **NO ACTION** | `invoices_payer_profile_id_fkey` | 000037 | **financial row; blocks even DELETE** |
| `pt_assignments` | `approved_by` | **NO ACTION** | SET NULL | `pt_assignments_approved_by_fkey` | 000016 | audit "who approved" |
| `account_invites` | `profile_id` | **NO ACTION** | CASCADE | `account_invites_profile_id_fkey` | 000023 | the invite record itself |

**Live confirmation (run 27397254932):**
- 8 FKs reference `public.profiles`; **every one is `on_update = 'a'` (NO ACTION)** — there is NO `ON UPDATE CASCADE` anywhere, so a bare `UPDATE profiles SET id = …` orphans all 8 children and fails the constraint check at statement end.
- `profiles` own FKs = **`profiles_gym_id_fkey` only** → the `profiles_id → auth.users` FK is **gone** (000018 `DROP CONSTRAINT profiles_id_fkey`), live-confirmed.
- `profiles.id` default = **`gen_random_uuid()`**, live-confirmed.
- **80 login-less profiles** currently exist in the cloud DB (profiles with no matching `auth.users` row) — the population ON-1 must serve.

> Indirectly, `profiles.id` is also the value compared by `auth.uid()` throughout RLS (see §5). The 8 FKs are the *referential* blast radius; the RLS equality is the *logical* blast radius.

---

## 2. Option A — re-key the profile (`UPDATE profiles SET id = <new auth id>`)

**Verdict: feasible but heavy and risky — REJECT in favor of B.**

Because all 8 child FKs are **ON UPDATE NO ACTION** (live-confirmed), you cannot simply update the PK. A re-key needs one of:

- **(a) Drop/recreate each FK with `ON UPDATE CASCADE`** — a DDL migration touching 8 constraints (incl. `invoices`, `notifications`, `guardians`), then `UPDATE profiles SET id=Y`. Permanent schema change to financial/audit tables to support a one-time adoption — disproportionate.
- **(b) Make the 8 FKs `DEFERRABLE INITIALLY DEFERRED`**, update parent + 8 children in one txn, commit. Still a DDL change to 8 constraints + a hand-maintained child list that silently rots when FK #9 is added.
- **(c) Insert-new + repoint + delete-old** in one transaction:

```sql
-- A(c): adopt profile X under new auth id Y (sketch, NOT applied)
BEGIN;
  -- Y already exists in auth.users (GoTrue created it with its OWN id)
  INSERT INTO profiles (id, gym_id, first_name_ar, …, phone, …)   -- clone X→Y
    SELECT Y, gym_id, first_name_ar, …, phone, … FROM profiles WHERE id = X;
  UPDATE students          SET profile_id      = Y WHERE profile_id      = X;
  UPDATE coaches           SET profile_id      = Y WHERE profile_id      = X;
  UPDATE guardians         SET profile_id      = Y WHERE profile_id      = X;
  UPDATE external_coaches  SET profile_id      = Y WHERE profile_id      = X;
  UPDATE notifications     SET user_id         = Y WHERE user_id         = X;
  UPDATE invoices          SET payer_profile_id= Y WHERE payer_profile_id= X;
  UPDATE pt_assignments    SET approved_by     = Y WHERE approved_by     = X;
  UPDATE account_invites   SET profile_id      = Y WHERE profile_id      = X;
  DELETE FROM profiles WHERE id = X;
COMMIT;
```

**Risks:** (1) the child list is **schema-coupled** — any future FK to `profiles.id` not added here leaves orphaned rows pointing at the deleted X (silent data loss; same "enumerate the embeds" lesson as B3/000038). (2) Row locks on `invoices`/`notifications` during the txn. (3) `invoices.payer_profile_id` is **ON DELETE NO ACTION**, so the final `DELETE` fails unless every payer row was repointed first — easy to miss. (4) Option A **still requires creating the auth user first** (GoTrue picks id Y), so A = "do B's work, *then* additionally re-key 8 tables." Strictly more surface than B for no gain.

---

## 3. Option B — create the auth user WITH the profile's existing id

**Verdict: RECOMMENDED. Gated on one live confirmation (service-role key).**

**Mechanism:** call GoTrue admin user-creation supplying `id = <existing profile id X>`. The profile is never touched; all 8 FKs stay valid; no re-key.

**The trigger NO-OPs (verified, 000017):**
```sql
-- handle_new_user() fires on auth.users INSERT:
INSERT INTO profiles (id, gym_id, phone, created_at, updated_at)
VALUES (NEW.id, v_gym_id, NEW.phone, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;   -- ← X already exists ⇒ NO-OP, existing profile preserved
```
So creating an auth user with `id = X` does **not** insert a duplicate and does **not** overwrite the member's names/gym. This is the single most important finding: **the current trigger is already Option-B-compatible.** (Contrast: the seed path at 000017:103 uses `ON CONFLICT (id) DO UPDATE` — only the seed overwrites; the runtime trigger does not.)

**API-contract evidence (caller-supplied `id`):** GoTrue's admin create-user (`POST /admin/users`, surfaced as supabase-js `auth.admin.createUser`) accepts an optional `id` in the request body — this is the documented "import users with pre-existing ids" path (GoTrue `adminUserParams` carries an `id` field). Caveat: some supabase-js versions don't surface `id` in the `AdminUserAttributes` TS type; if so, call the REST endpoint directly with the service-role key and `{ "id": "<X>", … }`. **This is the ONE thing to live-confirm before ON-1 is scheduled** (needs a service-role key; §Operator inputs). Marked **"needs live confirmation."**

**Credential shape:** create with **phone + temp password** (`{ id: X, phone, password, phone_confirm: true }`) so it's forward-compatible with G1 phone-OTP (same identity, only the credential type changes). Email is optional (most gym-managed members have only a phone).

**One extra step Option B needs (not a blocker):** login-less profiles have **no `user_roles` row** (`user_roles.user_id` FKs `auth.users`, which they lacked). The RLS helper `get_user_role()` reads `user_roles WHERE user_id = auth.uid()`, so the invite action must **also insert `user_roles(user_id=X, gym_id, role)`** or the member logs in with no role (and `is_staff()`/portal routing break). This is a plain insert, not a migration.

---

## 4. Option C — adoption-at-signup trigger (match login-less profile by phone)

**Verdict: reduces to A or B — REJECT as redundant.**

A trigger that, on `auth.users` INSERT, finds a login-less profile by phone and "adopts" it must reconcile two ids: the new auth row's id `Y` vs the existing profile's id `X`. Its only choices are:
- **Re-key X→Y inside the trigger** = Option A's 8-table blast radius, now executing in the auth-schema INSERT path with no clean transaction boundary over the children and holding locks during signup. Strictly worse than A.
- **Require the auth user to already have id = X** = Option B, at which point the trigger's "adoption" is exactly the existing `ON CONFLICT DO NOTHING` NO-OP — i.e. C *is* B.

So C adds a phone-matching trigger that either re-implements A (worse) or is a no-op wrapper around B. No independent value.

---

## 5. Option D — `profiles.auth_user_id` mapping column

**Verdict: REJECT — full-RLS rewrite, quantified below.**

D abandons the `profiles.id == auth.uid()` invariant and routes every check through a new mapping column. Live blast radius (run 27397254932) + migration-chain grep:

| Assumption site | Count | Source |
|---|---|---|
| RLS policies total | **88** | `pg_policies` (live) |
| …referencing `get_user_gym_id()` (`SELECT gym_id FROM profiles WHERE id = auth.uid()`) | **35** | live |
| …comparing `auth.uid()` directly | **31** | live |
| …referencing `is_staff()` → `get_user_role()` (`… WHERE user_id = auth.uid()`) | **33** | live |
| `auth.uid()` occurrences across migration files | **70** in **14** files | `grep` |
| SECURITY DEFINER helpers hard-coding the equality | **2** (`get_user_gym_id`, `get_user_role`) | 000002 |

Plus the `src` side: middleware (`user_roles … .eq('user_id', user.id)`), every server action doing `.eq('id', user.id)` / `.eq('profile_id', user.id)`, and the avatars storage policy (path stem = `auth.uid()`, 000039). Rewriting all of these to dereference a mapping column is a full RLS + app rewrite with a catastrophic regression surface — **for zero benefit over B**, which preserves the invariant entirely. Reject.

---

## 6. Service-role plumbing design

**Where the privileged call lives.** A Next.js **server action** (or route handler) — never client. Flow:
1. Read the **caller's** session (anon/auth client, cookie JWT) → enforce `is_staff()` **and** same-gym **before any admin call** (re-check by reading the target student's `gym_id` under the caller's RLS, or call a staff-gated RPC). Authz is on the *caller's* token; the service key is used only after the gate passes.
2. Construct a **service-role client** with `SUPABASE_SERVICE_ROLE_KEY` from **server env** (a new `src/lib/supabase/admin.ts` — does not exist today; `src/lib/supabase/` has only `client.ts`/`server.ts`/`middleware.ts`). `createClient(url, SERVICE_ROLE_KEY, { auth: { persistSession: false } })`. **Never** import this into a client component.
3. Do the admin create + `user_roles` insert + `account_invites` upsert.

**Operator must provision:** `SUPABASE_SERVICE_ROLE_KEY` in **Vercel project env (Production + Preview, server-only, not `NEXT_PUBLIC_`)** and in the worktree `.env.local` for local runs. Rotatable; the spike does not need it committed anywhere.

**Temp-pass shown-once flow.** Generate a strong random temp password server-side → return it in the action's result → staff UI shows it **once** (copy-to-clipboard, "the member must change this on first login"). **Never persist the plaintext**; `account_invites` stores only `status`/`channel`/`token`, not the password.

**Forced-change gate (no native Supabase flag).** Supabase/GoTrue has **no built-in "must change password"** flag. Design:
- On invite, set the auth user's **`app_metadata.must_change_password = true`** (admin API; `app_metadata` is server-controlled and rides in the session JWT — readable in middleware with **no extra DB call**).
- **Middleware gate:** after `getUser()`, if `user.app_metadata?.must_change_password` is truthy and the path isn't `/onboarding` (a new route) or `/auth/*`, redirect to `/[locale]/onboarding`. (Slots into the existing redirect block in `src/lib/supabase/middleware.ts`.)
- `/onboarding` collects a new password → `supabase.auth.updateUser({ password })` → a tiny server action clears the flag via the admin API (`updateUserById(X, { app_metadata: { must_change_password: false } })`) → redirect to the role portal. `account_invites.status → 'accepted'`.

---

## 7. Recommendation — Option B, with sketches

### 7a. Migration sketch (additive, **NOT applied**)
The identity mechanism needs **no migration** (the trigger already NO-OPs; FKs untouched). The only optional DB change is convenience, and even that is avoidable:
```sql
-- OPTIONAL / not required: a denormalized flag if you prefer DB over app_metadata.
-- RECOMMENDED: skip this — keep must_change_password in auth app_metadata (JWT),
-- so middleware needs no extra read and there is ZERO schema change for ON-1.
-- ALTER TABLE profiles ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
```
`account_invites` (000023) already exists and is already read by the leads pipeline (`leads-pipeline.tsx` selects `account_invites`), surfaced today as a *simulated* invite. ON-1 makes the invite **real** — no new table.

### 7b. Invite server-action contract
```ts
// src/app/.../actions/invite.ts  (server action; NOT written in this spike)
inviteToPortal({ studentId }: { studentId: string })
  : Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }>

// 1. caller = staff in the student's gym (gate on the CALLER's JWT) else reject
// 2. resolve { profileId: X, phone, gymId } from students→profiles (caller RLS)
// 3. admin (service role):
//      createUser({ id: X, phone, password: temp, phone_confirm: true,
//                   app_metadata: { must_change_password: true } })
//      → F1 trigger ON CONFLICT (id) DO NOTHING ⇒ existing profile preserved
// 4. upsert user_roles(user_id: X, gym_id: gymId, role: 'student' | 'parent')
// 5. upsert account_invites(profile_id: X, student_id: studentId,
//                           channel, status: 'sent')
// 6. return { ok: true, tempPassword: temp }   // shown ONCE, never stored
```

### 7c. Rollback story
Fully reversible, because 000018 removed `profiles.id → auth.users`:
- `auth.admin.deleteUser(X)` removes the auth user. The profile **survives** (no cascade), reverting the member to login-less.
- Delete the `user_roles` row; set `account_invites.status = 'revoked'`.
- No financial/notification/guardian rows are touched at any point (profile id never changed). Contrast Option A, where rollback means re-keying 8 tables *back*.

### 7d. G1 switchover note
Same **"Invite to portal"** button. At G1, swap step 3's temp-password create for **phone-OTP enrollment**: still pre-create the auth user with `id = X` (phone, `phone_confirm`), then the member signs in via OTP instead of temp-pass. The **identity adoption is identical** — Option B is the G1-forward path; only the credential type and the `/onboarding` step change (OTP needs no forced-password-change gate).

---

## Operator inputs (requested)
1. **Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) for the **one** live test that gates ON-1: confirm GoTrue admin create-user accepts a caller-supplied `id` (POST `/admin/users` with `{ id, phone, password, phone_confirm }` → verify the auth user is created with that exact id **and** the F1 trigger NO-OPs, leaving the existing profile intact). Operator fetches it from the Supabase dashboard; use only via local `.env.local` in the worktree; **never commit it**; rotate after the test. Until then, Option B is marked **"needs live confirmation"** (API-contract evidence is strong; this is a belt-and-suspenders proof, not a design risk).
2. For ON-1 implementation: provision `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production + Preview, server-only).

## Evidence index
- Live diagnostic: Verify-Foundation run **27397254932** (read-only, `apply=false`; temp block reverted).
- Migrations cited: 000002 (profiles/students/coaches/guardians/helpers), 000003 (external_coaches), 000004 (`is_staff`, RLS), 000016 (pt approvals), 000017 (F1 trigger `ON CONFLICT DO NOTHING`), 000018 (drop `profiles_id_fkey`, login-less), 000023 (`account_invites`), 000032 (notifications FK→profiles), 000037 (guardians/payer), 000039 (avatars path = `auth.uid()`).
- `src`: `src/lib/supabase/{client,server,middleware}.ts` (no admin client yet), `src/lib/supabase/middleware.ts` (redirect gate), `leads-pipeline.tsx` (reads `account_invites`).
