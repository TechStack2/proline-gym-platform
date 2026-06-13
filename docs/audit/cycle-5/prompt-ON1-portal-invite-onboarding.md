# CODER PROMPT ON-1 — Portal/app invites: account creation, external credential share, forced change + onboarding

> **For:** the MAIN coding agent (mainline) · **Issued by:** Project Auditor · **Sequence:** after GRW-1 merges (branch `prompt-on1-invite` off post-GRW-1 `main`). **Design is FULLY SPEC'D in the spike — follow it:** [`../on1-identity-adoption-spike.md`](../on1-identity-adoption-spike.md) (Option B ratified, server-action contract §7b, forced-change gate §6, rollback §7c). Client demo §3 elevated the scope: **members AND team (staff/coaches)**.

## Strategic context
The Proline owners asked almost verbatim: staff create accounts for members and team, **share the login externally**, member changes the password and goes through **a designed onboarding/orientation**. 80 login-less profiles exist today. This is the auth-touching slice — the spike de-risked it; implement exactly Option B, do not re-decide the mechanism.

## ⚠️ Gating dependency (operator-provided, confirm BEFORE building deep)
- `SUPABASE_SERVICE_ROLE_KEY` must be: (a) a **GitHub Actions secret** (so the e2e webServer can run the invite action), (b) in Vercel/**Railway** prod+preview server env, (c) in your worktree `.env.local`. **If it's missing, STOP and tell the operator** — the slice cannot be verified without it.
- **STEP 0 — live-confirm the one open unknown** (spike §3): with the service-role key, prove GoTrue admin create-user accepts a **caller-supplied `id`** — `POST /admin/users` (or `auth.admin.createUser`) with `{ id: <existing profile id>, phone, password, phone_confirm: true, app_metadata: { must_change_password: true } }` → verify the auth user is created with that exact id AND the F1 trigger (000017 `ON CONFLICT (id) DO NOTHING`) left the existing profile intact (names/gym unchanged). If supabase-js's TS type omits `id`, call the REST endpoint directly. Report the result. If GoTrue rejects a supplied id, STOP and report — do NOT fall back to Option A (re-key) without auditor sign-off.

## Build (Option B — zero identity migration)

### 1. Service-role plumbing (spike §6)
- New `src/lib/supabase/admin.ts`: `createClient(url, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`. **Server-only** — never imported by a client component (add a guard/comment).
- The invite is a **server action** that gates on the **caller's** JWT (`is_staff()` + the target's `gym_id` == caller's gym, checked under the caller's RLS) **before** any admin call. The service key is used only after the gate passes.

### 2. Invite action (spike §7b contract) — members AND team
`inviteToPortal({ profileId | studentId | coachId, role })`:
1. Caller = staff in the target's gym, else reject.
2. Resolve `{ profileId X, phone, gymId, role }` (role ∈ student/parent/coach/head_coach/receptionist — derive from the person's existing record; the demo wants team invites too).
3. Admin: `createUser({ id: X, phone, password: <strong random temp>, phone_confirm: true, app_metadata: { must_change_password: true } })` → trigger NO-OPs on the existing profile.
4. **Upsert `user_roles(user_id: X, gym_id, role)`** — login-less profiles have none; without this `get_user_role()`/`is_staff()`/routing break (spike §3).
5. Upsert `account_invites(profile_id: X, …, channel, status: 'sent')` (the 000023 table — make the simulated invite real; no new table).
6. Return `{ ok: true, tempPassword }` — shown **once**, **never persisted**.
Idempotent/re-invite: if an auth user for X already exists, regenerate the temp password (admin `updateUserById`) + re-arm `must_change_password` rather than erroring.

### 3. External credential share
Staff UI (Member-360 header + the coach/team record): "Invite to portal/app" → on success show the temp password **once** (copy button) + a **WhatsApp share action** (`wa.me` deep-link, prefilled localized message with login + temp password + a one-line "change it on first login"). This is the G1-bridge pattern (no API needed); G1 later automates it.

### 4. Forced-change gate + onboarding (spike §6)
- **Middleware:** after `getUser()`, if `user.app_metadata?.must_change_password` and the path isn't `/[locale]/onboarding` or `/auth/*`, redirect to `/[locale]/onboarding`. (Slot into the existing redirect block in `src/lib/supabase/middleware.ts` — no extra DB read; the flag rides the JWT.)
- **`/[locale]/onboarding`** — a per-role first-login wizard (reuse the UX-2 `FormWizard`): step 1 set new password (`auth.updateUser({ password })`); step 2 language preference; step 3 avatar (reuse the ADM-2 upload, optional); step 4 a short role-specific orientation (members: how to see schedule/PT/billing; coaches: today/attendance/PT roster). On finish: a tiny server action clears the flag (`admin.updateUserById(X, { app_metadata: { must_change_password: false } })`) + sets `account_invites.status='accepted'` → redirect to the role's home. Arabic-first, RTL, design-system styled.

### 5. TI teardown (don't leak auth users)
The e2e provisions an ephemeral gym; invited **auth users** created during a run must be cleaned up. Extend the teardown (or the invite e2e) to `auth.admin.deleteUser` the run's created users (rollback per spike §7c — the profile survives, which is correct). Verify the run gym leaves no orphan auth users.

## Out of scope
Option A/C/D (rejected in the spike); phone-OTP (G1 — but keep the create phone-shaped so G1 is a credential swap, spike §7d); email invites; self-signup; any of the 8-FK re-key.

## Verify (e2e, ephemeral TI gym — needs the service-role key in CI)
1. **Member invite round-trip:** staff invite a seeded login-less member → action returns a temp password → a NEW browser context signs in with phone+temp → **redirected to /onboarding** → set password + finish → lands in the **member portal** with the correct role and can see their own data (RLS intact — the adopted `auth.uid()` == profile id, so all existing policies just work). Assert the wa.me share link is present with the prefilled message.
2. **Team invite:** invite a seeded coach → onboarding → lands in the **coach app** with coach role (proves the elevated scope + role routing).
3. **Identity integrity:** after adoption, the member's existing invoices/registrations/guardian links still resolve on their file (profile id never changed — assert one pre-existing row still visible to them).
4. **Re-invite idempotency:** inviting an already-invited member regenerates the temp password without error/duplicate.
5. **No leak:** teardown removes the created auth users (assert none orphaned for the run gym).
6. Full suite green — no regression (GRW-1's count + ON-1 tests).

## Acceptance
1. STEP-0 live confirmation reported (GoTrue accepts supplied id + trigger NO-OP proven).
2. The five proofs green in E2E CI (run ID/URL); `database-reviewer`: caller-gated before service-role use, `user_roles` inserted, RLS unchanged and still correct for the adopted user, no identity migration, service client server-only.
3. Temp password never persisted; forced-change gate works; onboarding per-role; rollback (deleteUser → profile survives) demonstrated by teardown.
4. i18n ar/en/fr; RTL; design-system; `tsc`+`build` clean.

## Hygiene
Branch `prompt-on1-invite` off post-GRW-1 `main`; **dev port 3000**; scoped `git add` + `git show --stat`; **no Claude/Co-Authored-By trailer**; TI ephemeral gym; **never commit the service-role key**; never weaken RLS; stay on your branch.

## Update the progress file
Append to `audit-cycle-update.md` → `## Cycle 5 / V1 / ON-1 — Portal invites + onboarding`: the STEP-0 result, the service-action/gate design as built, the team-invite role routing, teardown cleanup, CI run ID/URL, an explicit **"Invite → external share → forced change → onboarding → correct portal, identity intact: PASS/FAIL"** line, and a DRAG READ.

## Hand-back
This slice only. Stop after updating `audit-cycle-update.md`; report PASS/FAIL. Next: **G1 WhatsApp** (channel abstraction; the wa.me bridge actions docked across surfaces + the per-gym API toggle).

---

### Copy-paste activation block for the MAINLINE coder (hand off ONLY after the auditor confirms GRW-1 is merged AND the operator confirms SUPABASE_SERVICE_ROLE_KEY is set)
```text
You are the MAIN coding agent for the PRO LINE Gym Platform (mainline track).
Working directory: /Users/techstack/Desktop/Agentics/Projects/proline-gym-platform

Branch prompt-on1-invite off main (git checkout main && git pull && git checkout -b prompt-on1-invite
— main must contain GRW-1; verify the campaigns table exists before starting).
Read in full and execute exactly:
  docs/audit/cycle-5/prompt-ON1-portal-invite-onboarding.md
design (FOLLOW, do not re-decide): docs/audit/on1-identity-adoption-spike.md (Option B; §6 gate, §7b contract, §7c rollback)

AUTH-TOUCHING SLICE. GATING DEP: SUPABASE_SERVICE_ROLE_KEY must be a GitHub Actions secret + Railway/
Vercel server env + your .env.local — if missing, STOP and tell the operator.
STEP 0 (before building deep): with the service-role key, live-confirm GoTrue admin create-user accepts
a caller-supplied id — POST /admin/users (or auth.admin.createUser) { id: <existing profile id>, phone,
password, phone_confirm:true, app_metadata:{must_change_password:true} } → verify the user has that exact
id AND the F1 trigger (000017 ON CONFLICT DO NOTHING) left the existing profile intact. If supabase-js's
type omits id, call REST directly. If GoTrue REJECTS a supplied id, STOP and report — do NOT fall back to
re-key without auditor sign-off.
Build (Option B, ZERO identity migration): (1) src/lib/supabase/admin.ts — service-role client, SERVER-
ONLY. (2) inviteToPortal server action (members AND team): gate on the CALLER's JWT (is_staff() + target
in caller's gym) BEFORE any admin call → admin createUser({id:X, phone, temp password, phone_confirm,
app_metadata:{must_change_password:true}}) → UPSERT user_roles(user_id:X, gym_id, role) [login-less
profiles have none — required or routing breaks] → upsert account_invites (000023, make the simulated
invite real) → return {ok,tempPassword} shown ONCE, never persisted; re-invite regenerates temp pw
idempotently. (3) External share: Member-360 + team record "Invite" → show temp pw once (copy) + wa.me
share deep-link (prefilled localized login+temp+change-on-first-login). (4) Forced-change gate: middleware
redirects must_change_password users to /[locale]/onboarding (slot into existing redirect block, JWT flag,
no extra read); /onboarding = FormWizard (set password → language → avatar(optional, ADM-2 upload) →
role orientation) → clear flag via admin updateUserById + account_invites.status='accepted' → role home.
(5) TI teardown: auth.admin.deleteUser the run's created users (profile survives — correct rollback); no
orphan auth users. i18n ar/en/fr, RTL, design-system, Arabic-first.
Verify in the E2E CI run, not tsc (needs the service-role key in CI): member invite → temp login → forced
/onboarding → set password+finish → member portal with correct role + own data visible (RLS intact) + wa.me
link present; team invite (coach) → coach app with coach role; identity integrity (a pre-existing invoice/
registration still resolves on the adopted member's file); re-invite idempotent; teardown leaves no orphan
auth users; FULL suite green (no regression). If the sandbox can't run the browser, push so e2e.yml runs
and report the run ID; do NOT fabricate. Dev port 3000; scoped git add + git show --stat; NEVER commit the
service-role key; no Claude/Co-Authored-By trailer; never weaken RLS; stay on your branch.
When done, append to audit-cycle-update.md under "Cycle 5 / V1 / ON-1 — Portal invites + onboarding": the
STEP-0 result, service-action/gate design, team role routing, teardown cleanup, CI run ID/URL, an explicit
"Invite → external share → forced change → onboarding → correct portal, identity intact: PASS/FAIL" line,
and a DRAG READ. Then STOP and tell me ON-1 is ready for review.
```
